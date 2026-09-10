"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { useSSE } from "@/hooks/useSSE";

type CallPhase = "idle" | "ringing" | "connecting" | "active";

// Matches Meta's own ~30-60s no-answer auto-terminate — a safety net in case
// the terminate webhook is ever slow/lost, not the primary end-of-ring signal.
const RING_TIMEOUT_MS = 60_000;

// Bare STUN fallback if /api/calls/turn-credentials can't be reached at
// all (network hiccup, not just "Cloudflare isn't configured yet" — that
// case already falls back server-side). Real incident, 2026-09-10: a
// STUN-only config let call SIGNALING connect (both sides showed
// "answered") but audio never flowed either direction — a NAT/firewall on
// the agent's network needs an actual TURN relay, not just STUN's
// public-IP discovery.
const STUN_ONLY_FALLBACK: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await fetch("/api/calls/turn-credentials");
    if (!response.ok) return STUN_ONLY_FALLBACK;
    const data: { iceServers?: RTCIceServer[] } = await response.json();
    return data.iceServers && data.iceServers.length > 0 ? data.iceServers : STUN_ONLY_FALLBACK;
  } catch {
    return STUN_ONLY_FALLBACK;
  }
}

interface RingingCall {
  callId: string;
  conversationId: string;
  contactName: string;
  offerSdp: string;
}

/**
 * A short, looping two-tone ping — same Web Audio approach as
 * ConversationList's one-shot playNotificationSound(), but repeating (a
 * ringing call needs to keep ringing, not ping once) so kept as its own
 * implementation rather than forcing that one-shot helper into a loop it
 * was never designed for. Returns a stop function.
 */
function playRingTone(): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    const Ctx =
      window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return () => {};
    const ctx = new Ctx();
    let stopped = false;

    const ping = () => {
      if (stopped) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    };

    ping();
    const interval = setInterval(ping, 1500);
    let closed = false;
    return () => {
      // Real bug hit on the first live test call, 2026-09-10: this stop
      // function gets called more than once (once when Answer is clicked,
      // again later from teardown() when Meta's own terminate webhook
      // arrives) -- ctx.close() throws InvalidStateError on the second
      // call, and since that throw happened inside teardown() with nothing
      // after it wrapped in try/catch, teardown() aborted immediately and
      // never reached setPhase("idle") -- the UI stayed stuck on
      // "Connecting…" forever even after Meta itself gave up on the call.
      if (closed || stopped) return;
      stopped = true;
      closed = true;
      clearInterval(interval);
      try {
        ctx.close();
      } catch {
        // Already closed/closing -- nothing left to clean up.
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * App-wide WhatsApp Calling API (inbound only) UI — mounted once in the
 * dashboard layout so a call rings regardless of which page an agent is on,
 * not just while the inbox is open. State machine: idle → ringing →
 * connecting → active. See api/webhook/route.ts's handleCallEvent() for the
 * server side this reacts to, and api/calls/[callId]/{answer,reject,hangup}
 * for the routes this calls.
 */
export function IncomingCallOverlay() {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [ringingCall, setRingingCall] = useState<RingingCall | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopRingRef = useRef<() => void>(() => {});
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

  const teardown = useCallback(() => {
    try {
      pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
      pcRef.current?.close();
    } catch (error) {
      // Never let a WebRTC cleanup error stop the rest of teardown from
      // running -- the real 2026-09-10 bug (a double AudioContext.close()
      // throwing) left the UI permanently stuck on "Connecting…" because
      // nothing after the throw ever executed, including setPhase("idle").
      console.error("IncomingCallOverlay teardown: RTCPeerConnection cleanup failed", error);
    }
    stopRingRef.current();
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    activeCallIdRef.current = null;
    setPhase("idle");
    setRingingCall(null);
    setDuration(0);
    setMuted(false);
  }, []);

  useSSE({
    "incoming-call": (data) => {
      // Already on/ringing a call (rare — a second inbound call while one's
      // active) — for this first pass, ignore it; Meta's own no-answer
      // timeout resolves it on its side.
      if (phase !== "idle") return;

      setRingingCall({
        callId: data.callId,
        conversationId: data.conversationId,
        contactName: data.contact.name || `+${data.contact.phone}`,
        offerSdp: data.offerSdp,
      });
      activeCallIdRef.current = data.callId;
      setPhase("ringing");
      stopRingRef.current = playRingTone();

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(`Incoming call: ${data.contact.name || `+${data.contact.phone}`}`, {
          body: "Tap wadesk to answer",
          icon: "/favicon.ico",
          tag: `call-${data.callId}`,
        });
        notif.onclick = () => window.focus();
      }

      ringTimeoutRef.current = setTimeout(() => {
        if (activeCallIdRef.current === data.callId) teardown();
      }, RING_TIMEOUT_MS);
    },
    "call-answered": (data) => {
      // Another agent (or another of this agent's own tabs) took it first.
      if (activeCallIdRef.current === data.callId) teardown();
    },
    "call-ended": (data) => {
      if (activeCallIdRef.current === data.callId) teardown();
    },
  });

  const handleAnswer = useCallback(async () => {
    if (!ringingCall) return;
    const call = ringingCall;
    setPhase("connecting");
    stopRingRef.current();
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);

    try {
      console.log("[call] fetching TURN credentials…");
      const iceServers = await fetchIceServers();
      console.log(`[call] got ${iceServers.length} ICE server(s), requesting microphone…`);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      console.log("[call] microphone granted, creating RTCPeerConnection…");

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
      };

      await pc.setRemoteDescription({ type: "offer", sdp: call.offerSdp });
      console.log("[call] remote offer set, creating answer…");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log("[call] local answer set, gathering ICE candidates…");

      // Vanilla (non-trickle) ICE — Meta's HTTP-based signaling takes one
      // final SDP, not incremental candidates, so wait for gathering to
      // finish before sending our answer. Bounded with a timeout (real
      // incident, 2026-09-10: gathering never reached "complete" on the
      // first live test call, and with no timeout this awaited forever —
      // no network request ever left the browser, no error was ever
      // thrown, the UI just sat on "Connecting…" indefinitely). Proceeding
      // with whatever candidates gathered so far is the standard WebRTC
      // fallback here — a partial candidate set is still often usable.
      const ICE_GATHERING_TIMEOUT_MS = 5_000;
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          pc.removeEventListener("icegatheringstatechange", check);
          console.warn(`[call] ICE gathering did not complete within ${ICE_GATHERING_TIMEOUT_MS}ms (state=${pc.iceGatheringState}) — proceeding with partial candidates`);
          resolve();
        }, ICE_GATHERING_TIMEOUT_MS);
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
      });
      console.log(`[call] ICE gathering settled (state=${pc.iceGatheringState}), sending answer to server…`);

      const response = await fetch(`/api/calls/${call.callId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdpAnswer: pc.localDescription?.sdp }),
      });
      console.log(`[call] /answer responded ${response.status}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to answer call");
      }

      setPhase("active");
      durationIntervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (error) {
      console.error("[call] answer flow failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to answer call");
      teardown();
    }
  }, [ringingCall, teardown]);

  const handleReject = useCallback(async () => {
    if (!ringingCall) return;
    const callId = ringingCall.callId;
    teardown();
    try {
      await fetch(`/api/calls/${callId}/reject`, { method: "POST" });
    } catch {
      // Best-effort — Meta's own no-answer timeout closes it out either way.
    }
  }, [ringingCall, teardown]);

  const handleHangup = useCallback(async () => {
    const callId = activeCallIdRef.current;
    teardown();
    if (!callId) return;
    try {
      await fetch(`/api/calls/${callId}/hangup`, { method: "POST" });
    } catch {
      toast.error("Failed to end the call cleanly — it may still be connected on the other end");
    }
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => (track.enabled = !nextMuted));
    setMuted(nextMuted);
  }, [muted]);

  // Tear down cleanly if this component ever unmounts mid-call.
  useEffect(() => {
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "idle") return null;

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={remoteAudioRef} autoPlay />
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-80 text-center shadow-xl">
        <div className="w-16 h-16 rounded-full bg-green-600/20 flex items-center justify-center mx-auto mb-4">
          <Phone className="w-8 h-8 text-green-500" />
        </div>
        <p className="text-gray-100 font-medium text-lg">{ringingCall?.contactName ?? "Call"}</p>
        <p className="text-gray-400 text-sm mt-1">
          {phase === "ringing" && "Incoming WhatsApp call…"}
          {phase === "connecting" && "Connecting…"}
          {phase === "active" && `${minutes}:${seconds.toString().padStart(2, "0")}`}
        </p>

        <div className="flex items-center justify-center gap-4 mt-6">
          {phase === "ringing" && (
            <>
              <button
                onClick={handleReject}
                className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white"
                aria-label="Decline"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
              <button
                onClick={handleAnswer}
                className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center text-white"
                aria-label="Answer"
              >
                <Phone className="w-5 h-5" />
              </button>
            </>
          )}
          {phase === "active" && (
            <>
              <button
                onClick={toggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white ${
                  muted ? "bg-gray-700" : "bg-gray-800"
                }`}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button
                onClick={handleHangup}
                className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white"
                aria-label="Hang up"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
