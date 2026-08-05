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
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { label, businessNumber, phoneNumberId, wabaId, accessToken, isDefault, aiMode, businessHours } = body;

    if (aiMode !== undefined && !["AUTO", "FORCE_ON", "FORCE_OFF"].includes(aiMode)) {
      return NextResponse.json({ error: "aiMode must be AUTO, FORCE_ON, or FORCE_OFF" }, { status: 400 });
    }
    if (businessHours !== undefined && businessHours !== null && !Array.isArray(businessHours)) {
      return NextResponse.json({ error: "businessHours must be an array" }, { status: 400 });
    }

    const number = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.whatsappNumber.updateMany({
          data: { isDefault: false },
          where: { isDefault: true, NOT: { id: params.id } },
        });
      }
      return tx.whatsappNumber.update({
        where: { id: params.id },
        data: {
          ...(label !== undefined && { label }),
          ...(businessNumber !== undefined && { businessNumber }),
          ...(phoneNumberId !== undefined && { phoneNumberId }),
          ...(wabaId !== undefined && { wabaId }),
          ...(accessToken !== undefined && accessToken !== "" && { accessToken }),
          ...(isDefault !== undefined && { isDefault }),
          ...(aiMode !== undefined && { aiMode }),
          ...(businessHours !== undefined && { businessHours }),
        },
        select: {
          id: true,
          label: true,
          businessNumber: true,
          phoneNumberId: true,
          wabaId: true,
          isDefault: true,
          aiMode: true,
          businessHours: true,
        },
      });
    });

    return NextResponse.json(number);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update number" }, { status: 500 });
  }
}
