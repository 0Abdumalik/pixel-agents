/**
 * WebSocket communication module for standalone browser mode.
 *
 * Replaces VS Code postMessage/addEventListener('message') with a
 * WebSocket connection to the backend server.
 *
 * - Auto-reconnects every 3 seconds on disconnect
 * - Message format: { type: string, ...payload } (same as VS Code messages)
 * - Queues outbound messages while disconnected
 */

export type MessageHandler = (msg: Record<string, unknown>) => void;

const WS_URL = 'ws://localhost:3000/ws';
const RECONNECT_INTERVAL_MS = 3000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners: Set<MessageHandler> = new Set();
const sendQueue: string[] = [];

function connect(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    console.error('[wsClient] Failed to create WebSocket:', err);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[wsClient] Connected to', WS_URL);
    // Flush queued messages
    while (sendQueue.length > 0) {
      const queued = sendQueue.shift()!;
      ws!.send(queued);
    }
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;
      for (const handler of listeners) {
        try {
          handler(msg);
        } catch (err) {
          console.error('[wsClient] Handler error:', err);
        }
      }
    } catch (err) {
      console.error('[wsClient] Failed to parse message:', err);
    }
  };

  ws.onclose = () => {
    console.log('[wsClient] Disconnected');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error('[wsClient] Error:', err);
    // onclose will fire after onerror, triggering reconnect
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    console.log('[wsClient] Reconnecting...');
    connect();
  }, RECONNECT_INTERVAL_MS);
}

/**
 * Send a message to the server.
 * Messages are queued if the connection is not yet open.
 */
export function send(msg: unknown): void {
  const data = JSON.stringify(msg);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  } else {
    sendQueue.push(data);
    // Ensure we're trying to connect
    connect();
  }
}

/**
 * Register a callback for incoming messages.
 * Returns an unsubscribe function.
 */
export function onMessage(handler: MessageHandler): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/**
 * Initialize the WebSocket connection.
 * Call once at app startup (browser mode only).
 */
export function init(): void {
  connect();
}

/**
 * Dispatch a message locally to all registered handlers
 * (used by browserMock to inject asset messages through the same pipeline).
 */
export function dispatchLocal(msg: Record<string, unknown>): void {
  for (const handler of listeners) {
    try {
      handler(msg);
    } catch (err) {
      console.error('[wsClient] Handler error (local dispatch):', err);
    }
  }
}
