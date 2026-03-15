"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { Charge, Contract } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  statusVariant,
} from "@/components/ui";
import type { Column } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChargeDetail extends Charge {
  property_address?: string;
  renter_name?: string;
  contract_monthly_rent?: string;
  composition?: ChargeItem[];
  payment_info?: PaymentInfo;
}

interface ChargeItem {
  label: string;
  amount: string;
  type: "rent" | "fee" | "adjustment" | "tax";
}

interface PaymentInfo {
  paid_at?: string;
  payment_method?: string;
  transaction_id?: string;
  amount_paid?: string;
}

// Calendar day
interface CalDay {
  day: number;
  charges: ChargeDetail[];
  isCurrentMonth: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function fmtBRL(s: string | number) {
  return Number(s).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const STATUS_OPTIONS = [
  { value: "open", label: "Em aberto" },
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Pago" },
  { value: "overdue", label: "Em atraso" },
  { value: "partial", label: "Parcial" },
  { value: "cancelled", label: "Cancelado" },
];

const TYPE_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  { value: "RENT", label: "Aluguel" },
  { value: "IPTU", label: "IPTU" },
  { value: "CONDO", label: "Condomínio" },
  { value: "CONSOLIDATED", label: "Consolidado" },
];

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// ---------------------------------------------------------------------------
// Build calendar grid
// ---------------------------------------------------------------------------

function buildCalendar(
  year: number,
  month: number,
  charges: ChargeDetail[],
): CalDay[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const days: CalDay[] = [];

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ day: daysInPrev - i, charges: [], isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayCharges = charges.filter((c) => c.due_date?.startsWith(dateStr));
    days.push({ day: d, charges: dayCharges, isCurrentMonth: true });
  }
  // Next month padding
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ day: d, charges: [], isCurrentMonth: false });
  }
  return days;
}

// ---------------------------------------------------------------------------
// View type
// ---------------------------------------------------------------------------

type ViewMode = "list" | "calendar";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const today = new Date();
  const [charges, setCharges] = useState<ChargeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  // Filters — default to open invoices (pending + overdue)
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("open");
  const [filterType, setFilterType] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Detail modal
  const [selected, setSelected] = useState<ChargeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);


  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<ChargeDetail[]>("/v1/charges");
      setCharges(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar faturas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Open detail
  // ---------------------------------------------------------------------------

  const openDetail = useCallback(async (charge: ChargeDetail) => {
    setSelected(charge);
    setDetailLoading(true);
    try {
      const detail = await apiGet<ChargeDetail>(`/v1/charges/${charge.id}`);
      setSelected(detail);
    } catch {
      // keep partial
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    return charges.filter((c) => {
      const st = c.status?.toLowerCase();
      if (filterStatus === "open") {
        if (st !== "pending" && st !== "overdue" && st !== "partial") return false;
      } else if (filterStatus && st !== filterStatus) {
        return false;
      }
      if (filterType && c.type !== filterType) return false;
      if (filterMonth && c.due_date) {
        const chargeMonth = c.due_date.slice(0, 7); // "YYYY-MM"
        if (chargeMonth !== filterMonth) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const match =
          c.description?.toLowerCase().includes(q) ||
          c.property_address?.toLowerCase().includes(q) ||
          c.renter_name?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [charges, filterStatus, filterType, filterMonth, search]);

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------

  const kpis = useMemo(() => {
    const total = charges.reduce((s, c) => s + Number(c.amount), 0);
    const paid = charges
      .filter((c) => c.status?.toLowerCase() === "paid")
      .reduce((s, c) => s + Number(c.amount), 0);
    const overdue = charges.filter(
      (c) => c.status?.toLowerCase() === "overdue",
    );
    const overdueAmount = overdue.reduce((s, c) => s + Number(c.amount), 0);
    return { total, paid, overdueAmount, overdueCount: overdue.length };
  }, [charges]);

  // ---------------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------------

  const calDays = useMemo(
    () => buildCalendar(calYear, calMonth, filtered),
    [calYear, calMonth, filtered],
  );

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "description",
      header: "Descrição",
      render: (r) => (
        <div>
          <p style={{ fontWeight: 500, marginBottom: "0.125rem" }}>
            {(r.description as string) || (r.type as string)}
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
            {(r.property_address as string) || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "renter_name",
      header: "Locatário",
      render: (r) => <span>{(r.renter_name as string) || "—"}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      render: (r) => <Badge variant="info">{r.type as string}</Badge>,
    },
    {
      key: "due_date",
      header: "Vencimento",
      render: (r) => <span>{fmtDate(r.due_date as string)}</span>,
    },
    {
      key: "amount",
      header: "Valor",
      render: (r) => (
        <span style={{ fontWeight: 600 }}>{fmtBRL(r.amount as string)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={statusVariant(r.status as string)}>
          {r.status as string}
        </Badge>
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h2>Faturas</h2>
          <p>Gestão de faturas do portfólio</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button
            variant={view === "list" ? "primary" : "ghost"}
            onClick={() => setView("list")}
            size="sm"
          >
            Lista
          </Button>
          <Button
            variant={view === "calendar" ? "primary" : "ghost"}
            onClick={() => setView("calendar")}
            size="sm"
          >
            Calendário
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <Card title="Total cobrado">
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {fmtBRL(kpis.total)}
          </p>
        </Card>
        <Card title="Total recebido">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-success)",
            }}
          >
            {fmtBRL(kpis.paid)}
          </p>
        </Card>
        <Card title="Em atraso">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-danger)",
            }}
          >
            {fmtBRL(kpis.overdueAmount)}
          </p>
        </Card>
        <Card title="Faturas em atraso">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-warning)",
            }}
          >
            {kpis.overdueCount}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 2, minWidth: 200 }}>
          <Input
            placeholder="Buscar por descrição, imóvel, locatário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ minWidth: 140 }}>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={TYPE_OPTIONS}
          />
        </div>
        <div style={{ minWidth: 150 }}>
          <Input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            placeholder="Filtrar mês"
          />
        </div>
        {filterMonth && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilterMonth("")}
          >
            Limpar mês
          </Button>
        )}
      </div>

      {loading ? (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "3rem" }}
        >
          <Spinner size={32} label="Carregando faturas…" />
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
      ) : view === "list" ? (
        /* ---- List view ---- */
        <Table
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          rowKey={(r) => (r as unknown as ChargeDetail).id}
          emptyText="Nenhuma fatura encontrada"
          onRowClick={(r) => void openDetail(r as unknown as ChargeDetail)}
        />
      ) : (
        /* ---- Calendar view ---- */
        <div>
          {/* Calendar nav */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (calMonth === 0) {
                  setCalMonth(11);
                  setCalYear((y) => y - 1);
                } else {
                  setCalMonth((m) => m - 1);
                }
              }}
            >
              ←
            </Button>
            <span
              style={{ fontWeight: 600, minWidth: 160, textAlign: "center" }}
            >
              {MONTH_NAMES[calMonth]} {calYear}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (calMonth === 11) {
                  setCalMonth(0);
                  setCalYear((y) => y + 1);
                } else {
                  setCalMonth((m) => m + 1);
                }
              }}
            >
              →
            </Button>
          </div>

          {/* Calendar grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "2px",
            }}
          >
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "0.5rem",
                  color: "var(--color-muted)",
                }}
              >
                {d}
              </div>
            ))}
            {calDays.map((cell, i) => (
              <div
                key={i}
                style={{
                  minHeight: 80,
                  padding: "0.375rem",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  background: cell.isCurrentMonth
                    ? "var(--color-surface)"
                    : "transparent",
                  opacity: cell.isCurrentMonth ? 1 : 0.4,
                }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                    color: cell.isCurrentMonth
                      ? "var(--color-text)"
                      : "var(--color-muted)",
                  }}
                >
                  {cell.day}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  {cell.charges.slice(0, 3).map((c) => (
                    <div
                      key={c.id}
                      onClick={() => void openDetail(c)}
                      style={{
                        fontSize: "0.65rem",
                        padding: "1px 4px",
                        borderRadius: 3,
                        cursor: "pointer",
                        background:
                          c.status?.toLowerCase() === "overdue"
                            ? "var(--color-danger)"
                            : c.status?.toLowerCase() === "paid"
                              ? "var(--color-success)"
                              : "var(--color-primary)",
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {fmtBRL(c.amount)}
                    </div>
                  ))}
                  {cell.charges.length > 3 && (
                    <p
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--color-muted)",
                      }}
                    >
                      +{cell.charges.length - 3} mais
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Detail Modal                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.description ?? selected?.type ?? "Fatura"}
      >
        {selected && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            {detailLoading && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Spinner size={16} />
              </div>
            )}

            {/* Summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Valor total
                </p>
                <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {fmtBRL(selected.amount)}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Status
                </p>
                <Badge variant={statusVariant(selected.status ?? "")}>
                  {selected.status ?? "—"}
                </Badge>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Vencimento
                </p>
                <p>{fmtDate(selected.due_date)}</p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Tipo
                </p>
                <Badge variant="info">{selected.type}</Badge>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Imóvel
                </p>
                <p>{selected.property_address ?? "—"}</p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Locatário
                </p>
                <p>{selected.renter_name ?? "—"}</p>
              </div>
            </div>

            {/* Composition breakdown */}
            {selected.composition && selected.composition.length > 0 && (
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-muted)",
                    fontWeight: 600,
                    marginBottom: "0.75rem",
                  }}
                >
                  Composição da fatura
                </p>
                <div
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    overflow: "hidden",
                  }}
                >
                  {selected.composition.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "0.625rem 1rem",
                        borderBottom:
                          i < selected.composition!.length - 1
                            ? "1px solid var(--color-border)"
                            : "none",
                        background:
                          i % 2 === 0 ? "var(--color-surface)" : "transparent",
                      }}
                    >
                      <span style={{ color: "var(--color-muted)" }}>
                        {item.label}
                      </span>
                      <span style={{ fontWeight: 500 }}>
                        {fmtBRL(item.amount)}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "0.75rem 1rem",
                      background: "var(--color-primary)",
                      color: "#fff",
                      fontWeight: 700,
                    }}
                  >
                    <span>Total</span>
                    <span>{fmtBRL(selected.amount)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment info */}
            {selected.payment_info?.paid_at && (
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-muted)",
                    fontWeight: 600,
                    marginBottom: "0.75rem",
                  }}
                >
                  Dados do pagamento
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    padding: "1rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    background: "var(--color-surface)",
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-muted)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Data de pagamento
                    </p>
                    <p>{fmtDate(selected.payment_info.paid_at)}</p>
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-muted)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Forma de pagamento
                    </p>
                    <p>{selected.payment_info.payment_method ?? "—"}</p>
                  </div>
                  {selected.payment_info.amount_paid && (
                    <div>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Valor pago
                      </p>
                      <p
                        style={{
                          fontWeight: 600,
                          color: "var(--color-success)",
                        }}
                      >
                        {fmtBRL(selected.payment_info.amount_paid)}
                      </p>
                    </div>
                  )}
                  {selected.payment_info.transaction_id && (
                    <div>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        ID da transação
                      </p>
                      <p
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        }}
                      >
                        {selected.payment_info.transaction_id}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

    </section>
  );
}
