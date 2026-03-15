"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
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

interface DelinquentTenant {
  tenant_name: string;
  property_address: string;
  period: string;
  amount: number;
  due_date: string;
  days_overdue: number;
}

interface ExpiringContract {
  property_address: string;
  tenant_name: string;
  owner_name: string;
  end_date: string;
  rent_amount: number;
  readjustment_index: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NODE_API =
  process.env.NEXT_PUBLIC_NODE_API_URL ?? "http://localhost:3001/api/v1";

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${NODE_API}${path.startsWith("/") ? path : `/${path}`}`;
  const token =
    typeof window !== "undefined"
      ? JSON.parse(
          localStorage.getItem("realstateos_auth") ??
            sessionStorage.getItem("realstateos_auth") ??
            "{}",
        )?.accessToken
      : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  // Node API wraps responses in { ok, data } — unwrap it
  if (json && typeof json === "object" && "data" in json) {
    return json.data as T;
  }
  return json as T;
}

function fmt(n: number | null | undefined, currency = false) {
  const val = n ?? 0;
  if (currency)
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  return new Intl.NumberFormat("pt-BR").format(val);
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
  const accentVar =
    accent === "green"
      ? "var(--color-success)"
      : accent === "red"
        ? "var(--color-danger)"
        : accent === "yellow"
          ? "var(--color-warning)"
          : undefined;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
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
          color: "var(--text-muted)",
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
          color: accentVar ?? "var(--text-primary)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>
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
      <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>
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
              fill="currentColor"
              opacity={0.45}
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
  const variantMap: Record<string, BadgeVariant> = {
    DONE: "done",
    FAILED: "failed",
    ESCALATED: "escalated",
    RUNNING: "running",
    PENDING: "pending",
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
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <Badge variant={variantMap[task.status] ?? "default"}>
        {task.status}
      </Badge>
      <span style={{ fontSize: "0.86rem", color: "var(--text-secondary)", flex: 1 }}>
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
  const [delinquents, setDelinquents] = useState<DelinquentTenant[]>([]);
  const [expiringContracts, setExpiringContracts] = useState<ExpiringContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [kpisData, billingData, tasksData, delinquentsData, expiringData] =
          await Promise.allSettled([
            apiFetch<PortfolioKPIs>("/analytics/portfolio"),
            apiFetch<BillingAnalytics>("/analytics/billing"),
            apiFetch<TaskRecord[]>("/analytics/tasks?per_page=10"),
            apiFetch<DelinquentTenant[]>("/analytics/delinquent"),
            apiFetch<ExpiringContract[]>("/analytics/expiring-contracts"),
          ]);
        if (kpisData.status === "fulfilled") setKpis(kpisData.value);
        if (billingData.status === "fulfilled")
          setBilling(billingData.value.months ?? []);
        if (tasksData.status === "fulfilled") {
          setTasks((tasksData.value ?? []).slice(0, 8));
        }
        if (delinquentsData.status === "fulfilled")
          setDelinquents(delinquentsData.value ?? []);
        if (expiringData.status === "fulfilled")
          setExpiringContracts(expiringData.value ?? []);
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

      {/* KPI cards */}
      {loading && !kpis ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spinner size={32} />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 14,
            marginBottom: 28,
            minWidth: 0,
            width: "100%",
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
            value={kpis ? `${(kpis.default_rate_3m_pct ?? 0).toFixed(1)}%` : "—"}
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
                color: "var(--text-faint)",
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
            <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>
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
                  color: "var(--color-info)",
                  display: "block",
                  marginTop: 10,
                  textDecoration: "none",
                }}
              >
                Ver todas <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Inadimplentes */}
      <div style={{ marginTop: 28 }}>
        <Card
          title="Inadimplentes"
          actions={
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--color-danger)",
                display: "inline-block",
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
          }
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <Spinner size={20} />
            </div>
          ) : delinquents.length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>
              Nenhum inadimplente.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.84rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      textAlign: "left",
                    }}
                  >
                    {["Inquilino", "Imóvel", "Período", "Valor", "Vencimento", "Atraso"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "6px 10px",
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {delinquents.map((d, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {d.tenant_name}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.property_address}
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {d.period}
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(d.amount, true)}
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        {d.due_date
                          ? new Date(d.due_date).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <Badge variant="danger">
                          {d.days_overdue}d
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Contratos Vencendo */}
      <div style={{ marginTop: 18 }}>
        <Card
          title="Contratos Vencendo"
          actions={
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--color-warning)",
                display: "inline-block",
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
          }
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <Spinner size={20} />
            </div>
          ) : expiringContracts.length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>
              Nenhum contrato vence este mês.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.84rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      textAlign: "left",
                    }}
                  >
                    {["Imóvel", "Inquilino", "Proprietário", "Vencimento", "Aluguel", "Índice"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "6px 10px",
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {expiringContracts.map((c, i) => {
                    const endDate = c.end_date ? new Date(c.end_date) : null;
                    const day = endDate
                      ? endDate.toLocaleDateString("pt-BR")
                      : "—";
                    const dayNum = endDate ? endDate.getDate() : null;
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <td
                          style={{
                            padding: "8px 10px",
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.property_address}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {c.tenant_name}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {c.owner_name}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          {dayNum !== null && (
                            <span
                              style={{
                                fontWeight: 700,
                                color: "var(--color-warning)",
                                marginRight: 4,
                              }}
                            >
                              Dia {dayNum}
                            </span>
                          )}
                          <span style={{ fontSize: "0.78rem", color: "var(--text-faint)" }}>
                            {day}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "8px 10px",
                            whiteSpace: "nowrap",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(c.rent_amount, true)}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <Badge variant="warning">
                            {c.readjustment_index ?? "—"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </ProtectedPage>
  );
}
