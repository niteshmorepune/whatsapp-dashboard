import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FALLBACK_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// Long enough to comfortably cover any single call; short enough that a
// leaked credential (these reach the browser, unlike the long-term
// CLOUDFLARE_TURN_KEY_API_TOKEN below) is only useful for an hour.
const CREDENTIAL_TTL_SECONDS = 3600;

/**
 * Short-lived Cloudflare Realtime TURN credentials for the browser's
 * RTCPeerConnection (see IncomingCallOverlay.tsx) — generated fresh on
 * every request so the long-term CLOUDFLARE_TURN_KEY_API_TOKEN never
 * reaches the browser, only a 1-hour-scoped username/credential pair does.
 *
 * Real incident, 2026-09-10: a plain STUN-only ICE config let call
 * SIGNALING connect cleanly (Meta's own accept succeeded, the caller's
 * phone showed a running timer) but the actual audio media never flowed
 * in either direction — a NAT/firewall on the agent's network needs a
 * TURN relay, STUN's public-IP discovery alone isn't enough.
 *
 * Falls back to STUN-only if Cloudflare isn't configured yet or the
 * request fails — ships inert exactly like every other optional
 * integration in this app, never blocks answering a call outright.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_KEY_API_TOKEN;

  if (!keyId || !apiToken) {
    return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS });
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      }
    );

    if (!response.ok) {
      console.error("TURN credentials: Cloudflare returned non-2xx", response.status, await response.text());
      return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS });
    }

    const data: { iceServers?: RTCIceServer[] } = await response.json();
    return NextResponse.json({ iceServers: data.iceServers ?? FALLBACK_ICE_SERVERS });
  } catch (error) {
    console.error("TURN credentials: request to Cloudflare failed", error);
    return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS });
  }
}
