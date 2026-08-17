import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, content, category, language, isApproved, metaTemplateId } = body;

    if (isApproved !== undefined && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can approve templates" }, { status: 403 });
    }

    const template = await prisma.template.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(content !== undefined && { content }),
        ...(category !== undefined && { category }),
        ...(language !== undefined && { language }),
        ...(isApproved !== undefined && { isApproved }),
        ...(metaTemplateId !== undefined && { metaTemplateId }),
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
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

    await prisma.template.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
