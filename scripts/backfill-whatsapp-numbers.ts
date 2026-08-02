/**
 * One-off, idempotent data migration for the multi-number rollout.
 *
 * Before this script runs, every Conversation/Broadcast row predates the
 * WhatsappNumber model and has whatsappNumberId = null — they were all,
 * implicitly, on the one number this app has ever had configured
 * (META_PHONE_NUMBER_ID). This script makes that implicit fact explicit:
 * it creates a "Support" WhatsappNumber row from the current Meta env vars,
 * backfills every existing Conversation/Broadcast onto it, and grants every
 * currently-active agent access to it (they're the existing support team,
 * so nobody should lose access they already had).
 *
 * Run this AFTER `prisma migrate dev/deploy` for the add_whatsapp_numbers
 * migration and BEFORE the follow-up migration that makes whatsappNumberId
 * required — see prisma/migrations for the two-step (expand, then contract)
 * sequence. Safe to re-run: every write is an upsert or a `where: null` scan,
 * so a second run touches zero rows.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Matches Contact.phone's convention: digits only, no leading "+".
const DEFAULT_BUSINESS_NUMBER =
  process.env.WHATSAPP_DEFAULT_BUSINESS_NUMBER ?? "918007733737";
const DEFAULT_LABEL = process.env.WHATSAPP_DEFAULT_LABEL ?? "Support";

async function main() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const wabaId = process.env.META_WABA_ID;

  if (!accessToken || !phoneNumberId || !wabaId) {
    throw new Error(
      "META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, and META_WABA_ID must all be set (checked .env.local) — these become the 'Support' WhatsappNumber row."
    );
  }

  const supportNumber = await prisma.whatsappNumber.upsert({
    where: { businessNumber: DEFAULT_BUSINESS_NUMBER },
    update: {},
    create: {
      label: DEFAULT_LABEL,
      businessNumber: DEFAULT_BUSINESS_NUMBER,
      phoneNumberId,
      wabaId,
      accessToken,
      isDefault: true,
    },
  });
  console.log(
    `WhatsappNumber "${supportNumber.label}" (${supportNumber.businessNumber}) id=${supportNumber.id}`
  );

  // Raw SQL, not prisma.conversation.updateMany({ where: { whatsappNumberId: null } }):
  // this script is meant to run in the transitional window between the
  // add_whatsapp_numbers migration (column nullable) and the follow-up
  // migration that makes it required — but the generated Prisma Client
  // always reflects schema.prisma's CURRENT (already-required) state, so
  // its types reject `null` as a filter value even though the column is
  // still nullable in the actual database at this point in the rollout.
  const conversations = await prisma.$executeRaw`
    UPDATE Conversation SET whatsappNumberId = ${supportNumber.id} WHERE whatsappNumberId IS NULL
  `;
  console.log(`Backfilled ${conversations} conversation(s).`);

  const broadcasts = await prisma.$executeRaw`
    UPDATE Broadcast SET whatsappNumberId = ${supportNumber.id} WHERE whatsappNumberId IS NULL
  `;
  console.log(`Backfilled ${broadcasts} broadcast(s).`);

  const activeAgents = await prisma.agent.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const grants = await prisma.agentWhatsappNumber.createMany({
    data: activeAgents.map((a) => ({
      agentId: a.id,
      whatsappNumberId: supportNumber.id,
    })),
    skipDuplicates: true,
  });
  console.log(
    `Granted ${grants.count} agent(s) access to "${supportNumber.label}" (${activeAgents.length} active agents checked).`
  );

  console.log(
    "\nDone. Next: apply the follow-up migration that makes whatsappNumberId required on Conversation/Broadcast."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
