import { prisma } from "@/lib/prisma";
import { sendTextMessage, sendInteractiveListMessage } from "@/lib/meta";
import { toMetaConfig, getEligibleAgentIdsForConversationId } from "@/lib/whatsapp-numbers";
import { broadcastToAgents } from "@/lib/sse";
import { notifyCrm } from "@/lib/crm-notify";
import { getCrmLeadContext, type CrmLeadContext } from "@/lib/crm-lead-context";
import { postCrmGoalCapture } from "@/lib/crm-goal-capture";
import type { WhatsappNumber, Conversation, Contact } from "@prisma/client";

// Must exactly match the CRM's App\Enums\LeadGoal ->value strings — the
// WhatsApp interactive list's row `id`s ARE these literal values, matched
// exactly on the way back in, so no translation table is needed between
// the two apps. See the CRM's app/Enums/LeadGoal.php.
const GOAL_OPTIONS = [
  { id: "generate_leads", title: "Generate More Leads" },
  { id: "rank_higher", title: "Rank Higher on Google" },
  { id: "grow_business", title: "Grow My Business Online" },
  { id: "not_sure", title: "Not Sure", description: "Need expert advice" },
] as const;

// Must exactly match the CRM's App\Enums\LeadBudgetRange ->value strings —
// same "row id IS the literal enum value" contract as GOAL_OPTIONS above.
// See the CRM's app/Enums/LeadBudgetRange.php.
const BUDGET_OPTIONS = [
  { id: "under_3000", title: "Under ₹3,000" },
  { id: "3000_6000", title: "₹3,000 – ₹6,000" },
  { id: "6000_12000", title: "₹6,000 – ₹12,000" },
  { id: "12000_plus", title: "₹12,000+" },
] as const;

// Deliberately permissive -- a lead texting back their link rarely bothers
// with the http(s) scheme, so a bare domain counts too. Good enough for
// "did they actually share something link-shaped," not a full RFC 3986
// validator; the CRM's own `url` validation rule is the real gate before
// this ever reaches a stored field a human clicks.
const URL_LIKE_PATTERN = /(https?:\/\/\S+)|([a-z0-9-]+\.(com|in|co|org|net|business\.site)\S*)/i;

/** Lowercase, trim, collapse whitespace -- just enough to compare a typed reply against an option's own title. */
function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * A real gap, lead #445 (Babban Verama, 2026-09-17): WhatsApp only reports
 * `interactiveReplyId` when the client actually renders and taps the list/
 * button -- some clients (or a lead who just types instead of tapping)
 * send the answer back as plain text instead, byte-identical to the
 * option's own title ("Grow My Business Online"). The old code required a
 * real tap and silently gave up otherwise, discarding an unambiguous
 * answer. Falls back to an EXACT normalized match against the option's
 * title -- deliberately not a substring/contains match, since the budget
 * options overlap on their numbers ("Under ₹3,000" vs "₹3,000 – ₹6,000")
 * and a loose match there could misfile a reply into the wrong band.
 */
function resolveOptionId<T extends { id: string; title: string }>(
  options: readonly T[],
  interactiveReplyId: string | null,
  content: string
): string | null {
  if (interactiveReplyId && options.some((o) => o.id === interactiveReplyId)) {
    return interactiveReplyId;
  }

  const normalizedContent = normalizeForCompare(content);
  const textMatch = options.find((o) => normalizeForCompare(o.title) === normalizedContent);

  return textMatch?.id ?? null;
}

/**
 * The lead-goal capture flow (NEDS CRM's CLAUDE.md, 2026-09-08) ported to
 * WhatsApp -- asks the same "biggest goal" question the CRM's telecaller UI
 * asks live on a call, for a lead who only ever messages and never gets a
 * call. Deterministic, no Anthropic call: the question is a fixed
 * template, the goal/budget answer is matched off the WhatsApp interactive
 * list's own row id (exact match on what the lead tapped, never inferred
 * from free text), and the link-capture step is a plain regex, not an LLM
 * judgment call -- keeps this flow reliable and free to run on every
 * eligible after-hours reply.
 *
 * Extended 2026-09-17 with a third step, budget capture, chained onto the
 * same aiFlowPending state machine as goal/link ("goal" -> "link" (only for
 * a goal that needs one) -> "budget" (only if still missing) -> done) --
 * same shape, not a new pattern. GenerateLeadRecommendation on the CRM side
 * needs BOTH goal and budget_range to resolve a priced offer, so a lead
 * that only ever got asked its goal never reaches one; this closes that
 * gap for leads whose budget was never captured at import time either
 * (see App\Jobs\ImportMetaLead::matchBudgetRange(), untouched by this).
 *
 * Called from maybeReplyWithAi() (ai-assistant.ts) after all of its
 * existing guards (aiMuted, opted-out, business-hours/AI-live, cooldown)
 * already passed -- this flow shares that exact gating, it does not
 * duplicate or loosen it. Only ever applies to a phone number the CRM
 * already recognises as an open Lead (an existing client, or a number the
 * CRM has never seen, gets `found: false` and this returns false
 * immediately) -- see getCrmLeadContext().
 *
 * Returns true if this turn was fully handled (a message was sent) -- the
 * caller should NOT also run the normal FAQ/discovery-question reply this
 * turn. Returns false if there's nothing for this flow to do, so the
 * caller's existing Claude-drafted reply proceeds unchanged.
 */
export async function maybeRunGoalFlow(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact,
  content: string,
  interactiveReplyId: string | null
): Promise<boolean> {
  const leadContext = await getCrmLeadContext(contact.phone);
  if (!leadContext || !leadContext.found) return false;

  if (conversation.aiFlowPending === "goal") {
    return handleGoalAnswer(whatsappNumber, conversation, contact, content, interactiveReplyId, leadContext);
  }

  if (conversation.aiFlowPending === "link") {
    return handleLinkAnswer(whatsappNumber, conversation, contact, content, leadContext);
  }

  if (conversation.aiFlowPending === "budget") {
    return handleBudgetAnswer(whatsappNumber, conversation, contact, content, interactiveReplyId);
  }

  // Nothing pending -- ask, but only the very first time (any channel) a
  // Lead is still missing the relevant field. Goal always comes first when
  // both are missing (the common case for most ad forms) so the two
  // questions never interleave; a lead that already has a goal but no
  // budget skips straight to the budget question instead of re-asking goal.
  if (leadContext.goal == null || leadContext.budgetRange == null) {
    // Real incident, lead #446 (Babban Verama, 2026-09-17): the CRM had
    // JUST sent its own automated welcome/check-in template asking "what's
    // a good time to call?" (a completely separate mechanism -- see
    // SendLeadWelcomeMessageJob on the CRM side) moments before this
    // person's first-ever reply on this conversation ("Yes, call me").
    // With no awareness of that, this flow treated the reply as a blank
    // opener and fired the goal question on top of an unrelated one,
    // confusing a person who'd just answered something else entirely. If
    // this is the very first inbound message on this conversation AND we
    // already sent them something recently, assume the reply is about
    // THAT, not a fresh conversation -- skip this turn and let the normal
    // Claude-drafted reply (which sees the full history, welcome message
    // included) respond in context instead. The goal/budget ask simply
    // resumes normally on their NEXT message, when that ambiguity is gone.
    if (await isFirstReplyToOurOwnRecentMessage(conversation.id)) {
      return false;
    }

    if (leadContext.goal == null) {
      return askGoalQuestion(whatsappNumber, conversation, contact, leadContext.name ?? contact.name);
    }

    return askBudgetQuestion(whatsappNumber, conversation, contact);
  }

  return false;
}

/**
 * True only when (a) this is the FIRST inbound message this conversation
 * has ever received, and (b) we already sent at least one outbound message
 * (any kind -- a template push from the CRM, a manual agent reply, etc.)
 * before it, within the last 24 hours. Deliberately local/synchronous
 * (wadesk's own `message` table), not a round trip to the CRM -- the CRM's
 * own "awaiting a reply" signal is derived from Notes that a separate,
 * independent push (notifyCrm(), fire-and-forget) has to land first, a real
 * race with this exact check that a live incident already confirmed isn't
 * safe to depend on.
 */
async function isFirstReplyToOurOwnRecentMessage(conversationId: string): Promise<boolean> {
  const inboundCount = await prisma.message.count({
    where: { conversationId, direction: "INBOUND" },
  });

  // The triggering message itself is already persisted by the time this
  // runs (see api/webhook/route.ts) -- exactly 1 means it's the only one.
  if (inboundCount !== 1) return false;

  const recentOutbound = await prisma.message.findFirst({
    where: {
      conversationId,
      direction: "OUTBOUND",
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  return recentOutbound !== null;
}

async function askGoalQuestion(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact,
  greetingName: string | null
): Promise<boolean> {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { aiFlowPending: "goal" },
  });

  const body = greetingName
    ? `Hi ${greetingName}, thanks for reaching out to Niranjan Enterprises Digital Solutions! To help you best, what's your biggest goal right now?`
    : `Thanks for reaching out to Niranjan Enterprises Digital Solutions! To help you best, what's your biggest goal right now?`;

  await sendAndPersist(whatsappNumber, conversation, contact, body, () =>
    sendInteractiveListMessage(toMetaConfig(whatsappNumber), contact.phone, body, "Choose one", GOAL_OPTIONS)
  );

  return true;
}

async function handleGoalAnswer(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact,
  content: string,
  interactiveReplyId: string | null,
  leadContext: CrmLeadContext
): Promise<boolean> {
  const matchedId = resolveOptionId(GOAL_OPTIONS, interactiveReplyId, content);

  if (!matchedId) {
    // Didn't tap a recognised option, and the typed text doesn't exactly
    // match an option's title either -- give up gracefully rather than
    // asking again on every future message. Let the normal reply flow take
    // this turn.
    await prisma.conversation.update({ where: { id: conversation.id }, data: { aiFlowPending: null } });
    return false;
  }

  await postCrmGoalCapture({ phone: contact.phone, goal: matchedId });

  if (matchedId === "not_sure") {
    const text =
      "Thanks! I've let our Sales Expert know — they'll reach out to you shortly to help directly.";
    await sendAndPersist(whatsappNumber, conversation, contact, text, () =>
      sendTextMessage(toMetaConfig(whatsappNumber), contact.phone, text)
    );

    // No link needed for Not Sure (LeadGoal::needsWebsiteOrGbp() is false),
    // so budget is the next and final step in the chain, same "still
    // missing? ask; otherwise done" rule as every other transition here.
    if (leadContext.budgetRange == null) {
      return askBudgetQuestion(whatsappNumber, conversation, contact);
    }
    await prisma.conversation.update({ where: { id: conversation.id }, data: { aiFlowPending: null } });
    return true;
  }

  await prisma.conversation.update({ where: { id: conversation.id }, data: { aiFlowPending: "link" } });
  const text = "Great! Could you share your Website URL or Google Business Profile link so our team can take a look?";
  await sendAndPersist(whatsappNumber, conversation, contact, text, () =>
    sendTextMessage(toMetaConfig(whatsappNumber), contact.phone, text)
  );
  return true;
}

async function handleLinkAnswer(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact,
  content: string,
  leadContext: CrmLeadContext
): Promise<boolean> {
  const match = content.match(URL_LIKE_PATTERN);

  if (!match) {
    // Nothing link-shaped in the reply -- don't nag for it a second time,
    // and don't chain into the budget question either (they may be
    // replying to something else entirely); let the normal reply flow
    // handle whatever they actually said.
    await prisma.conversation.update({ where: { id: conversation.id }, data: { aiFlowPending: null } });
    return false;
  }

  const url = match[0].startsWith("http") ? match[0] : `https://${match[0]}`;
  await postCrmGoalCapture({ phone: contact.phone, websiteUrl: url });

  const text = "Got it, thank you! Our team will take a look and follow up with you soon.";
  await sendAndPersist(whatsappNumber, conversation, contact, text, () =>
    sendTextMessage(toMetaConfig(whatsappNumber), contact.phone, text)
  );

  if (leadContext.budgetRange == null) {
    return askBudgetQuestion(whatsappNumber, conversation, contact);
  }
  await prisma.conversation.update({ where: { id: conversation.id }, data: { aiFlowPending: null } });
  return true;
}

async function askBudgetQuestion(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact
): Promise<boolean> {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { aiFlowPending: "budget" },
  });

  const body = "One more thing — what's your approximate monthly marketing budget?";

  await sendAndPersist(whatsappNumber, conversation, contact, body, () =>
    sendInteractiveListMessage(toMetaConfig(whatsappNumber), contact.phone, body, "Choose one", BUDGET_OPTIONS)
  );

  return true;
}

async function handleBudgetAnswer(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact,
  content: string,
  interactiveReplyId: string | null
): Promise<boolean> {
  const matchedId = resolveOptionId(BUDGET_OPTIONS, interactiveReplyId, content);

  await prisma.conversation.update({ where: { id: conversation.id }, data: { aiFlowPending: null } });

  if (!matchedId) {
    // Same "give up gracefully, don't re-ask" rule as the goal step above.
    return false;
  }

  await postCrmGoalCapture({ phone: contact.phone, budgetRange: matchedId });

  const text = "Perfect, thank you! Our team will review this and follow up with the best next step for you.";
  await sendAndPersist(whatsappNumber, conversation, contact, text, () =>
    sendTextMessage(toMetaConfig(whatsappNumber), contact.phone, text)
  );
  return true;
}

/**
 * Sends, persists, forwards to the CRM timeline, and broadcasts to
 * connected agents -- the same four steps ai-assistant.ts's own normal
 * reply path performs after generateAiReply() returns text, kept as a
 * separate small copy here (rather than an extracted shared helper)
 * because the two call sites' Meta-send step genuinely differs (plain text
 * vs. interactive list) and this repo has no test suite to catch a
 * shared-helper regression across both paths -- a self-contained new file
 * is the lower-risk choice for a feature this size.
 */
async function sendAndPersist(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact,
  contentForRecord: string,
  send: () => Promise<{ messageId: string }>
): Promise<void> {
  const result = await send();

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      content: contentForRecord,
      metaMessageId: result.messageId ?? null,
      status: "SENT",
      sentByAgentId: null,
      sentByAi: true,
    },
  });

  const updatedConversation = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
    include: { contact: true, assignees: { include: { agent: true } } },
  });

  notifyCrm({
    phone: contact.phone,
    contactName: contact.name,
    message: contentForRecord,
    conversationId: conversation.id,
    whatsappNumber,
    messageId: message.id,
    direction: "outbound",
    senderType: "ai",
  });

  const eligibleAgentIds = await getEligibleAgentIdsForConversationId(conversation.id);
  broadcastToAgents(eligibleAgentIds, "new-message", {
    conversationId: conversation.id,
    message,
    conversation: updatedConversation,
  });
  broadcastToAgents(eligibleAgentIds, "conversation-updated", {
    conversation: updatedConversation,
  });
}
