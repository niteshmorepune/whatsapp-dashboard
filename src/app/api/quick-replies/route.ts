import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const replies = await prisma.quickReply.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(replies);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, content } = await request.json();
  if (!name?.trim() || !content?.trim())
    return NextResponse.json({ error: "Name and content are required" }, { status: 400 });

  const reply = await prisma.quickReply.create({ data: { name: name.trim(), content: content.trim() } });
  return NextResponse.json(reply, { status: 201 });
}
