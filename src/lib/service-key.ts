import crypto from "crypto";

/**
 * Shared guard for every route that accepts X-Service-Key (server-to-server
 * calls from the NEDS CRM). Previously each of 7 routes repeated its own
 * bare `serviceKey === process.env.WADESK_SERVICE_KEY` check — no
 * constant-time comparison, no rate limit, no logging. Real exposure: a
 * leaked key hitting POST /api/send-template with no rate limit could send
 * unlimited paid WhatsApp template messages (every CRM-triggered send —
 * recovery nudge, first invite, handoff, report, payment confirmation,
 * quotation — funnels through that one route).
 *
 * Constant-time comparison (via a SHA-256 hash of both values, so length
 * differences don't leak through an early bail-out either), a per-route
 * in-memory rate limit (this app runs as a single Next.js instance, no
 * Redis — matches its own architecture), and a log line on every attempt.
 */

const WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 30;
const recentHits = new Map<string, number[]>();

/**
 * @param maxPerMinute override the default 30/min cap. Every CRM-triggered
 * WhatsApp send (recovery nudges, offer funnel, quotations, etc.) funnels
 * through POST /api/send-template, and a cron tick can legitimately process
 * dozens of leads in one run — that route passes a higher limit here so
 * real batch traffic isn't throttled by the same cap meant to blunt a
 * leaked-key abuse scenario.
 */
export function isServiceKeyRequest(request: Request, routeLabel: string, maxPerMinute = DEFAULT_MAX_REQUESTS_PER_WINDOW): boolean {
  const provided = request.headers.get("X-Service-Key");
  const expected = process.env.WADESK_SERVICE_KEY;

  if (!provided || !expected) return false;

  if (!timingSafeStringsEqual(provided, expected)) {
    console.warn(`[service-key] invalid key presented for ${routeLabel}`);
    return false;
  }

  if (!withinRateLimit(routeLabel, maxPerMinute)) {
    console.warn(`[service-key] rate limit exceeded for ${routeLabel} (max ${maxPerMinute}/min)`);
    return false;
  }

  return true;
}

function timingSafeStringsEqual(a: string, b: string): boolean {
  const aHash = crypto.createHash("sha256").update(a, "utf8").digest();
  const bHash = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

function withinRateLimit(bucket: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const timestamps = (recentHits.get(bucket) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= maxPerMinute) {
    recentHits.set(bucket, timestamps);
    return false;
  }
  timestamps.push(now);
  recentHits.set(bucket, timestamps);
  return true;
}
