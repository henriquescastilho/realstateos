"use client";

import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({
  label,
  error,
  hint,
  id,
  className,
  ...props
}: InputProps) {
  const inputId =
    id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <label style={{ display: "grid", gap: 6, color: "rgba(31,41,55,0.75)" }}>
      {label && <span style={{ fontSize: "0.88rem" }}>{label}</span>}
      <input
        id={inputId}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        aria-invalid={error ? true : undefined}
        style={{
          borderColor: error ? "rgba(220,38,38,0.5)" : undefined,
          background: error ? "rgba(220,38,38,0.04)" : undefined,
        }}
        {...props}
      />
      {error && (
        <span
          id={`${inputId}-error`}
          className="error-text"
          style={{ fontSize: "0.82rem" }}
        >
          {error}
        </span>
      )}
      {hint && !error && (
        <span
          id={`${inputId}-hint`}
          className="muted-text"
          style={{ fontSize: "0.82rem" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
