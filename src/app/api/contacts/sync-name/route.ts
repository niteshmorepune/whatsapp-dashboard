import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isServiceKeyRequest } from "@/lib/service-key";

export const dynamic = "force-dynamic";

/**
 * Server-to-server only (no session fallback) — CRM -> wadesk.in half of the
 * two-way contact-name sync (2026-09-23). When a Lead or a Client's contact
 * person is renamed in the CRM, every Contact here whose phone ends in the
 * same last 10 digits takes that name, so the team never sees two different
 * names for one person across the two apps. The reverse half is
 * notifyCrmContactName() in lib/crm-notify.ts, fired from a manual rename in
 * PATCH /api/contacts/[id].
 *
 * Update-only: never creates a Contact (a CRM record that never messaged in
 * has nothing to rename here), and deliberately never notifies the CRM back,
 * so a rename can't echo between the two apps.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isServiceKeyRequest(request, "POST /api/contacts/sync-name", "lead-sync", 100)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phones: unknown[] = Array.isArray(body.phones) ? body.phones : [];

    const last10s = [
      ...new Set(
        phones
          .map((phone) => String(phone).replace(/\D/g, ""))
          .filter((digits) => digits.length >= 10)
          .map((digits) => digits.slice(-10)),
      ),
    ];

    if (!name || last10s.length === 0) {
      return NextResponse.json({ error: "name and at least one 10+ digit phone are required" }, { status: 400 });
    }

    const result = await prisma.contact.updateMany({
      where: {
        AND: [
          { OR: last10s.map((last10) => ({ phone: { endsWith: last10 } })) },
          // Explicit null branch — SQL's `name != x` alone skips NULL names.
          { OR: [{ name: null }, { name: { not: name } }] },
        ],
      },
      data: { name },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error("POST /api/contacts/sync-name failed", error);
    return NextResponse.json({ error: "Failed to sync contact name" }, { status: 500 });
  }
}
