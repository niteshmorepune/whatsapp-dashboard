import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentAccessibleNumberIds } from "@/lib/whatsapp-numbers";
import { resolveAiLiveState, getHolidayDateKeys, type BusinessHours } from "@/lib/business-hours";

export const dynamic = "force-dynamic";

// accessToken is never sent to the browser — it's read server-side only,
// inside API routes that need to call Meta on this number's behalf.
const PUBLIC_SELECT = {
  id: true,
  label: true,
  businessNumber: true,
  isDefault: true,
  createdAt: true,
} as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.user.role === "ADMIN") {
      const numbers = await prisma.whatsappNumber.findMany({
        select: {
          ...PUBLIC_SELECT,
          phoneNumberId: true,
          wabaId: true,
          aiMode: true,
          businessHours: true,
          _count: { select: { conversations: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      const holidayDateKeys = await getHolidayDateKeys();
      const withAiStatus = numbers.map((n) => ({
        ...n,
        aiCurrentlyLive: resolveAiLiveState(n.aiMode, n.businessHours as BusinessHours | null, holidayDateKeys),
      }));
      return NextResponse.json(withAiStatus);
    }

    const accessibleIds = await getAgentAccessibleNumberIds(session.user.id, session.user.role);
    const numbers = await prisma.whatsappNumber.findMany({
      where: { id: { in: accessibleIds } },
      select: PUBLIC_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(numbers);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch numbers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { label, businessNumber, phoneNumberId, wabaId, accessToken, isDefault } = body;

    if (!label || !businessNumber || !phoneNumberId || !wabaId || !accessToken) {
      return NextResponse.json(
        { error: "label, businessNumber, phoneNumberId, wabaId, accessToken are required" },
        { status: 400 }
      );
    }

    const number = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.whatsappNumber.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
      }
      return tx.whatsappNumber.create({
        data: { label, businessNumber, phoneNumberId, wabaId, accessToken, isDefault: !!isDefault },
        select: { ...PUBLIC_SELECT, phoneNumberId: true, wabaId: true },
      });
    });

    return NextResponse.json(number, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create number" }, { status: 500 });
  }
}
