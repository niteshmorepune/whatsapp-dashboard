import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { addConnection, removeConnection, encodeEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = session.user.id;
  const encoder = new TextEncoder();

  // These are declared outside start() so cancel() can reach them
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let heartbeatTimer: ReturnType<typeof setInterval>;
  let cleaned = false;

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeatTimer);
    removeConnection(agentId, ctrl);
    try {
      ctrl.close();
    } catch {
      // Already closed — ignore
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      addConnection(agentId, ctrl);

      // Confirm the connection to the client
      ctrl.enqueue(encodeEvent("connected", { agentId }));

      // Keep the connection alive through proxies / load balancers.
      // SSE comment lines `: …` are ignored by the browser but prevent
      // idle-timeout disconnects (most proxies cut off at 60 s).
      heartbeatTimer = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 25_000);

      // Triggered when the HTTP connection is closed by the client
      request.signal.addEventListener("abort", cleanup);
    },

    cancel() {
      cleanup();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable response buffering in nginx / Vercel edge
      "X-Accel-Buffering": "no",
    },
  });
}
