interface PostCrmGoalCaptureParams {
  phone: string;
  goal?: string;
  websiteUrl?: string;
  gbpUrl?: string;
}

/**
 * Writes back to the NEDS CRM once the after-hours assistant's own
 * goal-question flow (src/lib/goal-flow.ts) gets an answer — the reverse
 * direction of crm-lead-context.ts's read. Same CRM_WEBHOOK_TOKEN trust
 * boundary as every other wadesk.in <-> CRM call.
 *
 * Unlike notifyCrm()'s pure fire-and-forget (a duplicate timeline entry is
 * harmless to lose), this data actually drives what happens next in the
 * conversation and a real "needs Sales" notification on the CRM side, so
 * it's awaited with a short timeout rather than truly fired blind — but
 * still never throws: any failure here must never break the WhatsApp
 * conversation itself, same "AI failure never breaks the core workflow"
 * rule this ecosystem uses everywhere else. Returns false (not true) on
 * any failure, including a phone the CRM doesn't recognise as an open
 * Lead — callers should treat both the same way (nothing to do further).
 */
export async function postCrmGoalCapture(params: PostCrmGoalCaptureParams): Promise<boolean> {
  const url = process.env.CRM_GOAL_CAPTURE_URL;
  const token = process.env.CRM_WEBHOOK_TOKEN;
  if (!url || !token) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone: params.phone,
        goal: params.goal,
        website_url: params.websiteUrl,
        gbp_url: params.gbpUrl,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return false;

    const data = await response.json();
    return data.updated === true;
  } catch (error) {
    console.error("CRM goal-capture write failed:", error);
    return false;
  }
}
