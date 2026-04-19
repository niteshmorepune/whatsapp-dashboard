import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const tag = searchParams.get("tag");
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        conversations: {
          orderBy: { lastMessageAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Filter by tag in-memory (JSON field)
    const filtered = tag
      ? contacts.filter((c) => {
          const tags = c.tags as string[];
          return tags.includes(tag);
        })
      : contacts;

    const total = await prisma.contact.count({ where });

    return NextResponse.json({ contacts: filtered, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { phone, name, email, tags } = body;

    if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });

    // Normalize: strip leading + to match how Meta webhook delivers phone numbers
    const normalizedPhone = phone.startsWith("+") ? phone.slice(1) : phone;

    const contact = await prisma.contact.create({
      data: {
        phone: normalizedPhone,
        name: name ?? null,
        email: email ?? null,
        tags: tags ?? [],
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
