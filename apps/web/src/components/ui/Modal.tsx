"use client";

import React, { useEffect, useRef } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Footer content (e.g. action buttons) */
  footer?: React.ReactNode;
  /** Max-width of the dialog panel. Default: 560 */
  maxWidth?: number;
}

/**
 * Accessible modal dialog.
 * - Focus trapped inside while open.
 * - Closes on Escape key press.
 * - Backdrop click closes modal.
 * - Screen-reader-friendly via role="dialog" + aria-modal.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 560,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Auto-focus dialog
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={description ? "modal-description" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="card"
        style={{
          position: "relative",
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
          outline: "none",
          zIndex: 1,
        }}
      >
        {/* Header */}
        {(title || description) && (
          <div style={{ marginBottom: 20 }}>
            {title && (
              <h2 id="modal-title" style={{ margin: 0, fontSize: "1.15rem" }}>
                {title}
              </h2>
            )}
            {description && (
              <p
                id="modal-description"
                style={{
                  margin: "6px 0 0",
                  color: "rgba(31,41,55,0.65)",
                  fontSize: "0.9rem",
                }}
              >
                {description}
              </p>
            )}
          </div>
        )}

        {/* Close button */}
        <button
          aria-label="Close modal"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1.2rem",
            lineHeight: 1,
            color: "rgba(31,41,55,0.5)",
            padding: 4,
            borderRadius: 4,
          }}
        >
          ✕
        </button>

        {/* Body */}
        <div>{children}</div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              marginTop: 24,
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
