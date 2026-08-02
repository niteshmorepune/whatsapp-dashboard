import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber } from "@/lib/whatsapp-numbers";

const MAX_SIZE = 16 * 1024 * 1024; // 16 MB — covers images, audio, video; documents up to 100 MB

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const conversationId = formData.get("conversationId") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { whatsappNumber: true },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const allowed = await agentHasAccessToNumber(
    session.user.id,
    session.user.role,
    conversation.whatsappNumberId
  );
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isDocument = !file.type.startsWith("image/") && !file.type.startsWith("audio/") && !file.type.startsWith("video/");
  const sizeLimit = isDocument ? 100 * 1024 * 1024 : MAX_SIZE;

  if (file.size > sizeLimit) {
    return NextResponse.json(
      { error: `File too large (max ${isDocument ? "100" : "16"} MB)` },
      { status: 400 }
    );
  }

  const phoneNumberId = conversation.whatsappNumber.phoneNumberId;
  const token = conversation.whatsappNumber.accessToken;

  const metaForm = new FormData();
  metaForm.append("file", file);
  metaForm.append("messaging_product", "whatsapp");

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: metaForm,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { error?: { message?: string } }).error?.message ?? "Upload failed" },
      { status: 502 }
    );
  }

  const { id: mediaId } = await res.json();
  return NextResponse.json({ mediaId });
}
