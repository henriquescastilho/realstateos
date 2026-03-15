"use client";

import React from "react";

export interface SpinnerProps {
  size?: number;
  color?: string;
  label?: string;
  className?: string;
}

export function Spinner({
  size = 24,
  color = "currentColor",
  label = "Loading…",
  className,
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${Math.max(2, Math.round(size / 8))}px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

/** Full-page loading overlay */
export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "80px 40px",
        color: "var(--text-muted)",
      }}
    >
      <Spinner size={36} />
      <p style={{ margin: 0, fontSize: "0.9rem" }}>{label}</p>
    </div>
  );
}
