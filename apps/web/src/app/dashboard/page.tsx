"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { authFetch } from "@/lib/auth";
import type { TaskRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types matching the analytics API response
// ---------------------------------------------------------------------------

interface PortfolioKPIs {
  active_contracts: number;
  total_properties: number;
  monthly_revenue: number;
  default_rate_3m_pct: number;
  open_escalations: number;
}

interface BillingMonth {
  month: string; // "YYYY-MM"
  total_charged: number;
  total_paid: number;
  payment_rate_pct: number;
}

interface BillingAnalytics {
  months: BillingMonth[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await authFetch(path.startsWith("/") ? path : `/${path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

function fmt(n: number, currency = false) {
  if (currency)
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
  return new Intl.NumberFormat("pt-BR").format(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "yellow";
}) {
  const accentColor =
    accent === "green"
      ? "#15803d"
      : accent === "red"
        ? "#b91c1c"
        : accent === "yellow"
          ? "#b45309"
          : undefined;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 10,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: "0.78rem",
          color: "rgba(0,0,0,0.5)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: "1.9rem",
          fontWeight: 700,
          color: accentColor ?? "#111827",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: "0.78rem", color: "rgba(0,0,0,0.45)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

/** Minimal SVG bar chart for billing trend */
function BillingChart({ months }: { months: BillingMonth[] }) {
  if (!months.length)
    return (
      <p style={{ color: "rgba(0,0,0,0.4)", fontSize: "0.85rem" }}>
        Sem dados de cobrança.
      </p>
    );
  const recent = months.slice(-6);
  const maxVal = Math.max(...recent.map((m) => m.total_charged), 1);
  const W = 480;
  const H = 120;
  const barW = Math.floor((W - 24) / recent.length) - 6;

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 28}`}
      style={{ width: "100%", maxWidth: W, display: "block" }}
      aria-label="Tendência de cobranças mensais"
    >
      {recent.map((m, i) => {
        const x = 12 + i * (barW + 6);
        const chargedH = Math.round((m.total_charged / maxVal) * H);
        const paidH = Math.round((m.total_paid / maxVal) * H);
        const shortMonth = m.month.slice(5); // "MM"
        return (
          <g key={m.month}>
            {/* charged bar */}
            <rect
              x={x}
              y={H - chargedH}
              width={barW}
              height={chargedH}
              rx={3}
              fill="rgba(79,70,229,0.18)"
            />
            {/* paid bar */}
            <rect
              x={x}
              y={H - paidH}
              width={barW}
              height={paidH}
              rx={3}
              fill="#4f46e5"
            />
            <text
              x={x + barW / 2}
              y={H + 16}
              textAnchor="middle"
              fontSize={10}
              fill="rgba(0,0,0,0.45)"
            >
              {shortMonth}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ActivityRow({ task }: { task: TaskRecord }) {
  const variantMap: Record<
    string,
    "success" | "error" | "warning" | "info" | "default"
  > = {
    DONE: "success",
    FAILED: "error",
    ESCALATED: "warning",
    RUNNING: "info",
    PENDING: "default",
  };
  const msg =
    typeof task.payload?.message === "string"
      ? task.payload.message
      : task.type;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <Badge variant={variantMap[task.status] ?? "default"}>
        {task.status}
      </Badge>
      <span style={{ fontSize: "0.86rem", color: "#374151", flex: 1 }}>
        {msg}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [kpis, setKpis] = useState<PortfolioKPIs | null>(null);
  const [billing, setBilling] = useState<BillingMonth[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [kpisData, billingData, tasksData] = await Promise.allSettled([
          apiFetch<PortfolioKPIs>("/analytics/portfolio"),
          apiFetch<BillingAnalytics>("/analytics/billing"),
          apiFetch<{ items: TaskRecord[] } | TaskRecord[]>(
            "/tasks?per_page=10",
          ),
        ]);
        if (kpisData.status === "fulfilled") setKpis(kpisData.value);
        if (billingData.status === "fulfilled")
          setBilling(billingData.value.months ?? []);
        if (tasksData.status === "fulfilled") {
          const raw = tasksData.value;
          setTasks(
            Array.isArray(raw)
              ? raw.slice(0, 8)
              : (raw.items ?? []).slice(0, 8),
          );
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Erro ao carregar dashboard.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <ProtectedPage
      title="Dashboard"
      description="Visão geral do portfólio imobiliário."
    >
      {error && (
        <p className="error-banner" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      {/* Quick actions */}
      <div
        style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}
      >
        <Link href="/contracts/new">
          <Button size="sm" variant="primary">
            + Novo Contrato
          </Button>
        </Link>
        <Link href="/billing">
          <Button size="sm" variant="ghost">
            Cobranças
          </Button>
        </Link>
        <Link href="/payments">
          <Button size="sm" variant="ghost">
            Pagamentos
          </Button>
        </Link>
        <Link href="/reports">
          <Button size="sm" variant="ghost">
            Relatórios
          </Button>
        </Link>
      </div>

      {/* KPI cards */}
      {loading && !kpis ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spinner size={32} />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 28,
          }}
        >
          <KpiCard
            title="Contratos ativos"
            value={kpis ? fmt(kpis.active_contracts) : "—"}
          />
          <KpiCard
            title="Imóveis"
            value={kpis ? fmt(kpis.total_properties) : "—"}
          />
          <KpiCard
            title="Receita mensal"
            value={kpis ? fmt(kpis.monthly_revenue, true) : "—"}
            accent="green"
          />
          <KpiCard
            title="Inadimplência (3m)"
            value={kpis ? `${kpis.default_rate_3m_pct.toFixed(1)}%` : "—"}
            accent={kpis && kpis.default_rate_3m_pct > 10 ? "red" : "green"}
          />
          <KpiCard
            title="Escalações abertas"
            value={kpis ? fmt(kpis.open_escalations) : "—"}
            accent={kpis && kpis.open_escalations > 0 ? "yellow" : "green"}
          />
        </div>
      )}

      {/* Charts + Activity */}
      <div className="grid-2col" style={{ gap: 18, alignItems: "start" }}>
        <Card title="Tendência de cobranças (últimos 6 meses)">
          <div style={{ marginTop: 8 }}>
            <BillingChart months={billing} />
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 8,
                fontSize: "0.75rem",
                color: "rgba(0,0,0,0.45)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: "#4f46e5",
                    display: "inline-block",
                  }}
                />
                Pago
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: "rgba(79,70,229,0.18)",
                    display: "inline-block",
                  }}
                />
                Cobrado
              </span>
            </div>
          </div>
        </Card>

        <Card title="Atividade recente">
          {loading ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <Spinner size={20} />
            </div>
          ) : tasks.length === 0 ? (
            <p style={{ color: "rgba(0,0,0,0.4)", fontSize: "0.85rem" }}>
              Nenhuma tarefa registrada.
            </p>
          ) : (
            <div>
              {tasks.map((t) => (
                <ActivityRow key={t.id} task={t} />
              ))}
              <Link
                href="/tasks"
                style={{
                  fontSize: "0.8rem",
                  color: "#4f46e5",
                  display: "block",
                  marginTop: 10,
                  textDecoration: "none",
                }}
              >
                Ver todas →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </ProtectedPage>
  );
}
