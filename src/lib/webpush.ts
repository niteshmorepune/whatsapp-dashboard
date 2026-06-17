import webpush from "web-push";
import { prisma } from "./prisma";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export interface PushPayload {
  title: string;
  body: string;
  conversationId: string;
  url: string;
}

export async function sendPushToAgents(
  agentIds: string[],
  payload: PushPayload
): Promise<void> {
  if (agentIds.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { agentId: { in: agentIds } },
  });

  if (subscriptions.length === 0) return;

  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
        .catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
        })
    )
  );
}
