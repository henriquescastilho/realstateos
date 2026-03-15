"use client";

import React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
}

export function Select({
  label,
  options,
  error,
  placeholder,
  id,
  ...props
}: SelectProps) {
  const selectId =
    id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <label style={{ display: "grid", gap: 6, color: "var(--text-secondary)" }}>
      {label && <span style={{ fontSize: "0.88rem" }}>{label}</span>}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        style={{
          borderColor: error ? "rgba(220,38,38,0.5)" : undefined,
        }}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="error-text" style={{ fontSize: "0.82rem" }}>
          {error}
        </span>
      )}
    </label>
  );
}
