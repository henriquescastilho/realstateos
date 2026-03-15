"use client";

import { useSyncExternalStore } from "react";
import { getBalanceSnapshot, subscribeBalance, formatBRL, fetchBalanceFromAPI, getBalanceError, isBalanceLoading } from "@/lib/balance";
import { Icon } from "@/components/ui/Icon";

function useBalanceStore<T>(selector: () => T): T {
  return useSyncExternalStore(subscribeBalance, selector, selector);
}

export function BalanceWidget() {
  const balance = useBalanceStore(getBalanceSnapshot);
  const error = useBalanceStore(getBalanceError);
  const loading = useBalanceStore(isBalanceLoading);

  const hasError = !loading && error;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.375rem 0.75rem",
        borderRadius: "999px",
        background: hasError ? "var(--color-warning-bg, rgba(234,179,8,0.1))" : "var(--color-success-bg)",
        color: hasError ? "var(--color-warning, #eab308)" : "var(--color-success)",
        fontSize: "0.85rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
      title={hasError ? error : undefined}
    >
      <Icon name="account_balance" size={16} />
      <span>
        {loading ? "Carregando…" : hasError ? "Saldo indisponível" : `Saldo: ${formatBRL(balance)}`}
      </span>
      <button
        onClick={() => void fetchBalanceFromAPI()}
        title="Atualizar saldo"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          padding: 0,
          display: "flex",
          alignItems: "center",
          fontSize: "0.75rem",
        }}
      >
        ↻
      </button>
    </div>
  );
}
