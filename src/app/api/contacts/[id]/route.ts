import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyCrmContactName } from "@/lib/crm-notify";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contact = await prisma.contact.findUnique({
      where: { id: resolvedParams.id },
      include: {
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            assignees: { include: { agent: true } },
          },
          orderBy: { lastMessageAt: "desc" },
        },
      },
    });

    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(contact);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch contact" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, email, tags, optedOut } = body;

    const previous = await prisma.contact.findUnique({
      where: { id: resolvedParams.id },
      select: { name: true },
    });

    const contact = await prisma.contact.update({
      where: { id: resolvedParams.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(tags !== undefined && { tags }),
        ...(optedOut !== undefined && { optedOut }),
      },
    });

    // Two-way name sync: a manual rename here updates the matching CRM
    // Lead / Client contact too — see notifyCrmContactName().
    const newName = typeof contact.name === "string" ? contact.name.trim() : "";
    if (newName && newName !== previous?.name) {
      notifyCrmContactName({ phone: contact.phone, name: newName });
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.contact.delete({ where: { id: resolvedParams.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
