"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getNotifSnapshot,
  markAllRead,
  onNotification,
  startWs,
  stopWs,
  subscribeNotif,
} from "@/lib/ws";
import { getSnapshot, subscribe } from "@/lib/auth";
import { showToast } from "@/components/ui/Toast";

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const AUTH_SERVER_SNAPSHOT: ReturnType<typeof getSnapshot> = {
  user: null,
  accessToken: null,
  refreshToken: null,
  orgs: [],
};

const NOTIF_SERVER_SNAPSHOT: ReturnType<typeof getNotifSnapshot> = {
  notifications: [],
  unread: 0,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const auth = useSyncExternalStore(subscribe, getSnapshot, () => AUTH_SERVER_SNAPSHOT);

  const state = useSyncExternalStore(subscribeNotif, getNotifSnapshot, () => NOTIF_SERVER_SNAPSHOT);

  // Start / stop WebSocket based on auth state
  useEffect(() => {
    if (auth.accessToken) {
      startWs(auth.accessToken);
    } else {
      stopWs();
    }
    return () => {
      stopWs();
    };
  }, [auth.accessToken]);

  // Show toast for incoming events
  useEffect(() => {
    const unsub = onNotification((event) => {
      switch (event.type) {
        case "escalation.created":
          showToast(`Nova escalação: ${event.data.description}`, "warning");
          break;
        case "payment.received":
          showToast(
            `Pagamento recebido: R$ ${event.data.amount}${event.data.payer_name ? ` de ${event.data.payer_name}` : ""}`,
            "success",
          );
          break;
        case "agent.task.completed":
          showToast(`Agente concluiu: ${event.data.task_type}`, "info");
          break;
        case "maintenance.created":
          showToast(`Novo chamado: ${event.data.title}`, "info");
          break;
        case "contract.activated":
          showToast(
            `Contrato ativado: ${event.data.property_address ?? event.data.id}`,
            "success",
          );
          break;
      }
    });
    return unsub;
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && state.unread > 0) {
            markAllRead();
          }
        }}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "1.25rem",
          color: "var(--color-muted)",
          padding: "0.375rem",
          borderRadius: "var(--radius)",
        }}
        aria-label={`Notificações (${state.unread} não lidas)`}
      >
        🔔
        {state.unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              background: "var(--color-danger)",
              color: "#fff",
              fontSize: "0.6rem",
              fontWeight: 700,
              borderRadius: "9999px",
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {state.unread > 99 ? "99+" : state.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 1rem",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>
              Notificações
            </p>
            {state.unread > 0 && (
              <button
                onClick={() => markAllRead()}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "0.75rem",
                  color: "var(--color-primary)",
                  cursor: "pointer",
                }}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {state.notifications.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  padding: "2rem",
                  color: "var(--color-muted)",
                  fontSize: "0.875rem",
                }}
              >
                Nenhuma notificação
              </p>
            ) : (
              state.notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--color-border)",
                    background: n.read
                      ? "transparent"
                      : "var(--color-primary-subtle, rgba(99,102,241,0.05))",
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontWeight: 600,
                          fontSize: "0.8rem",
                          marginBottom: "0.125rem",
                        }}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--color-muted)",
                            lineHeight: 1.4,
                          }}
                        >
                          {n.body}
                        </p>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--color-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtTime(n.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
