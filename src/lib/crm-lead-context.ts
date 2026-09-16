export interface CrmLeadContext {
  found: boolean;
  name?: string | null;
  company?: string | null;
  service?: string | null;
  campaign?: string | null;
  estimatedValueRupees?: number | null;
  budgetQuestionRawAnswer?: string | null;
  additionalAnswers?: string | null;
  visibilityAuditOfferUrl?: string | null;
  // 2026-09-08 — power the after-hours assistant's own goal-question flow
  // (see src/lib/goal-flow.ts). goal is one of the CRM's LeadGoal enum
  // values (e.g. "grow_business") or null if never asked/answered yet, from
  // ANY channel. needsLink is precomputed CRM-side
  // (LeadGoal::needsWebsiteOrGbp()) so this app never has to reimplement
  // that branching.
  goal?: string | null;
  needsLink?: boolean;
  websiteUrl?: string | null;
  gbpUrl?: string | null;
  // 2026-09-17 — one of the CRM's LeadBudgetRange enum values (e.g.
  // "under_3000") or null if never asked/answered yet. Powers the
  // after-hours assistant's budget-capture step, chained onto the same
  // goal-question flow (see src/lib/goal-flow.ts) — GenerateLeadRecommendation
  // needs both goal and budget_range non-null to resolve a priced offer.
  budgetRange?: string | null;
  // 2026-09-13 — the CRM's own unified goal+budget recommendation matrix
  // (one of LeadGenerationAudit/WebsiteGrowthAudit/GrowthStrategy — never
  // GbpAudit, which stays exclusively on visibilityAuditOfferUrl above so
  // its own funnel-tracking redirect keeps firing). Null until the CRM has
  // actually resolved a recommendation for this lead. Real gap this closes:
  // the after-hours assistant used to only ever know about the GBP offer,
  // so it kept recommending that even for a lead the matrix had resolved
  // into a completely different, better-fitting offer (confirmed live on
  // lead #382 in the CRM).
  recommendedOfferName?: string | null;
  recommendedOfferPrice?: number | null;
  recommendedOfferUrl?: string | null;
}

/**
 * Looks up the NEDS CRM's Lead record for a phone number, the reverse
 * direction of crm-notify.ts's push — called right before the after-hours
 * AI assistant drafts a reply, so it can reference the lead's actual
 * campaign/service/declared budget instead of a generic "thanks for the
 * form" placeholder (the exact gap a real incident surfaced 2026-08-20: a
 * lead's WhatsApp auto-message had a garbled budget answer and the AI's
 * reply couldn't say anything more specific than "the form", because it
 * never had campaign/answer context to begin with).
 *
 * Same 5s-timeout, never-throw, null-on-any-failure contract as every other
 * best-effort external call in this app — a CRM hiccup must never block or
 * degrade the reply itself, it just means the reply falls back to the
 * previous generic behavior. Reuses CRM_WEBHOOK_TOKEN (same wadesk.in trust
 * boundary as crm-notify.ts, just the other direction), not a new secret.
 */
export async function getCrmLeadContext(phone: string): Promise<CrmLeadContext | null> {
  const url = process.env.CRM_LEAD_CONTEXT_URL;
  const token = process.env.CRM_WEBHOOK_TOKEN;
  if (!url || !token) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${url}?phone=${encodeURIComponent(phone)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.found) return { found: false };

    return {
      found: true,
      name: data.name ?? null,
      company: data.company ?? null,
      service: data.service ?? null,
      campaign: data.campaign ?? null,
      estimatedValueRupees: data.estimated_value_rupees ?? null,
      budgetQuestionRawAnswer: data.budget_question_raw_answer ?? null,
      additionalAnswers: data.additional_answers ?? null,
      visibilityAuditOfferUrl: data.visibility_audit_offer_url ?? null,
      goal: data.goal ?? null,
      needsLink: data.needs_link ?? false,
      websiteUrl: data.website_url ?? null,
      gbpUrl: data.gbp_url ?? null,
      budgetRange: data.budget_range ?? null,
      recommendedOfferName: data.recommended_offer_name ?? null,
      recommendedOfferPrice: data.recommended_offer_price ?? null,
      recommendedOfferUrl: data.recommended_offer_url ?? null,
    };
  } catch (error) {
    console.error("CRM lead-context lookup failed:", error);
    return null;
  }
}
