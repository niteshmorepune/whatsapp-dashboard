import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const note = await prisma.contactNote.findUnique({ where: { id: params.noteId } });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the note author or an admin can delete
  if (note.agentId !== session.user.id && session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.contactNote.delete({ where: { id: params.noteId } });
  return NextResponse.json({ ok: true });
}
