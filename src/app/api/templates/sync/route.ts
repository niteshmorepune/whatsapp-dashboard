import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listMessageTemplates } from "@/lib/meta";

export const dynamic = "force-dynamic";

/**
 * Pulls every template from each connected WABA and upserts it into our own
 * Template table (matched by name — Meta enforces unique names per WABA
 * anyway), so a template approved in Meta's WhatsApp Manager is usable here
 * without anyone re-typing its body/category/approval status by hand. Only
 * touches templates that actually exist on Meta's side; anything created
 * locally and never submitted is left alone.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can sync templates" }, { status: 403 });
    }

    const numbers = await prisma.whatsappNumber.findMany({
      select: { wabaId: true, accessToken: true },
    });

    const seenWabaIds = new Set<string>();
    const uniqueWabas = numbers.filter(({ wabaId }) => {
      if (seenWabaIds.has(wabaId)) return false;
      seenWabaIds.add(wabaId);
      return true;
    });

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const { wabaId, accessToken } of uniqueWabas) {
      try {
        const metaTemplates = await listMessageTemplates(accessToken, wabaId);

        for (const mt of metaTemplates) {
          // Only English — the only language this app's send flows use
          // ("en" not "en_US", see /api/send-template's own note on this).
          if (mt.language !== "en" && mt.language !== "en_US") continue;

          const body = mt.components.find((c) => c.type === "BODY");
          const existing = await prisma.template.findUnique({ where: { name: mt.name } });

          await prisma.template.upsert({
            where: { name: mt.name },
            create: {
              name: mt.name,
              content: body?.text ?? "",
              category: mt.category,
              isApproved: mt.status === "APPROVED",
              metaTemplateId: mt.id,
            },
            update: {
              content: body?.text ?? "",
              category: mt.category,
              isApproved: mt.status === "APPROVED",
              metaTemplateId: mt.id,
            },
          });

          if (existing) updated++;
          else created++;
        }
      } catch (e) {
        errors.push(`WABA ${wabaId}: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    return NextResponse.json({ created, updated, errors });
  } catch (error) {
    console.error("templates sync error:", error);
    return NextResponse.json({ error: "Failed to sync templates" }, { status: 500 });
  }
}
