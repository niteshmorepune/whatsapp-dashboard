import { prisma } from "@/lib/prisma";
import type { MetaNumberConfig } from "@/lib/meta";
import type { WhatsappNumber } from "@prisma/client";

export function toMetaConfig(number: WhatsappNumber): MetaNumberConfig {
  return { phoneNumberId: number.phoneNumberId, accessToken: number.accessToken };
}

export function getNumberById(id: string) {
  return prisma.whatsappNumber.findUnique({ where: { id } });
}

/** Resolves an inbound Meta webhook's `metadata.phone_number_id` to our row. */
export function getNumberByPhoneNumberId(phoneNumberId: string) {
  return prisma.whatsappNumber.findUnique({ where: { phoneNumberId } });
}

/** ADMIN sees every line; AGENT sees only lines explicitly granted via AgentWhatsappNumber. */
export async function getAgentAccessibleNumberIds(
  agentId: string,
  role: string
): Promise<string[]> {
  if (role === "ADMIN") {
    const all = await prisma.whatsappNumber.findMany({ select: { id: true } });
    return all.map((n) => n.id);
  }
  const grants = await prisma.agentWhatsappNumber.findMany({
    where: { agentId },
    select: { whatsappNumberId: true },
  });
  return grants.map((g) => g.whatsappNumberId);
}

/** Every agent (ADMIN + granted AGENTs) allowed to see a given line — used to scope SSE/push fan-out. */
export async function getAgentIdsWithNumberAccess(whatsappNumberId: string): Promise<string[]> {
  const [admins, grants] = await Promise.all([
    prisma.agent.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } }),
    prisma.agentWhatsappNumber.findMany({ where: { whatsappNumberId }, select: { agentId: true } }),
  ]);
  return Array.from(new Set([...admins.map((a) => a.id), ...grants.map((g) => g.agentId)]));
}

export async function agentHasAccessToNumber(
  agentId: string,
  role: string,
  whatsappNumberId: string
): Promise<boolean> {
  if (role === "ADMIN") return true;
  const grant = await prisma.agentWhatsappNumber.findUnique({
    where: { agentId_whatsappNumberId: { agentId, whatsappNumberId } },
  });
  return grant !== null;
}

/**
 * A crmManaged (owner/telecaller-synced) or MANUAL assignee has no
 * coverUntil at all and always counts. A temporary leave-cover row (see
 * POST /api/leads/set-cover) only counts while coverUntil is still in the
 * future — once the CRM's own leave request ends, its next sync recomputes
 * coverUntil to "now," and even before that next sync runs the row simply
 * stops counting here the moment real time passes it. No separate "revoke"
 * step needed on either side.
 */
function isAssigneeActive(a: { coverUntil?: Date | null }): boolean {
  return a.coverUntil == null || a.coverUntil.getTime() > Date.now();
}

/** Same rule as isAssigneeActive(), expressed as a Prisma where-fragment for a ConversationAssignee row. Built per call — a module-level `new Date()` froze "now" at server start, so a leave-cover that expired after a restart kept counting as active in the list query. */
const activeAssigneeWhere = () => ({ OR: [{ coverUntil: null }, { coverUntil: { gt: new Date() } }] });

/**
 * The line fields every visibility check reads. Select this (not just
 * restrictToOwnLeads) wherever a conversation is loaded for a visibility
 * decision.
 */
export const VISIBILITY_LINE_SELECT = { restrictToOwnLeads: true, hideUnassignedFromAgents: true } as const;

type VisibilityLine = { restrictToOwnLeads: boolean; hideUnassignedFromAgents?: boolean } | null | undefined;

/**
 * Second gate, layered ON TOP of (never instead of) agentHasAccessToNumber —
 * call that first and only reach this once line access is already
 * confirmed. Pure/sync: takes an already-fetched conversation's
 * whatsappNumber visibility flags + assignees, no DB call of its own, so
 * every call site reuses data it already loaded rather than re-querying.
 *
 * A restricted line's UNCLAIMED conversation (no ACTIVE assignees at all —
 * an expired leave-cover row doesn't count) stays visible to every
 * line-granted agent — unless the line also has hideUnassignedFromAgents
 * set (2026-09-23, Marketing: a new agent saw all 72 unclaimed Marketing
 * chats, not just the one lead assigned to them), in which case an
 * unclaimed conversation is ADMIN-only. A conversation someone has actually
 * been assigned (manually, via the CRM's owner/telecaller sync, or a
 * still-active leave-cover) narrows to just its active assignees. ADMIN
 * always passes.
 */
export function isConversationVisibleGivenAccess(
  role: string,
  agentId: string,
  conversation: {
    whatsappNumber?: VisibilityLine;
    assignees?: { agentId: string; coverUntil?: Date | null }[];
  }
): boolean {
  if (role === "ADMIN") return true;

  const restricted = conversation.whatsappNumber?.restrictToOwnLeads ?? false;
  if (!restricted) return true;

  const activeAssignees = (conversation.assignees ?? []).filter(isAssigneeActive);
  if (activeAssignees.length === 0) return !(conversation.whatsappNumber?.hideUnassignedFromAgents ?? false);

  return activeAssignees.some((a) => a.agentId === agentId);
}

/**
 * Prisma `where` fragment for the conversations list — mirrors
 * isConversationVisibleGivenAccess()'s rule (unclaimed-or-mine on a
 * restricted line, only-mine on a line that also hides unclaimed ones,
 * expired leave-cover rows not counting) but expressed as a query filter
 * since a bulk list can't call a per-row function. Merge into an existing
 * `where` object (its only key is `OR`, which nothing else in that route
 * sets, so it's safe to combine via a straight object spread/assign —
 * Prisma ANDs sibling keys). Returns `{}` for ADMIN or when no line
 * currently has the flag set.
 */
export async function conversationVisibilityWhere(
  agentId: string,
  role: string
): Promise<Record<string, unknown>> {
  if (role === "ADMIN") return {};

  const restrictedLines = await prisma.whatsappNumber.findMany({
    where: { restrictToOwnLeads: true },
    select: { id: true, hideUnassignedFromAgents: true },
  });
  if (restrictedLines.length === 0) return {};

  const restrictedIds = restrictedLines.map((l) => l.id);
  const unclaimedVisibleIds = restrictedLines.filter((l) => !l.hideUnassignedFromAgents).map((l) => l.id);

  return {
    OR: [
      { whatsappNumberId: { notIn: restrictedIds } },
      { whatsappNumberId: { in: unclaimedVisibleIds }, assignees: { none: activeAssigneeWhere() } },
      { whatsappNumberId: { in: restrictedIds }, assignees: { some: { agentId, ...activeAssigneeWhere() } } },
    ],
  };
}

/**
 * Narrows SSE/push fan-out to match isConversationVisibleGivenAccess(),
 * instead of blasting every line-granted agent regardless of assignment.
 * Admins are always included.
 */
export async function getEligibleAgentIdsForConversation(conversation: {
  whatsappNumberId: string;
  whatsappNumber?: VisibilityLine;
  assignees?: { agentId: string; coverUntil?: Date | null }[];
}): Promise<string[]> {
  const lineIds = await getAgentIdsWithNumberAccess(conversation.whatsappNumberId);

  const restricted = conversation.whatsappNumber?.restrictToOwnLeads ?? false;
  const activeAssignees = (conversation.assignees ?? []).filter(isAssigneeActive);
  const hideUnclaimed = conversation.whatsappNumber?.hideUnassignedFromAgents ?? false;
  if (!restricted || (activeAssignees.length === 0 && !hideUnclaimed)) return lineIds;

  const admins = await prisma.agent.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  const allowed = new Set([...admins.map((a) => a.id), ...activeAssignees.map((a) => a.agentId)]);

  return lineIds.filter((id) => allowed.has(id));
}

/**
 * Same as getEligibleAgentIdsForConversation() for call sites that only
 * hold a conversation id — loads the line flags + assignees itself. Use
 * this (not the line-wide getAgentIdsWithNumberAccess) for any event that
 * carries message content, so a restricted line's chats never reach an
 * agent's live inbox or push notifications unless they could open them.
 */
export async function getEligibleAgentIdsForConversationId(conversationId: string): Promise<string[]> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      whatsappNumberId: true,
      whatsappNumber: { select: VISIBILITY_LINE_SELECT },
      assignees: { select: { agentId: true, coverUntil: true } },
    },
  });
  if (!conversation) return [];

  return getEligibleAgentIdsForConversation(conversation);
}
