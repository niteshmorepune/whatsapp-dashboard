import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint, keys } = await request.json() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      agentId: session.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    update: {
      agentId: session.user.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json() as { endpoint: string };
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, agentId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
