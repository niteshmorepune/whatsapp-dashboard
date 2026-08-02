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
