import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTemplateMessage, extractMetaErrorMessage } from "@/lib/meta";
import { toMetaConfig } from "@/lib/whatsapp-numbers";

const DELAY_MS = 1000; // 1 message per second to stay well within Meta limits

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const broadcast = await prisma.broadcast.findUnique({
    where: { id: params.id },
    include: {
      template: true,
      whatsappNumber: true,
      recipients: {
        where: { status: "PENDING" },
        include: { contact: true },
      },
    },
  });

  if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (broadcast.status === "SENDING")
    return NextResponse.json({ error: "Broadcast is already sending" }, { status: 409 });
  if (broadcast.recipients.length === 0)
    return NextResponse.json({ error: "No pending recipients" }, { status: 400 });

  // Mark as SENDING immediately
  await prisma.broadcast.update({
    where: { id: params.id },
    data: { status: "SENDING" },
  });

  // Fire-and-forget the actual sending so the response returns immediately
  (async () => {
    let sent = 0;
    let failed = 0;
    const metaConfig = toMetaConfig(broadcast.whatsappNumber);

    for (const recipient of broadcast.recipients) {
      if (recipient.contact.optedOut) {
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "FAILED" },
        });
        failed++;
        continue;
      }

      try {
        const { messageId } = await sendTemplateMessage(
          metaConfig,
          recipient.contact.phone,
          broadcast.template.name,
          broadcast.template.language
        );
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "SENT", metaMessageId: messageId },
        });
        sent++;
      } catch (error) {
        console.error(
          `Broadcast send failed for recipient ${recipient.id}:`,
          extractMetaErrorMessage(error)
        );
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "FAILED" },
        });
        failed++;
      }

      await sleep(DELAY_MS);
    }

    await prisma.broadcast.update({
      where: { id: params.id },
      data: { status: "COMPLETED", sentCount: sent, failedCount: failed },
    });
  })();

  return NextResponse.json({ ok: true, total: broadcast.recipients.length });
}
