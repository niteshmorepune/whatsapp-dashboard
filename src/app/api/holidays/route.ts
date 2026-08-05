import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json(holidays);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { date, label } = await request.json();
  if (!date || !DATE_RE.test(date) || !label?.trim()) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) and label are required" }, { status: 400 });
  }

  try {
    const holiday = await prisma.holiday.create({
      data: { date: new Date(`${date}T00:00:00.000Z`), label: label.trim() },
    });
    return NextResponse.json(holiday, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That date is already marked as a holiday" }, { status: 409 });
  }
}
