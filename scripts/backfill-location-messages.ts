/**
 * One-off, idempotent backfill for the "[location]" placeholder bug fixed
 * in 037a7b4 (2026-09-17).
 *
 * Before that fix, the webhook handler had no case for a WhatsApp location
 * share — msg.location was never read at all, so a shared pin's content
 * fell all the way through the fallback chain to the literal placeholder
 * text `[location]`.
 *
 * IMPORTANT LIMITATION: this script cannot recover the real coordinates.
 * The lat/long/name/address Meta sent in that original webhook payload was
 * never persisted anywhere (this app has no raw-webhook-log table) — once
 * saved as the bare placeholder, the actual location is gone for good.
 * There is no Meta API to re-fetch a historical inbound message either
 * (unlike media, which has a fetchable id — a location has none). All this
 * script can do is replace the confusing bracket placeholder with an
 * honest note explaining what happened, so old threads read sensibly
 * instead of showing a stray "[location]".
 *
 * Deliberately scoped to Message.content === "[location]" exactly — the
 * same fallback also produced placeholders for other still-unhandled
 * types (e.g. "[sticker]", "[contacts]"), which are a separate, not-yet
 * requested gap and are left untouched here.
 *
 * Does NOT set mediaType: "location" — MessageBubble's location renderer
 * expects a real Google Maps URL as the last line of content to link to;
 * these rows have no such URL, so leaving mediaType null renders the
 * honest note as a plain text bubble instead of a broken/fake link.
 *
 * Safe to re-run: only touches rows still holding the literal placeholder,
 * so a second run always reports 0 updated.
 *
 * Usage:
 *   npx ts-node --project tsconfig.seed.json scripts/backfill-location-messages.ts [--dry-run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLACEHOLDER = "[location]";
const REPLACEMENT_NOTE =
  "📍 Location shared (the exact coordinates weren't captured by the app at the time — fixed 2026-09-17; ask the contact to re-share if you need the pin).";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const affected = await prisma.message.findMany({
    where: {
      content: PLACEHOLDER,
      direction: "INBOUND",
      mediaType: null,
    },
    select: { id: true, conversationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `Found ${affected.length} message(s) still holding the literal "${PLACEHOLDER}" placeholder.`
  );

  if (affected.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (dryRun) {
    for (const m of affected) {
      console.log(
        `  [dry-run] would update message ${m.id} (conversation ${m.conversationId}, ${m.createdAt.toISOString()})`
      );
    }
    console.log("\nDry run only — no changes made. Re-run without --dry-run to apply.");
    return;
  }

  const result = await prisma.message.updateMany({
    where: {
      content: PLACEHOLDER,
      direction: "INBOUND",
      mediaType: null,
    },
    data: {
      content: REPLACEMENT_NOTE,
    },
  });

  console.log(`Updated ${result.count} message(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
