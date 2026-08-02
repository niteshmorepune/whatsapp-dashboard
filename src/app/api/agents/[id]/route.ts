import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role, isActive, whatsappNumberIds } = body;

    if (email !== undefined) {
      const conflict = await prisma.agent.findFirst({
        where: { email, NOT: { id: params.id } },
      });
      if (conflict) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
    }

    if (Array.isArray(whatsappNumberIds)) {
      await prisma.agentWhatsappNumber.deleteMany({ where: { agentId: params.id } });
      if (whatsappNumberIds.length > 0) {
        await prisma.agentWhatsappNumber.createMany({
          data: whatsappNumberIds.map((whatsappNumberId: string) => ({ agentId: params.id, whatsappNumberId })),
          skipDuplicates: true,
        });
      }
    }

    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        whatsappNumberGrants: {
          select: { whatsappNumber: { select: { id: true, label: true, businessNumber: true } } },
        },
      },
    });

    return NextResponse.json(agent);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete - deactivate instead
    const agent = await prisma.agent.update({
      where: { id: params.id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });

    return NextResponse.json(agent);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to deactivate agent" }, { status: 500 });
  }
}
