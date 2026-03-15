"use client";

import React from "react";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "7px 14px", fontSize: "0.82rem" },
  md: { padding: "12px 18px", fontSize: "1rem" },
  lg: { padding: "15px 24px", fontSize: "1.05rem" },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const baseClass = variant === "primary" ? "primary-button" : "ghost-button";
  const dangerStyle: React.CSSProperties =
    variant === "danger"
      ? {
          background: "var(--color-danger-bg)",
          color: "var(--color-danger)",
          borderColor: "var(--color-danger-bg)",
        }
      : {};

  return (
    <button
      className={baseClass}
      disabled={disabled || loading}
      style={{ ...sizeStyles[size], ...dangerStyle, ...style }}
      {...props}
    >
      {loading ? <Spinner size={14} /> : null}
      {loading ? <span style={{ marginLeft: 6 }}>{children}</span> : children}
    </button>
  );
}

// Inline spinner import (avoids circular dep)
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        verticalAlign: "middle",
      }}
      aria-hidden="true"
    />
  );
}
