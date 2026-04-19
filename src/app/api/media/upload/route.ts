import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const MAX_SIZE = 16 * 1024 * 1024; // 16 MB — covers images, audio, video; documents up to 100 MB

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const isDocument = !file.type.startsWith("image/") && !file.type.startsWith("audio/") && !file.type.startsWith("video/");
  const sizeLimit = isDocument ? 100 * 1024 * 1024 : MAX_SIZE;

  if (file.size > sizeLimit) {
    return NextResponse.json(
      { error: `File too large (max ${isDocument ? "100" : "16"} MB)` },
      { status: 400 }
    );
  }

  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_ACCESS_TOKEN;

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
