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
import { getBalanceSnapshot, formatBRL } from "@/lib/balance";

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
  total_net: number;
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

/** Minimal SVG line chart for billing trend with saldo */
function BillingChart({ months }: { months: BillingMonth[] }) {
  if (!months.length)
    return (
      <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>
        Sem dados de cobrança.
      </p>
    );
  const recent = months.slice(-6);

  // Saldo fictício: acumula a diferença (líquido - bruto) mês a mês a partir do saldo Santander
  const santanderBalance = getBalanceSnapshot() / 100; // cents → reais
  const saldoData: number[] = [];
  let runningBalance = santanderBalance;
  for (let i = recent.length - 1; i >= 0; i--) {
    // Reconstruct backwards: subtract the monthly delta to get previous balance
    saldoData[i] = runningBalance;
    const delta = recent[i].total_paid - recent[i].total_charged;
    runningBalance -= delta;
  }

  const allValues = [
    ...recent.map((m) => m.total_charged || 0),
    ...recent.map((m) => m.total_net || 0),
    ...saldoData.map((v) => v || 0),
  ];
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  const W = 560;
  const H = 160;
  const PAD_L = 60;
  const PAD_R = 120;
  const chartW = W - PAD_L - PAD_R;

  function toX(i: number) {
    return PAD_L + (i / Math.max(recent.length - 1, 1)) * chartW;
  }
  function toY(val: number) {
    const v = val || 0;
    return H - ((v - minVal) / range) * (H - 20) - 10;
  }

  function makeLine(data: number[]) {
    return data.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  }

  const grossData = recent.map((m) => m.total_charged || 0);
  const netData = recent.map((m) => m.total_net || 0);
  const grossLine = makeLine(grossData);
  const netLine = makeLine(netData);
  const saldoLine = makeLine(saldoData);

  // Area fill between gross and net lines
  const areaPath = (() => {
    const top = grossData.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
    const bottom = [...netData].reverse().map((v, i) => {
      const idx = netData.length - 1 - i;
      return `L${toX(idx).toFixed(1)},${toY(v).toFixed(1)}`;
    }).join(" ");
    return `${top} ${bottom} Z`;
  })();

  // Smart label positioning: spread labels if too close
  const spreadLabels = (labels: { y: number; color: string; text: string }[]) => {
    const sorted = labels.map((l, i) => ({ ...l, orig: i })).sort((a, b) => a.y - b.y);
    const MIN_GAP = 14;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y - sorted[i - 1].y < MIN_GAP) {
        sorted[i].y = sorted[i - 1].y + MIN_GAP;
      }
    }
    return sorted.sort((a, b) => a.orig - b.orig);
  };

  const lastIdx = recent.length - 1;
  const labelX = toX(lastIdx) + 8;
  const endLabels = spreadLabels([
    { y: toY(grossData[lastIdx]), color: "#ef4444", text: fmt(grossData[lastIdx], true) },
    { y: toY(netData[lastIdx]), color: "#22c55e", text: fmt(netData[lastIdx], true) },
    { y: toY(saldoData[lastIdx]), color: "#4f46e5", text: fmt(saldoData[lastIdx], true) },
  ]);

  // Y axis values
  const yAxisValues = [0, 0.5, 1].map((pct) => ({
    y: H - pct * (H - 20) - 10,
    val: minVal + pct * range,
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 32}`}
      style={{ width: "100%", maxWidth: W, display: "block" }}
      aria-label="Faturamento e saldo"
    >
      {/* Grid lines + Y axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = H - pct * (H - 20) - 10;
        return (
          <line key={pct} x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="currentColor" opacity={0.06} />
        );
      })}
      {yAxisValues.map(({ y, val }) => (
        <text key={val} x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.35}>
          {fmt(val, true)}
        </text>
      ))}

      {/* Area between Bruto and Líquido */}
      <path d={areaPath} fill="rgba(239,68,68,0.08)" stroke="none" />

      {/* Faturamento Bruto (dashed) */}
      <path d={grossLine} fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinejoin="round" strokeDasharray="4,2" />
      {recent.map((m, i) => (
        <circle key={`g-${i}`} cx={toX(i)} cy={toY(m.total_charged)} r={3.5} fill="#ef4444" />
      ))}

      {/* Faturamento Líquido (solid) */}
      <path d={netLine} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinejoin="round" />
      {recent.map((m, i) => (
        <circle key={`n-${i}`} cx={toX(i)} cy={toY(m.total_net)} r={3.5} fill="#22c55e" />
      ))}

      {/* Saldo */}
      <path d={saldoLine} fill="none" stroke="#4f46e5" strokeWidth={2} strokeDasharray="6,3" strokeLinejoin="round" />
      {saldoData.map((v, i) => (
        <circle key={`s-${i}`} cx={toX(i)} cy={toY(v)} r={3} fill="#4f46e5" />
      ))}

      {/* Inline labels at first point */}
      {recent.length > 1 && (
        <>
          <text x={toX(0) - 4} y={toY(grossData[0]) - 8} fontSize={8} fill="#ef4444" fontWeight={600} textAnchor="start">Bruto</text>
          <text x={toX(0) - 4} y={toY(netData[0]) + 14} fontSize={8} fill="#22c55e" fontWeight={600} textAnchor="start">Líquido</text>
          <text x={toX(0) - 4} y={toY(saldoData[0]) - 8} fontSize={8} fill="#4f46e5" fontWeight={600} textAnchor="start">Saldo</text>
        </>
      )}

      {/* X axis labels */}
      {recent.map((m, i) => (
        <text
          key={m.month}
          x={toX(i)}
          y={H + 18}
          textAnchor="middle"
          fontSize={10}
          fill="currentColor"
          opacity={0.45}
        >
          {m.month.slice(5)}
        </text>
      ))}

      {/* Value labels on last points (smart-spaced) */}
      {recent.length > 0 && endLabels.map((l, i) => (
        <text key={i} x={labelX} y={l.y + 3} fontSize={9} fill={l.color} fontWeight={600}>
          {l.text}
        </text>
      ))}
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
        <Card title="Faturamento & Saldo (últimos 6 meses)">
          <div style={{ marginTop: 8 }}>
            <BillingChart months={billing} />
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 8,
                fontSize: "0.75rem",
                color: "var(--text-faint)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 10,
                    height: 3,
                    borderRadius: 2,
                    background: "#ef4444",
                    display: "inline-block",
                  }}
                />
                Faturamento Bruto
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 10,
                    height: 3,
                    borderRadius: 2,
                    background: "#22c55e",
                    display: "inline-block",
                  }}
                />
                Faturamento Líquido
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 10,
                    height: 2,
                    borderRadius: 2,
                    background: "#4f46e5",
                    display: "inline-block",
                    borderTop: "2px dashed #4f46e5",
                  }}
                />
                Saldo
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
