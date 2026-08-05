import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Service-key only (no session fallback) — same shape as POST
 * /api/send-template. Called by the NEDS CRM's own AI Usage Report
 * (app/Services/AiUsageMetrics.php's fetchAppUsage()) to pull this app's
 * Claude spend in alongside Drishti's and SMDost's, which already expose
 * the identical GET /api/ai/usage contract.
 */
export async function GET(request: NextRequest) {
  const serviceKey = request.headers.get("X-Service-Key");
  if (!serviceKey || serviceKey !== process.env.WADESK_SERVICE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where =
    from && to
      ? { createdAt: { gte: new Date(from), lte: new Date(to) } }
      : {};

  const totals = await prisma.aiUsage.aggregate({
    where,
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, costUsd: true },
  });

  // Prisma's aggregate() _count comes back as a breakdown object
  // ({_all, id, feature, ...}), not a plain number — flatten it to just
  // _all here so the CRM's PHP side (`(int) $totals['_count']`) gets a
  // real integer instead of casting a JSON object down to 1.
  return NextResponse.json({
    data: {
      totals: {
        _count: totals._count._all,
        _sum: totals._sum,
      },
    },
  });
}
