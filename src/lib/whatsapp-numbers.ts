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
 * Second gate, layered ON TOP of (never instead of) agentHasAccessToNumber —
 * call that first and only reach this once line access is already
 * confirmed. Pure/sync: takes an already-fetched conversation's
 * whatsappNumber.restrictToOwnLeads + assignees, no DB call of its own, so
 * every call site reuses data it already loaded rather than re-querying.
 *
 * A restricted line's UNCLAIMED conversation (no assignees at all) stays
 * visible to every line-granted agent — only a conversation someone has
 * actually been assigned (manually, or via the CRM's owner/telecaller sync)
 * narrows to just its assignees. ADMIN always passes.
 */
export function isConversationVisibleGivenAccess(
  role: string,
  agentId: string,
  conversation: {
    whatsappNumber?: { restrictToOwnLeads: boolean } | null;
    assignees?: { agentId: string }[];
  }
): boolean {
  if (role === "ADMIN") return true;

  const restricted = conversation.whatsappNumber?.restrictToOwnLeads ?? false;
  if (!restricted) return true;

  const assignees = conversation.assignees ?? [];
  if (assignees.length === 0) return true;

  return assignees.some((a) => a.agentId === agentId);
}

/**
 * Prisma `where` fragment for the conversations list — mirrors
 * isConversationVisibleGivenAccess()'s rule (unclaimed-or-mine on a
 * restricted line) but expressed as a query filter since a bulk list can't
 * call a per-row function. Merge into an existing `where` object (its only
 * key is `OR`, which nothing else in that route sets, so it's safe to
 * combine via a straight object spread/assign — Prisma ANDs sibling keys).
 * Returns `{}` for ADMIN or when no line currently has the flag set.
 */
export async function conversationVisibilityWhere(
  agentId: string,
  role: string
): Promise<Record<string, unknown>> {
  if (role === "ADMIN") return {};

  const restrictedLines = await prisma.whatsappNumber.findMany({
    where: { restrictToOwnLeads: true },
    select: { id: true },
  });
  if (restrictedLines.length === 0) return {};

  const restrictedIds = restrictedLines.map((l) => l.id);

  return {
    OR: [
      { whatsappNumberId: { notIn: restrictedIds } },
      { whatsappNumberId: { in: restrictedIds }, assignees: { none: {} } },
      { whatsappNumberId: { in: restrictedIds }, assignees: { some: { agentId } } },
    ],
  };
}

/**
 * Narrows SSE/push fan-out to match isConversationVisibleGivenAccess() for a
 * restricted+claimed conversation, instead of blasting every line-granted
 * agent regardless of assignment. Admins are always included.
 */
export async function getEligibleAgentIdsForConversation(conversation: {
  whatsappNumberId: string;
  whatsappNumber?: { restrictToOwnLeads: boolean } | null;
  assignees?: { agentId: string }[];
}): Promise<string[]> {
  const lineIds = await getAgentIdsWithNumberAccess(conversation.whatsappNumberId);

  const restricted = conversation.whatsappNumber?.restrictToOwnLeads ?? false;
  const assignees = conversation.assignees ?? [];
  if (!restricted || assignees.length === 0) return lineIds;

  const admins = await prisma.agent.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  const allowed = new Set([...admins.map((a) => a.id), ...assignees.map((a) => a.agentId)]);

  return lineIds.filter((id) => allowed.has(id));
}
