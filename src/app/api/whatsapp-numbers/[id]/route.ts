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
    const { label, businessNumber, phoneNumberId, wabaId, accessToken, isDefault } = body;

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
        },
        select: {
          id: true,
          label: true,
          businessNumber: true,
          phoneNumberId: true,
          wabaId: true,
          isDefault: true,
        },
      });
    });

    return NextResponse.json(number);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update number" }, { status: 500 });
  }
}
