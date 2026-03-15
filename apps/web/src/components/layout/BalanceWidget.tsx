"use client";

import { useSyncExternalStore } from "react";
import { getBalanceSnapshot, subscribeBalance, formatBRL } from "@/lib/balance";
import { Icon } from "@/components/ui/Icon";

export function BalanceWidget() {
  const balance = useSyncExternalStore(subscribeBalance, getBalanceSnapshot, () => 5_400_000);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.375rem 0.75rem",
        borderRadius: "999px",
        background: "var(--color-success-bg)",
        color: "var(--color-success)",
        fontSize: "0.85rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name="account_balance" size={16} />
      <span>Saldo: {formatBRL(balance)}</span>
    </div>
  );
}
