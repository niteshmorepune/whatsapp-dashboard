import { prisma } from "@/lib/prisma";
import { sendTextMessage, sendInteractiveListMessage } from "@/lib/meta";
import { toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
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
const GOAL_IDS = new Set<string>(GOAL_OPTIONS.map((o) => o.id));

// Must exactly match the CRM's App\Enums\LeadBudgetRange ->value strings —
// same "row id IS the literal enum value" contract as GOAL_OPTIONS above.
// See the CRM's app/Enums/LeadBudgetRange.php.
const BUDGET_OPTIONS = [
  { id: "under_3000", title: "Under ₹3,000" },
  { id: "3000_6000", title: "₹3,000 – ₹6,000" },
  { id: "6000_12000", title: "₹6,000 – ₹12,000" },
  { id: "12000_plus", title: "₹12,000+" },
] as const;
const BUDGET_IDS = new Set<string>(BUDGET_OPTIONS.map((o) => o.id));

// Deliberately permissive -- a lead texting back their link rarely bothers
// with the http(s) scheme, so a bare domain counts too. Good enough for
// "did they actually share something link-shaped," not a full RFC 3986
// validator; the CRM's own `url` validation rule is the real gate before
// this ever reaches a stored field a human clicks.
const URL_LIKE_PATTERN = /(https?:\/\/\S+)|([a-z0-9-]+\.(com|in|co|org|net|business\.site)\S*)/i;

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
    return handleGoalAnswer(whatsappNumber, conversation, contact, interactiveReplyId, leadContext);
  }

  if (conversation.aiFlowPending === "link") {
    return handleLinkAnswer(whatsappNumber, conversation, contact, content, leadContext);
  }

  if (conversation.aiFlowPending === "budget") {
    return handleBudgetAnswer(whatsappNumber, conversation, contact, interactiveReplyId);
  }

  // Nothing pending -- ask, but only the very first time (any channel) a
  // Lead is still missing the relevant field. Goal always comes first when
  // both are missing (the common case for most ad forms) so the two
  // questions never interleave; a lead that already has a goal but no
  // budget skips straight to the budget question instead of re-asking goal.
  if (leadContext.goal == null) {
    return askGoalQuestion(whatsappNumber, conversation, contact, leadContext.name ?? contact.name);
  }

  if (leadContext.budgetRange == null) {
    return askBudgetQuestion(whatsappNumber, conversation, contact);
  }

  return false;
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
    ? `Hi ${greetingName}, thanks for reaching out to NEDS Enterprises! To help you best, what's your biggest goal right now?`
    : `Thanks for reaching out to NEDS Enterprises! To help you best, what's your biggest goal right now?`;

  await sendAndPersist(whatsappNumber, conversation, contact, body, () =>
    sendInteractiveListMessage(toMetaConfig(whatsappNumber), contact.phone, body, "Choose one", GOAL_OPTIONS)
  );

  return true;
}

async function handleGoalAnswer(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact,
  interactiveReplyId: string | null,
  leadContext: CrmLeadContext
): Promise<boolean> {
  const matchedId = interactiveReplyId && GOAL_IDS.has(interactiveReplyId) ? interactiveReplyId : null;

  if (!matchedId) {
    // Didn't tap a recognised option (a WhatsApp client that can't render
    // interactive lists, or they just said something else entirely) --
    // give up gracefully rather than asking again on every future message.
    // Let the normal reply flow take this turn.
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
  interactiveReplyId: string | null
): Promise<boolean> {
  const matchedId = interactiveReplyId && BUDGET_IDS.has(interactiveReplyId) ? interactiveReplyId : null;

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

  const eligibleAgentIds = await getAgentIdsWithNumberAccess(whatsappNumber.id);
  broadcastToAgents(eligibleAgentIds, "new-message", {
    conversationId: conversation.id,
    message,
    conversation: updatedConversation,
  });
  broadcastToAgents(eligibleAgentIds, "conversation-updated", {
    conversation: updatedConversation,
  });
}
