import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.faqEntry.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { question, answer } = await request.json();
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: "Question and answer are required" }, { status: 400 });
  }

  const entry = await prisma.faqEntry.create({
    data: { question: question.trim(), answer: answer.trim() },
  });
  return NextResponse.json(entry, { status: 201 });
}
