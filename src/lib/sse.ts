/**
 * Global in-memory SSE connection store.
 * Uses globalThis so the Map survives Next.js hot-module reloads in dev.
 *
 * Structure: agentId → Set<controller>
 * One agent can have multiple controllers (multiple browser tabs).
 */

type SSEController = ReadableStreamDefaultController<Uint8Array>;

const globalForSSE = globalThis as unknown as {
  sseConnections: Map<string, Set<SSEController>>;
};

if (!globalForSSE.sseConnections) {
  globalForSSE.sseConnections = new Map();
}

const connections = globalForSSE.sseConnections;
const encoder = new TextEncoder();

export function addConnection(agentId: string, controller: SSEController): void {
  if (!connections.has(agentId)) connections.set(agentId, new Set());
  connections.get(agentId)!.add(controller);
}

export function removeConnection(agentId: string, controller: SSEController): void {
  const set = connections.get(agentId);
  if (!set) return;
  set.delete(controller);
  if (set.size === 0) connections.delete(agentId);
}

/**
 * Encode a named SSE event.
 * Format:  event: <name>\ndata: <json>\n\n
 */
export function encodeEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Send an event to a single agent's connections only.
 */
export function sendToAgent(agentId: string, event: string, data: unknown): void {
  const controllers = connections.get(agentId);
  if (!controllers) return;
  const payload = encodeEvent(event, data);
  controllers.forEach((ctrl) => {
    try {
      ctrl.enqueue(payload);
    } catch {
      controllers.delete(ctrl);
    }
  });
  if (controllers.size === 0) connections.delete(agentId);
}

/**
 * Broadcast an event to every connected agent.
 * Dead controllers are pruned on write failure.
 */
export function broadcastToAll(event: string, data: unknown): void {
  const payload = encodeEvent(event, data);
  connections.forEach((controllers, agentId) => {
    controllers.forEach((ctrl) => {
      try {
        ctrl.enqueue(payload);
      } catch {
        // Stream already closed — remove it
        controllers.delete(ctrl);
      }
    });
    if (controllers.size === 0) connections.delete(agentId);
  });
}
