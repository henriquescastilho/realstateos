"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { apiGet } from "@/lib/api";

interface RevenueData {
  monthly_revenue: number;
  admin_fee_revenue: number;
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function BalanceWidget() {
  const [data, setData] = useState<RevenueData | null>(null);

  useEffect(() => {
    apiGet<{ monthly_revenue?: number; admin_fee_revenue?: number }>("/v1/analytics/portfolio")
      .then((r) => setData({
        monthly_revenue: Number(r.monthly_revenue) || 0,
        admin_fee_revenue: Number(r.admin_fee_revenue) || 0,
      }))
      .catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.375rem 0.75rem",
        borderRadius: "999px",
        background: "var(--color-success-bg)",
        color: "var(--color-success)",
        fontSize: "0.8rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <Icon name="receipt" size={14} />
        Bruta: {fmtBRL(data.monthly_revenue)}
      </span>
      <span style={{ opacity: 0.4 }}>|</span>
      <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <Icon name="wallet" size={14} />
        Líquida: {fmtBRL(data.admin_fee_revenue)}
      </span>
    </div>
  );
}
