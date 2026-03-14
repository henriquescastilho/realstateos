"use client";

import React, { useCallback, useEffect, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

// ---------------------------------------------------------------------------
// Module-level store (no context required)
// ---------------------------------------------------------------------------

type Listener = () => void;

let _toasts: ToastItem[] = [];
const _listeners = new Set<Listener>();

function notifyListeners() {
  _listeners.forEach((l) => l());
}

function getSnapshot(): ToastItem[] {
  return _toasts;
}

function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Imperative API — usable outside React components (e.g. from WS handlers)
// ---------------------------------------------------------------------------

export function showToast(
  message: string,
  variant: ToastVariant = "info",
): void {
  const id = crypto.randomUUID();
  _toasts = [..._toasts, { id, message, variant }];
  notifyListeners();
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 4000);
}

// ---------------------------------------------------------------------------
// useToast hook — returns { toasts, show, dismiss }
// ---------------------------------------------------------------------------

export function useToast() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = crypto.randomUUID();
      _toasts = [..._toasts, { id, message, variant }];
      notifyListeners();

      setTimeout(() => {
        _toasts = _toasts.filter((t) => t.id !== id);
        notifyListeners();
      }, 4000);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    _toasts = _toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, []);

  return { toasts, show, dismiss };
}

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const variantBg: Record<ToastVariant, string> = {
  success: "rgba(22,163,74,0.14)",
  error: "rgba(220,38,38,0.14)",
  warning: "rgba(180,90,42,0.16)",
  info: "rgba(59,130,246,0.14)",
};

const variantColor: Record<ToastVariant, string> = {
  success: "#166534",
  error: "#991b1b",
  warning: "#803d1d",
  info: "#1e40af",
};

// ---------------------------------------------------------------------------
// Toast — single notification component
// ---------------------------------------------------------------------------

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss: () => void;
}

export function Toast({ message, variant = "info", onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 16,
        background: variantBg[variant],
        color: variantColor[variant],
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        minWidth: 280,
        maxWidth: 400,
        border: `1px solid ${variantBg[variant]}`,
        animation: "slideIn 0.2s ease",
      }}
    >
      <span style={{ fontSize: "0.92rem" }}>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          fontSize: "1.1rem",
          lineHeight: 1,
          padding: "0 4px",
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToastContainer — renders all active toasts, fixed bottom-right
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (!toasts.length) return null;

  return (
    <div
      aria-label="Notifications"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <Toast
            message={t.message}
            variant={t.variant}
            onDismiss={() => dismiss(t.id)}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToastProvider — legacy compat alias; wraps children and renders container
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer />
    </>
  );
}
