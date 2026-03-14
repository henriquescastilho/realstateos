"use client";

import React from "react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "paid"
  | "pending"
  | "escalated"
  | "failed"
  | "done"
  | "running";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  style?: React.CSSProperties;
}

const variantClassMap: Record<BadgeVariant, string> = {
  default: "status-pill",
  success: "status-pill status-completed",
  done: "status-pill status-done",
  paid: "status-pill status-paid",
  warning: "status-pill status-pending",
  pending: "status-pill status-pending",
  running: "status-pill status-running",
  info: "status-pill",
  danger: "status-pill status-failed",
  escalated: "status-pill status-escalated",
  failed: "status-pill status-failed",
};

export function Badge({ children, variant = "default", style }: BadgeProps) {
  return (
    <span className={variantClassMap[variant]} style={style}>
      {children}
    </span>
  );
}

/** Derive variant from a status string (covers API status values). */
export function statusVariant(status: string): BadgeVariant {
  const s = status.toLowerCase();
  if (s === "paid" || s === "completed" || s === "resolved") return "paid";
  if (s === "done") return "done";
  if (s === "pending" || s === "queued") return "pending";
  if (s === "running" || s === "in_progress") return "running";
  if (s === "escalated") return "escalated";
  if (s === "failed" || s === "cancelled" || s === "overdue") return "failed";
  return "default";
}
