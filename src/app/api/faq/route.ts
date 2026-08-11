import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Included on every response so the admin UI can show a scope badge
// ("Both lines" vs a specific line's label) without a second fetch.
const WITH_NUMBER = { whatsappNumber: { select: { id: true, label: true } } } as const;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const whatsappNumberId = request.nextUrl.searchParams.get("whatsappNumberId");
  const entries = await prisma.faqEntry.findMany({
    where: whatsappNumberId ? { whatsappNumberId } : undefined,
    include: WITH_NUMBER,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { question, answer, whatsappNumberId } = await request.json();
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: "Question and answer are required" }, { status: 400 });
  }

  const entry = await prisma.faqEntry.create({
    data: { question: question.trim(), answer: answer.trim(), whatsappNumberId: whatsappNumberId || null },
    include: WITH_NUMBER,
  });
  return NextResponse.json(entry, { status: 201 });
}
