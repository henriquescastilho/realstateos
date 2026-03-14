/**
 * WebSocket client for real-time notifications.
 * Connects to /ws/notifications and dispatches typed events.
 */

const WS_URL =
  (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000") +
  "/ws/notifications";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type NotificationEvent =
  | {
      type: "escalation.created";
      data: { id: string; description: string; priority: string };
    }
  | {
      type: "payment.received";
      data: { id: string; amount: string; payer_name?: string };
    }
  | {
      type: "agent.task.completed";
      data: { id: string; task_type: string; status: string };
    }
  | {
      type: "maintenance.created";
      data: { id: string; title: string; priority: string };
    }
  | {
      type: "contract.activated";
      data: { id: string; property_address?: string };
    }
  | { type: "ping"; data: Record<string, never> };

export type NotificationHandler = (event: NotificationEvent) => void;

// ---------------------------------------------------------------------------
// Notification store (module-level, useSyncExternalStore compatible)
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

interface NotifState {
  notifications: Notification[];
  unread: number;
}

let _state: NotifState = { notifications: [], unread: 0 };
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

export function getNotifSnapshot() {
  return _state;
}

export function subscribeNotif(fn: () => void) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _push(n: Omit<Notification, "id" | "timestamp" | "read">) {
  const notif: Notification = {
    ...n,
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    read: false,
  };
  _state = {
    notifications: [notif, ..._state.notifications].slice(0, 50),
    unread: _state.unread + 1,
  };
  _notify();
}

export function markAllRead() {
  _state = {
    notifications: _state.notifications.map((n) => ({ ...n, read: true })),
    unread: 0,
  };
  _notify();
}

// ---------------------------------------------------------------------------
// WebSocket manager
// ---------------------------------------------------------------------------

let _ws: WebSocket | null = null;
let _handlers: NotificationHandler[] = [];
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _stopped = false;

function _labelEvent(event: NotificationEvent): {
  title: string;
  body: string;
} {
  switch (event.type) {
    case "escalation.created":
      return {
        title: "Nova escalação",
        body: `${event.data.description} [${event.data.priority}]`,
      };
    case "payment.received":
      return {
        title: "Pagamento recebido",
        body: `R$ ${event.data.amount}${event.data.payer_name ? ` de ${event.data.payer_name}` : ""}`,
      };
    case "agent.task.completed":
      return {
        title: "Tarefa do agente concluída",
        body: `${event.data.task_type} — ${event.data.status}`,
      };
    case "maintenance.created":
      return {
        title: "Novo chamado de manutenção",
        body: `${event.data.title} [${event.data.priority}]`,
      };
    case "contract.activated":
      return {
        title: "Contrato ativado",
        body: event.data.property_address ?? event.data.id,
      };
    default:
      return { title: "Notificação", body: "" };
  }
}

function _connect(token?: string) {
  if (_stopped) return;
  const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;

  try {
    _ws = new WebSocket(url);
  } catch {
    _scheduleReconnect(token);
    return;
  }

  _ws.onmessage = (evt) => {
    try {
      const event = JSON.parse(evt.data as string) as NotificationEvent;
      if (event.type === "ping") return;
      _handlers.forEach((h) => h(event));
      const label = _labelEvent(event);
      _push({ type: event.type, ...label });
    } catch {
      // ignore malformed messages
    }
  };

  _ws.onclose = () => {
    _scheduleReconnect(token);
  };

  _ws.onerror = () => {
    _ws?.close();
  };
}

function _scheduleReconnect(token?: string) {
  if (_stopped) return;
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    _connect(token);
  }, 5000);
}

/** Start the WebSocket connection. Call once on app mount. */
export function startWs(token?: string) {
  _stopped = false;
  _connect(token);
}

/** Stop the WebSocket and prevent reconnection. */
export function stopWs() {
  _stopped = true;
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _ws?.close();
  _ws = null;
}

/** Register a handler for incoming events. Returns an unsubscribe function. */
export function onNotification(handler: NotificationHandler) {
  _handlers.push(handler);
  return () => {
    _handlers = _handlers.filter((h) => h !== handler);
  };
}
