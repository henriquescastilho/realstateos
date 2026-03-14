"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiGet, apiPost, apiUpload } from "@/lib/api";
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

interface Payment {
  id: string;
  charge_id: string;
  amount: string;
  paid_at: string;
  method: string;
  payer_name?: string;
  payer_document?: string;
  reference?: string;
  status: "reconciled" | "unreconciled" | "divergent" | string;
  charge?: LinkedCharge;
  source: "manual" | "bank_import" | string;
}

interface LinkedCharge {
  id: string;
  description: string;
  amount: string;
  due_date: string;
  property_address?: string;
}

interface ReconcileCandidate {
  charge_id: string;
  description: string;
  amount: string;
  due_date: string;
  property_address?: string;
  renter_name?: string;
  match_score?: number;
}

interface ImportResult {
  total: number;
  imported: number;
  errors: number;
  payments: Payment[];
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
  { value: "", label: "Todos os status" },
  { value: "reconciled", label: "Reconciliado" },
  { value: "unreconciled", label: "Não reconciliado" },
  { value: "divergent", label: "Com divergência" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: "manual", label: "Manual" },
  { value: "bank_import", label: "Importação bancária" },
];

const METHOD_OPTIONS = [
  { value: "", label: "Todas as formas" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "ted", label: "TED" },
  { value: "deposit", label: "Depósito" },
  { value: "cash", label: "Dinheiro" },
];

// ---------------------------------------------------------------------------
// Reconcile status badge helper
// ---------------------------------------------------------------------------

function reconcileVariant(
  status: string,
): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "reconciled":
      return "success";
    case "divergent":
      return "danger";
    case "unreconciled":
      return "warning";
    default:
      return "default";
  }
}

function reconcileLabel(status: string) {
  switch (status) {
    case "reconciled":
      return "Reconciliado";
    case "divergent":
      return "Divergência";
    case "unreconciled":
      return "Não reconciliado";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterMethod, setFilterMethod] = useState("");

  // Detail + reconcile modal
  const [selected, setSelected] = useState<Payment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [candidates, setCandidates] = useState<ReconcileCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);

  // Manual payment modal
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    charge_id: "",
    amount: "",
    paid_at: new Date().toISOString().slice(0, 10),
    method: "pix",
    reference: "",
    payer_name: "",
    payer_document: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // CSV import
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<Payment[]>("/v1/payments");
      setPayments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar pagamentos");
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

  const openDetail = useCallback(async (p: Payment) => {
    setSelected(p);
    setCandidates([]);
    if (p.status !== "reconciled") {
      setCandidatesLoading(true);
      try {
        const res = await apiGet<ReconcileCandidate[]>(
          `/v1/payments/${p.id}/reconcile-candidates`,
        );
        setCandidates(res);
      } catch {
        // ignore
      } finally {
        setCandidatesLoading(false);
      }
    }
    setDetailLoading(true);
    try {
      const detail = await apiGet<Payment>(`/v1/payments/${p.id}`);
      setSelected(detail);
    } catch {
      // keep partial
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Reconcile
  // ---------------------------------------------------------------------------

  const handleReconcile = useCallback(
    async (chargeId: string) => {
      if (!selected) return;
      setReconciling(chargeId);
      try {
        await apiPost(`/v1/payments/${selected.id}/reconcile`, {
          charge_id: chargeId,
        });
        await load();
        setSelected(null);
      } catch {
        // silent — toast would be ideal
      } finally {
        setReconciling(null);
      }
    },
    [selected, load],
  );

  // ---------------------------------------------------------------------------
  // Manual payment
  // ---------------------------------------------------------------------------

  const handleManualCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setCreating(true);
      setCreateError(null);
      try {
        await apiPost("/v1/payments", {
          ...manualForm,
          payer_document: manualForm.payer_document || undefined,
          reference: manualForm.reference || undefined,
        });
        setShowManual(false);
        setManualForm({
          charge_id: "",
          amount: "",
          paid_at: new Date().toISOString().slice(0, 10),
          method: "pix",
          reference: "",
          payer_name: "",
          payer_document: "",
        });
        await load();
      } catch (e) {
        setCreateError(
          e instanceof Error ? e.message : "Erro ao registrar pagamento",
        );
      } finally {
        setCreating(false);
      }
    },
    [manualForm, load],
  );

  // ---------------------------------------------------------------------------
  // CSV import
  // ---------------------------------------------------------------------------

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await apiUpload<ImportResult>("/v1/payments/import", fd);
      setImportResult(res);
      await load();
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "Erro ao importar extrato",
      );
    } finally {
      setImporting(false);
    }
  }, [importFile, load]);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterSource && p.source !== filterSource) return false;
      if (filterMethod && p.method !== filterMethod) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          p.payer_name?.toLowerCase().includes(q) ||
          p.payer_document?.includes(q) ||
          p.reference?.toLowerCase().includes(q) ||
          p.charge?.property_address?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [payments, filterStatus, filterSource, filterMethod, search]);

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------

  const kpis = useMemo(() => {
    const total = payments.reduce((s, p) => s + Number(p.amount), 0);
    const reconciled = payments.filter((p) => p.status === "reconciled").length;
    const unreconciled = payments.filter(
      (p) => p.status === "unreconciled",
    ).length;
    const divergent = payments.filter((p) => p.status === "divergent").length;
    return { total, reconciled, unreconciled, divergent };
  }, [payments]);

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "paid_at",
      header: "Data",
      render: (r) => <span>{fmtDate(r.paid_at as string)}</span>,
    },
    {
      key: "payer_name",
      header: "Pagador",
      render: (r) => (
        <div>
          <p style={{ fontWeight: 500 }}>{(r.payer_name as string) || "—"}</p>
          {r.payer_document && (
            <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
              {r.payer_document as string}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "charge",
      header: "Cobrança vinculada",
      render: (r) => {
        const charge = r.charge as LinkedCharge | undefined;
        return charge ? (
          <div>
            <p style={{ fontSize: "0.85rem" }}>{charge.description}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
              {charge.property_address ?? "—"}
            </p>
          </div>
        ) : (
          <span style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
            Não vinculado
          </span>
        );
      },
    },
    {
      key: "method",
      header: "Forma",
      render: (r) => (
        <Badge variant="default">{(r.method as string).toUpperCase()}</Badge>
      ),
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
      header: "Reconciliação",
      render: (r) => {
        const s = r.status as string;
        return <Badge variant={reconcileVariant(s)}>{reconcileLabel(s)}</Badge>;
      },
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
          <h2>Pagamentos</h2>
          <p>Registro e reconciliação de pagamentos recebidos</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button variant="ghost" onClick={() => setShowImport(true)}>
            Importar extrato
          </Button>
          <Button onClick={() => setShowManual(true)}>
            + Registrar pagamento
          </Button>
        </div>
      </header>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <Card title="Total recebido">
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {fmtBRL(kpis.total)}
          </p>
        </Card>
        <Card title="Reconciliados">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-success)",
            }}
          >
            {kpis.reconciled}
          </p>
        </Card>
        <Card title="Não reconciliados">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-warning)",
            }}
          >
            {kpis.unreconciled}
          </p>
        </Card>
        <Card title="Com divergência">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-danger)",
            }}
          >
            {kpis.divergent}
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
            placeholder="Buscar por pagador, referência, imóvel…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <Select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            options={SOURCE_OPTIONS}
          />
        </div>
        <div style={{ minWidth: 140 }}>
          <Select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            options={METHOD_OPTIONS}
          />
        </div>
      </div>

      {loading ? (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "3rem" }}
        >
          <Spinner size="lg" label="Carregando pagamentos…" />
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
        <Table
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          rowKey={(r) => (r as unknown as Payment).id}
          emptyText="Nenhum pagamento encontrado"
          onRowClick={(r) => void openDetail(r as unknown as Payment)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Detail + Reconcile Modal                                             */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setCandidates([]);
        }}
        title="Detalhe do pagamento"
        size="lg"
      >
        {selected && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            {detailLoading && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Spinner size="sm" />
              </div>
            )}

            {/* Payment summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                padding: "1rem",
                background: "var(--color-surface)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--color-border)",
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
                  Valor pago
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
                <Badge variant={reconcileVariant(selected.status)}>
                  {reconcileLabel(selected.status)}
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
                  Data
                </p>
                <p>{fmtDate(selected.paid_at)}</p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Forma
                </p>
                <p style={{ textTransform: "uppercase" }}>{selected.method}</p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Pagador
                </p>
                <p>{selected.payer_name ?? "—"}</p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Referência
                </p>
                <p style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                  {selected.reference ?? "—"}
                </p>
              </div>
            </div>

            {/* Linked charge */}
            {selected.charge && (
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
                  Cobrança vinculada
                </p>
                <div
                  style={{
                    padding: "0.875rem 1rem",
                    border: "1px solid var(--color-success)",
                    borderRadius: "var(--radius)",
                    background: "var(--color-surface)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 500 }}>
                      {selected.charge.description}
                    </p>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-muted)",
                      }}
                    >
                      {selected.charge.property_address} · venc.{" "}
                      {fmtDate(selected.charge.due_date)}
                    </p>
                  </div>
                  <p style={{ fontWeight: 600 }}>
                    {fmtBRL(selected.charge.amount)}
                  </p>
                </div>
              </div>
            )}

            {/* Reconcile candidates */}
            {selected.status !== "reconciled" && (
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
                  Cobranças candidatas à reconciliação
                </p>
                {candidatesLoading ? (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Spinner size="sm" />
                  </div>
                ) : candidates.length === 0 ? (
                  <p
                    style={{
                      color: "var(--color-muted)",
                      textAlign: "center",
                      padding: "1rem",
                    }}
                  >
                    Nenhuma cobrança candidata encontrada
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    {candidates.map((c) => (
                      <div
                        key={c.charge_id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.875rem 1rem",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius)",
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 500 }}>{c.description}</p>
                          <p
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--color-muted)",
                            }}
                          >
                            {c.property_address} · {c.renter_name} · venc.{" "}
                            {fmtDate(c.due_date)}
                          </p>
                          {c.match_score !== undefined && (
                            <p
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--color-primary)",
                              }}
                            >
                              Score de correspondência:{" "}
                              {Math.round(c.match_score * 100)}%
                            </p>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {fmtBRL(c.amount)}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => void handleReconcile(c.charge_id)}
                            disabled={reconciling === c.charge_id}
                          >
                            {reconciling === c.charge_id ? (
                              <Spinner size="sm" />
                            ) : (
                              "Reconciliar"
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Manual Payment Modal                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={showManual}
        onClose={() => {
          setShowManual(false);
          setCreateError(null);
        }}
        title="Registrar pagamento manual"
      >
        <form onSubmit={(e) => void handleManualCreate(e)}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <Input
              label="ID da cobrança *"
              value={manualForm.charge_id}
              onChange={(e) =>
                setManualForm((f) => ({ ...f, charge_id: e.target.value }))
              }
              placeholder="UUID da cobrança"
              required
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <Input
                label="Valor pago *"
                type="number"
                step="0.01"
                min="0.01"
                value={manualForm.amount}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, amount: e.target.value }))
                }
                required
              />
              <Input
                label="Data do pagamento *"
                type="date"
                value={manualForm.paid_at}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, paid_at: e.target.value }))
                }
                required
              />
            </div>
            <Select
              label="Forma de pagamento"
              value={manualForm.method}
              onChange={(e) =>
                setManualForm((f) => ({ ...f, method: e.target.value }))
              }
              options={[
                { value: "pix", label: "PIX" },
                { value: "boleto", label: "Boleto" },
                { value: "ted", label: "TED" },
                { value: "deposit", label: "Depósito" },
                { value: "cash", label: "Dinheiro" },
              ]}
            />
            <Input
              label="Nome do pagador"
              value={manualForm.payer_name}
              onChange={(e) =>
                setManualForm((f) => ({ ...f, payer_name: e.target.value }))
              }
            />
            <Input
              label="CPF/CNPJ do pagador"
              value={manualForm.payer_document}
              onChange={(e) =>
                setManualForm((f) => ({
                  ...f,
                  payer_document: e.target.value,
                }))
              }
            />
            <Input
              label="Referência / ID transação"
              value={manualForm.reference}
              onChange={(e) =>
                setManualForm((f) => ({ ...f, reference: e.target.value }))
              }
            />

            {createError && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.875rem" }}>
                {createError}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
              }}
            >
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowManual(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Spinner size="sm" /> : "Registrar"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* CSV Import Modal                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={showImport}
        onClose={() => {
          setShowImport(false);
          setImportFile(null);
          setImportResult(null);
          setImportError(null);
        }}
        title="Importar extrato bancário (CSV)"
      >
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
        >
          <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
            Importe um extrato bancário no formato CSV. O sistema tentará
            reconciliar automaticamente os pagamentos com as cobranças abertas.
          </p>

          <div
            style={{
              padding: "1.5rem",
              border: "2px dashed var(--color-border)",
              borderRadius: "var(--radius)",
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <p style={{ marginBottom: "0.5rem", fontWeight: 500 }}>
              {importFile
                ? importFile.name
                : "Clique para selecionar um arquivo CSV"}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
              Formato esperado: data, valor, pagador, descrição
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
          </div>

          {importResult && (
            <div
              style={{
                padding: "1rem",
                background: "var(--color-surface)",
                border: "1px solid var(--color-success)",
                borderRadius: "var(--radius)",
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  color: "var(--color-success)",
                }}
              >
                Importação concluída
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <p
                    style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}
                  >
                    Total
                  </p>
                  <p style={{ fontWeight: 600 }}>{importResult.total}</p>
                </div>
                <div>
                  <p
                    style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}
                  >
                    Importados
                  </p>
                  <p style={{ fontWeight: 600, color: "var(--color-success)" }}>
                    {importResult.imported}
                  </p>
                </div>
                <div>
                  <p
                    style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}
                  >
                    Erros
                  </p>
                  <p style={{ fontWeight: 600, color: "var(--color-danger)" }}>
                    {importResult.errors}
                  </p>
                </div>
              </div>
            </div>
          )}

          {importError && (
            <p style={{ color: "var(--color-danger)", fontSize: "0.875rem" }}>
              {importError}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="ghost"
              onClick={() => setShowImport(false)}
              disabled={importing}
            >
              Fechar
            </Button>
            <Button
              onClick={() => void handleImport()}
              disabled={!importFile || importing}
            >
              {importing ? <Spinner size="sm" /> : "Importar"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
