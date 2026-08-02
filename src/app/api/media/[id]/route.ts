import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The media ID alone doesn't say which number's token can fetch it — the
  // caller (MessageBubble, via message.conversationId) tells us which line
  // this message belongs to. Falls back to the default number for any old
  // client that hasn't been updated to pass it yet.
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const numberRow = conversationId
    ? await prisma.conversation
        .findUnique({ where: { id: conversationId }, include: { whatsappNumber: true } })
        .then((c) => c?.whatsappNumber ?? null)
    : await prisma.whatsappNumber.findFirst({ where: { isDefault: true } });

  if (!numberRow) {
    return NextResponse.json({ error: "Could not resolve WhatsApp number for this media" }, { status: 404 });
  }

  const token = numberRow.accessToken;
  const download = request.nextUrl.searchParams.get("download") === "1";
  const filename = request.nextUrl.searchParams.get("filename") ?? "file";

  // Resolve media ID to a download URL
  const metaRes = await fetch(`https://graph.facebook.com/v18.0/${params.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const { url, mime_type } = await metaRes.json();

  // Proxy the file — Meta requires the Authorization header, so the browser can't fetch directly
  const fileRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!fileRes.ok) {
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": mime_type ?? "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
  });

  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  }

  return new Response(fileRes.body, { headers });
}
