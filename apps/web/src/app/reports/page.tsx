"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Badge, Button, Card, Input, Select, Spinner } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortfolioKPIs {
  total_properties: number;
  active_contracts: number;
  monthly_revenue: string;
  occupancy_rate: number;
  default_rate: number;
  avg_ticket: string;
}

interface MonthlyRevenue {
  month: string;
  expected: number;
  received: number;
  overdue: number;
}

interface DefaultTrend {
  month: string;
  rate: number;
  overdue_count: number;
}

interface MaintenanceCost {
  month: string;
  cost: number;
  tickets: number;
}

interface ExportJob {
  job_id: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const MONTH_ABBR = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

// ---------------------------------------------------------------------------
// SVG bar chart component
// ---------------------------------------------------------------------------

interface BarSeries {
  label: string;
  color: string;
  values: number[];
}

function BarChart({
  series,
  labels,
  height = 200,
}: {
  series: BarSeries[];
  labels: string[];
  height?: number;
}) {
  const allValues = series.flatMap((s) => s.values);
  const maxVal = Math.max(...allValues, 1);
  const cols = labels.length;
  const barWidth = 14;
  const gap = 4;
  const groupWidth = series.length * (barWidth + gap);
  const colGap = 16;
  const totalWidth = cols * (groupWidth + colGap);
  const padLeft = 56;
  const padBottom = 28;
  const chartH = height - padBottom;

  return (
    <svg
      viewBox={`0 0 ${totalWidth + padLeft} ${height}`}
      style={{ width: "100%", height }}
    >
      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = chartH - chartH * p;
        return (
          <g key={p}>
            <line
              x1={padLeft}
              y1={y}
              x2={totalWidth + padLeft}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={0.5}
            />
            <text
              x={padLeft - 4}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-muted)"
            >
              {fmtBRL(maxVal * p)}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {labels.map((label, ci) => {
        const groupX = padLeft + ci * (groupWidth + colGap);
        return (
          <g key={label}>
            {series.map((s, si) => {
              const barH = (s.values[ci] / maxVal) * chartH;
              const x = groupX + si * (barWidth + gap);
              const y = chartH - barH;
              return (
                <rect
                  key={si}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill={s.color}
                  rx={2}
                />
              );
            })}
            <text
              x={groupX + groupWidth / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-muted)"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SVG line chart
// ---------------------------------------------------------------------------

function LineChart({
  values,
  labels,
  color,
  height = 160,
  formatY,
}: {
  values: number[];
  labels: string[];
  color: string;
  height?: number;
  formatY?: (v: number) => string;
}) {
  const maxVal = Math.max(...values, 0.01);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;
  const padLeft = 48;
  const padBottom = 24;
  const chartH = height - padBottom;
  const w = 600;
  const step =
    values.length > 1 ? (w - padLeft) / (values.length - 1) : w - padLeft;

  const pts = values
    .map((v, i) => {
      const x = padLeft + i * step;
      const y = chartH - ((v - minVal) / range) * chartH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height }}>
      {[0, 0.5, 1].map((p) => {
        const val = minVal + range * p;
        const y = chartH - chartH * p;
        return (
          <g key={p}>
            <line
              x1={padLeft}
              y1={y}
              x2={w}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={0.5}
            />
            <text
              x={padLeft - 4}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-muted)"
            >
              {formatY ? formatY(val) : val.toFixed(1)}
            </text>
          </g>
        );
      })}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
        const x = padLeft + i * step;
        const y = chartH - ((v - minVal) / range) * chartH;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={3} fill={color} />
            <text
              x={x}
              y={height - 6}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-muted)"
            >
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const today = new Date();
  const defaultFrom = `${today.getFullYear() - 1}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [kpis, setKpis] = useState<PortfolioKPIs | null>(null);
  const [revenue, setRevenue] = useState<MonthlyRevenue[]>([]);
  const [defaultTrend, setDefaultTrend] = useState<DefaultTrend[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = `?from=${dateFrom}&to=${dateTo}`;
      const [k, rev, def, maint] = await Promise.all([
        apiGet<PortfolioKPIs>(`/v1/reports/kpis${params}`),
        apiGet<MonthlyRevenue[]>(`/v1/reports/revenue${params}`).catch(
          () => [] as MonthlyRevenue[],
        ),
        apiGet<DefaultTrend[]>(`/v1/reports/default-trend${params}`).catch(
          () => [] as DefaultTrend[],
        ),
        apiGet<MaintenanceCost[]>(`/v1/reports/maintenance${params}`).catch(
          () => [] as MaintenanceCost[],
        ),
      ]);
      setKpis(k);
      setRevenue(rev);
      setDefaultTrend(def);
      setMaintenance(maint);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  const handleExport = useCallback(
    async (format: "pdf" | "xlsx") => {
      setExporting(format);
      setExportMsg(null);
      try {
        const res = await apiPost<ExportJob>("/v1/reports/export", {
          format,
          from: dateFrom,
          to: dateTo,
        });
        if (res.url) {
          window.open(res.url, "_blank");
        }
        setExportMsg(`Exportação iniciada (job ${res.job_id})`);
      } catch (e) {
        setExportMsg(
          `Erro: ${e instanceof Error ? e.message : "falha na exportação"}`,
        );
      } finally {
        setExporting(null);
      }
    },
    [dateFrom, dateTo],
  );

  // ---------------------------------------------------------------------------
  // Chart data
  // ---------------------------------------------------------------------------

  const revenueLabels = revenue.map((r) => {
    const [yr, mo] = r.month.split("-");
    return MONTH_ABBR[parseInt(mo, 10) - 1] ?? r.month;
  });

  const revenueBarSeries: BarSeries[] = [
    {
      label: "Esperado",
      color: "var(--color-primary)",
      values: revenue.map((r) => r.expected),
    },
    {
      label: "Recebido",
      color: "var(--color-success)",
      values: revenue.map((r) => r.received),
    },
    {
      label: "Em atraso",
      color: "var(--color-danger)",
      values: revenue.map((r) => r.overdue),
    },
  ];

  const defaultLabels = defaultTrend.map((d) => {
    const [, mo] = d.month.split("-");
    return MONTH_ABBR[parseInt(mo, 10) - 1] ?? d.month;
  });

  const maintLabels = maintenance.map((m) => {
    const [, mo] = m.month.split("-");
    return MONTH_ABBR[parseInt(mo, 10) - 1] ?? m.month;
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Relatórios</h2>
          <p>Análise de desempenho do portfólio imobiliário</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button
            variant="ghost"
            onClick={() => void handleExport("xlsx")}
            disabled={!!exporting}
            size="sm"
          >
            {exporting === "xlsx" ? <Spinner size="sm" /> : "Exportar XLSX"}
          </Button>
          <Button
            onClick={() => void handleExport("pdf")}
            disabled={!!exporting}
            size="sm"
          >
            {exporting === "pdf" ? <Spinner size="sm" /> : "Exportar PDF"}
          </Button>
        </div>
      </header>

      {exportMsg && (
        <p
          style={{
            marginBottom: "1rem",
            fontSize: "0.875rem",
            color: exportMsg.startsWith("Erro")
              ? "var(--color-danger)"
              : "var(--color-success)",
          }}
        >
          {exportMsg}
        </p>
      )}

      {/* Date range */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-end",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <Input
          label="De (mês/ano)"
          type="month"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          label="Até (mês/ano)"
          type="month"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
        <Button onClick={() => void load()} disabled={loading} size="sm">
          {loading ? <Spinner size="sm" /> : "Aplicar"}
        </Button>
      </div>

      {loading ? (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "3rem" }}
        >
          <Spinner size="lg" label="Carregando relatórios…" />
        </div>
      ) : error ? (
        <Card>
          <p style={{ color: "var(--color-danger)", textAlign: "center" }}>
            {error}
          </p>
          <div style={{ textAlign: "center", marginTop: "1rem" }}>
            <Button onClick={() => void load()}>Tentar novamente</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* KPI grid */}
          {kpis && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "1rem",
                marginBottom: "2rem",
              }}
            >
              <Card title="Imóveis no portfólio">
                <p style={{ fontSize: "2rem", fontWeight: 700 }}>
                  {kpis.total_properties}
                </p>
              </Card>
              <Card title="Contratos ativos">
                <p
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "var(--color-success)",
                  }}
                >
                  {kpis.active_contracts}
                </p>
              </Card>
              <Card title="Receita mensal">
                <p
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "var(--color-primary)",
                  }}
                >
                  {fmtBRL(Number(kpis.monthly_revenue))}
                </p>
              </Card>
              <Card title="Taxa de ocupação">
                <p
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color:
                      kpis.occupancy_rate >= 0.8
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                  }}
                >
                  {fmtPct(kpis.occupancy_rate)}
                </p>
              </Card>
              <Card title="Taxa de inadimplência">
                <p
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color:
                      kpis.default_rate <= 0.05
                        ? "var(--color-success)"
                        : kpis.default_rate <= 0.1
                          ? "var(--color-warning)"
                          : "var(--color-danger)",
                  }}
                >
                  {fmtPct(kpis.default_rate)}
                </p>
              </Card>
              <Card title="Ticket médio">
                <p style={{ fontSize: "2rem", fontWeight: 700 }}>
                  {fmtBRL(Number(kpis.avg_ticket))}
                </p>
              </Card>
            </div>
          )}

          {/* Revenue chart */}
          {revenue.length > 0 && (
            <Card
              title="Desempenho de cobrança"
              description="Comparativo mensal: valor esperado vs. recebido vs. em atraso"
            >
              <div style={{ marginTop: "1rem" }}>
                <BarChart
                  series={revenueBarSeries}
                  labels={revenueLabels}
                  height={220}
                />
                <div
                  style={{
                    display: "flex",
                    gap: "1.5rem",
                    justifyContent: "center",
                    marginTop: "0.75rem",
                  }}
                >
                  {revenueBarSeries.map((s) => (
                    <div
                      key={s.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          background: s.color,
                          borderRadius: 2,
                        }}
                      />
                      <span style={{ fontSize: "0.75rem" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            {/* Default rate trend */}
            {defaultTrend.length > 0 && (
              <Card
                title="Tendência de inadimplência"
                description="Taxa de inadimplência por mês"
              >
                <div style={{ marginTop: "1rem" }}>
                  <LineChart
                    values={defaultTrend.map((d) => d.rate * 100)}
                    labels={defaultLabels}
                    color="var(--color-danger)"
                    height={160}
                    formatY={(v) => `${v.toFixed(1)}%`}
                  />
                </div>
              </Card>
            )}

            {/* Maintenance cost */}
            {maintenance.length > 0 && (
              <Card
                title="Custo de manutenção"
                description="Gasto total com chamados de manutenção por mês"
              >
                <div style={{ marginTop: "1rem" }}>
                  <LineChart
                    values={maintenance.map((m) => m.cost)}
                    labels={maintLabels}
                    color="var(--color-warning)"
                    height={160}
                    formatY={(v) => fmtBRL(v)}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                    marginTop: "1rem",
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-muted)",
                      }}
                    >
                      Total no período
                    </p>
                    <p style={{ fontWeight: 700 }}>
                      {fmtBRL(maintenance.reduce((s, m) => s + m.cost, 0))}
                    </p>
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-muted)",
                      }}
                    >
                      Total de chamados
                    </p>
                    <p style={{ fontWeight: 700 }}>
                      {maintenance.reduce((s, m) => s + m.tickets, 0)}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Empty state */}
          {revenue.length === 0 &&
            defaultTrend.length === 0 &&
            maintenance.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem",
                  color: "var(--color-muted)",
                }}
              >
                <p style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
                  Sem dados para o período selecionado
                </p>
                <p style={{ fontSize: "0.875rem" }}>
                  Ajuste o intervalo de datas e clique em Aplicar.
                </p>
              </div>
            )}
        </>
      )}
    </section>
  );
}
