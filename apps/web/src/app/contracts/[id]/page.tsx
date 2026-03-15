"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { nodeApiGet, nodeApiPost, nodeApiPatch, nodeApiDelete } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Spinner,
  statusVariant,
} from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChargeRow {
  id: string;
  description?: string;
  amount: string | number;
  due_date: string;
  status: string;
  issue_status?: string;
  billing_period?: string;
  line_items?: Array<{ type: string; description: string; amount: string; source: string }>;
  boleto_status?: string;
}

interface RepasseRow {
  id: string;
  amount: string | number;
  scheduled_date?: string;
  paid_at?: string;
  status: string;
}

// API response shape from onboarding router GET /contracts/:id
interface ApiContractResponse {
  contract: {
    id: string;
    orgId: string;
    propertyId: string;
    ownerId: string;
    tenantId: string;
    startDate: string;
    endDate: string;
    rentAmount: string;
    closingDay?: number | null;
    dueDateDay?: number | null;
    payoutDay?: number | null;
    adminFeePercent?: string | null;
    adminFeeMinimum?: string | null;
    operationalStatus: string;
    agentInstructions?: string | null;
    chargeRules?: Record<string, unknown>;
    payoutRules?: Record<string, unknown>;
  };
  property?: {
    id: string;
    address: string;
    city: string;
    state: string;
    municipalRegistration?: string | null;
  };
  owner?: {
    id: string;
    fullName: string;
    email?: string;
    phone?: string;
  };
  tenant?: {
    id: string;
    fullName: string;
    email?: string;
    phone?: string;
  };
  charges?: ChargeRow[];
}

interface ContractView {
  id: string;
  status: string;
  code: string;
  rent_amount: string;
  closing_day: number;
  due_day: number;
  payout_day: number;
  admin_fee_percent: string;
  admin_fee_minimum: string;
  start_date: string;
  end_date: string;
  agent_instructions: string;
  property_address: string;
  inscricao_imobiliaria: string;
  renter_name: string;
  owner_name: string;
  charges: ChargeRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function fmtBRL(s: string | number | undefined | null) {
  const n = Number(s);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "dados" | "cobrancas" | "faturas" | "repasses" | "documentos" | "instrucoes" | "configuracoes";

const TABS: { key: Tab; label: string }[] = [
  { key: "dados", label: "Dados" },
  { key: "cobrancas", label: "Cobranças" },
  { key: "faturas", label: "Faturas" },
  { key: "repasses", label: "Repasses" },
  { key: "documentos", label: "Documentos" },
  { key: "instrucoes", label: "Instruções do Agente" },
  { key: "configuracoes", label: "Configurações" },
];

// ---------------------------------------------------------------------------
// Add Line Item Modal (adds to existing draft charge)
// ---------------------------------------------------------------------------

interface AddLineItemFormData {
  type: string;
  description: string;
  amount: string;
}

function AddLineItemModal({
  onClose,
  onSave,
  saving,
  period,
}: {
  onClose: () => void;
  onSave: (data: AddLineItemFormData) => void;
  saving: boolean;
  period: string;
}) {
  const [form, setForm] = useState<AddLineItemFormData>({
    type: "extra",
    description: "",
    amount: "",
  });

  const set = (field: keyof AddLineItemFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const typeOptions = [
    { value: "condo", label: "Condomínio" },
    { value: "iptu", label: "IPTU" },
    { value: "agua", label: "Água" },
    { value: "energia", label: "Energia" },
    { value: "seguro", label: "Seguro incêndio" },
    { value: "extra", label: "Outro" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card, #1a1a1a)",
          borderRadius: 12,
          padding: 28,
          width: "100%",
          maxWidth: 460,
          display: "grid",
          gap: 18,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Adicionar item na fatura</h3>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
            Período {period} — este item será incluído no boleto do inquilino.
          </p>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="Tipo">
            <select
              value={form.type}
              onChange={(e) => {
                set("type", e.target.value);
                const opt = typeOptions.find((o) => o.value === e.target.value);
                if (opt && !form.description) set("description", opt.label);
              }}
              className="form-input"
            >
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Descrição">
            <input
              type="text"
              placeholder="Ex: Condomínio abril/2026"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="form-input"
            />
          </FormField>

          <FormField label="Valor (R$)">
            <input
              type="text"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              className="form-input"
            />
          </FormField>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={saving}
            disabled={!form.description || !form.amount}
            onClick={() => onSave(form)}
          >
            Adicionar Item
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [view, setView] = useState<ContractView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dados");
  const [workflowLoading, setWorkflowLoading] = useState<string | null>(null);

  // Agent instructions state
  const [instructions, setInstructions] = useState("");
  const [instructionsSaving, setInstructionsSaving] = useState(false);
  const [instructionsSaved, setInstructionsSaved] = useState(false);

  // Config state
  const [cfgClosingDay, setCfgClosingDay] = useState(27);
  const [cfgDueDay, setCfgDueDay] = useState(1);
  const [cfgPayoutDay, setCfgPayoutDay] = useState(4);
  const [cfgAdminPercent, setCfgAdminPercent] = useState("10.00");
  const [cfgAdminMin, setCfgAdminMin] = useState("180.00");
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgSaved, setCfgSaved] = useState(false);

  // Add line item modal
  const [showAddLineItem, setShowAddLineItem] = useState<string | null>(null); // charge ID
  const [addLineItemPeriod, setAddLineItemPeriod] = useState("");
  const [lineItemSaving, setLineItemSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await nodeApiGet<ApiContractResponse>(`/contracts/${id}`);
      const c = data.contract;
      const v: ContractView = {
        id: c.id,
        status: c.operationalStatus === "pending_onboarding" ? "pending" : c.operationalStatus,
        code: `REOS-${c.id.slice(0, 4).toUpperCase()}`,
        rent_amount: c.rentAmount,
        closing_day: c.closingDay ?? 27,
        due_day: c.dueDateDay ?? 1,
        payout_day: c.payoutDay ?? 4,
        admin_fee_percent: c.adminFeePercent ?? "10.00",
        admin_fee_minimum: c.adminFeeMinimum ?? "180.00",
        start_date: c.startDate,
        end_date: c.endDate,
        agent_instructions: c.agentInstructions ?? "",
        property_address: data.property?.address ?? "Imóvel não identificado",
        inscricao_imobiliaria: data.property?.municipalRegistration ?? "—",
        renter_name: data.tenant?.fullName ?? "—",
        owner_name: data.owner?.fullName ?? "—",
        charges: data.charges ?? [],
      };

      setView(v);
      setInstructions(v.agent_instructions);
      setCfgClosingDay(v.closing_day);
      setCfgDueDay(v.due_day);
      setCfgPayoutDay(v.payout_day);
      setCfgAdminPercent(v.admin_fee_percent);
      setCfgAdminMin(v.admin_fee_minimum);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar contrato.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyWorkflow(action: "activate" | "suspend" | "terminate") {
    if (!view) return;
    setWorkflowLoading(action);
    try {
      const statusMap = { activate: "active", suspend: "suspended", terminate: "terminated" };
      await nodeApiPost(`/contracts/${view.id}/transition`, { status: statusMap[action] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setWorkflowLoading(null);
    }
  }

  async function saveInstructions() {
    if (!view) return;
    setInstructionsSaving(true);
    try {
      await nodeApiPatch(`/contracts/${view.id}`, { agentInstructions: instructions });
      setInstructionsSaved(true);
      setTimeout(() => setInstructionsSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar instruções.");
    } finally {
      setInstructionsSaving(false);
    }
  }

  async function saveConfig() {
    if (!view) return;
    setCfgSaving(true);
    try {
      await nodeApiPatch(`/contracts/${view.id}`, {
        closingDay: cfgClosingDay,
        dueDateDay: cfgDueDay,
        payoutDay: cfgPayoutDay,
        adminFeePercent: cfgAdminPercent,
        adminFeeMinimum: cfgAdminMin,
      });
      setCfgSaved(true);
      setTimeout(() => setCfgSaved(false), 2000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar configurações.");
    } finally {
      setCfgSaving(false);
    }
  }

  async function handleAddLineItem(data: AddLineItemFormData) {
    if (!showAddLineItem) return;
    setLineItemSaving(true);
    try {
      // Normalize amount: replace comma with dot
      const amount = data.amount.replace(",", ".");
      await nodeApiPost(`/charges/${showAddLineItem}/line-items`, {
        type: data.type,
        description: data.description,
        amount,
        source: "manual",
      });
      setShowAddLineItem(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao adicionar item.");
    } finally {
      setLineItemSaving(false);
    }
  }

  async function handleRemoveLineItem(chargeId: string, index: number) {
    try {
      await nodeApiDelete(`/charges/${chargeId}/line-items/${index}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover item.");
    }
  }

  if (loading) {
    return (
      <section className="page" style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <Spinner size={32} />
      </section>
    );
  }

  if (error || !view) {
    return (
      <section className="page">
        <p className="error-banner">{error ?? "Contrato não encontrado."}</p>
        <Button variant="ghost" onClick={() => router.push("/contracts")}>
          Voltar para contratos
        </Button>
      </section>
    );
  }

  const { status, code } = view;
  // Most recent first
  const allCharges = [...view.charges].sort((a, b) => b.due_date.localeCompare(a.due_date));
  const draftCharges = allCharges.filter((c) => c.issue_status === "draft");
  const issuedCharges = allCharges.filter((c) => c.issue_status === "issued");
  const openCharges = allCharges.filter((c) => c.status === "open" && c.issue_status !== "draft");
  const paidCharges = allCharges.filter((c) => c.status === "paid");

  // Admin fee calculation
  const adminFeePercent = Number(view.admin_fee_percent);
  const adminFeeMinimum = Number(view.admin_fee_minimum);
  function calcAdminFee(chargeAmount: number): number {
    return Math.max(adminFeeMinimum, chargeAmount * adminFeePercent / 100);
  }

  const CLOSING_DAY = view.closing_day;

  return (
    <section className="page">
      {/* Header */}
      <header
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}
      >
        <div>
          <button
            onClick={() => router.push("/contracts")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "0.84rem",
              padding: 0,
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← Contratos
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h2 style={{ margin: 0 }}>
              <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>{code}</span>
            </h2>
            <Badge variant={statusVariant(status)}>{status.toUpperCase()}</Badge>
          </div>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>
            {view.property_address}
          </p>
        </div>

        <div className="actions">
          {status !== "active" && (
            <Button size="sm" variant="primary" loading={workflowLoading === "activate"} disabled={!!workflowLoading} onClick={() => applyWorkflow("activate")}>
              Ativar
            </Button>
          )}
          {status === "active" && (
            <Button size="sm" variant="ghost" loading={workflowLoading === "suspend"} disabled={!!workflowLoading} onClick={() => applyWorkflow("suspend")}>
              Suspender
            </Button>
          )}
          {status !== "terminated" && (
            <Button size="sm" variant="danger" loading={workflowLoading === "terminate"} disabled={!!workflowLoading} onClick={() => applyWorkflow("terminate")}>
              Encerrar
            </Button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 18px",
              border: "none",
              background: tab === t.key ? "var(--accent)" : "transparent",
              color: tab === t.key ? "#fff" : "var(--text-secondary)",
              borderRadius: "10px 10px 0 0",
              cursor: "pointer",
              fontWeight: tab === t.key ? 600 : 400,
              fontSize: "0.9rem",
              transition: "background 150ms",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "dados" && (
        <Card>
          <div className="page-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Field label="Imóvel" value={view.property_address} />
            <Field label="Inquilino" value={view.renter_name} />
            <Field label="Proprietário" value={view.owner_name} />
            <Field label="Aluguel mensal" value={fmtBRL(view.rent_amount)} />
            <Field label="Início" value={fmtDate(view.start_date)} />
            <Field label="Término" value={fmtDate(view.end_date)} />
            <Field label="Código" value={code} />
            <Field label="Inscrição imobiliária (IPTU)" value={view.inscricao_imobiliaria} />
          </div>
        </Card>
      )}

      {tab === "cobrancas" && (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Cobranças do Contrato</h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.84rem" }}>
              Faturas em rascunho ficam abertas até o dia {CLOSING_DAY} do mês anterior para inclusão de itens extras.
            </p>
          </div>

          {/* Draft charges — open for editing */}
          {draftCharges.map((c) => {
            const items = c.line_items && c.line_items.length > 0
              ? c.line_items
              : [{ description: c.description ?? "Aluguel", amount: String(c.amount), type: "rent", source: "contract" }];
            const dueMonth = c.due_date ? new Date(c.due_date + "T12:00:00") : null;
            const closingDate = dueMonth
              ? new Date(dueMonth.getFullYear(), dueMonth.getMonth() - 1, CLOSING_DAY)
              : null;
            const now = new Date();
            const isOpen = closingDate ? now <= closingDate : true;

            return (
              <div
                key={c.id}
                style={{
                  border: "1px solid rgba(212,175,55,0.4)",
                  borderRadius: 8,
                  padding: "16px 18px",
                  marginBottom: 16,
                  background: "rgba(212,175,55,0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 600 }}>{c.billing_period ?? "—"}</span>
                    <Badge variant="warning">RASCUNHO</Badge>
                    {isOpen && closingDate && (
                      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        Aberta para edição até {closingDate.toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                  {isOpen && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setShowAddLineItem(c.id);
                        setAddLineItemPeriod(c.billing_period ?? "");
                      }}
                    >
                      + Adicionar Item
                    </Button>
                  )}
                </div>

                <table className="event-table" style={{ marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: "right" }}>Valor</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((li, i) => (
                      <tr key={i}>
                        <td>{li.description}</td>
                        <td style={{ textAlign: "right" }}>{fmtBRL(li.amount)}</td>
                        <td style={{ textAlign: "center" }}>
                          {isOpen && i > 0 && (
                            <button
                              onClick={() => handleRemoveLineItem(c.id, i)}
                              title="Remover item"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--text-muted)",
                                fontSize: "0.9rem",
                                padding: "2px 6px",
                              }}
                            >
                              x
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 600 }}>
                      <td>Total</td>
                      <td style={{ textAlign: "right" }}>{fmtBRL(c.amount)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  <span>Vencimento: {fmtDate(c.due_date)}</span>
                </div>
              </div>
            );
          })}

          {/* Issued/historical charges */}
          {issuedCharges.length > 0 && (
            <table className="event-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Item</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {issuedCharges.map((c) => {
                  const items = c.line_items && c.line_items.length > 0
                    ? c.line_items
                    : [{ description: c.description ?? "Cobrança", amount: String(c.amount), type: "rent", source: "" }];
                  return items.map((li, i) => (
                    <tr key={`${c.id}-${i}`} style={i > 0 ? { borderTop: "none" } : undefined}>
                      {i === 0 && (
                        <td rowSpan={items.length} style={{ verticalAlign: "top", fontWeight: 500 }}>
                          {c.billing_period ?? "—"}
                        </td>
                      )}
                      <td>{li.description}</td>
                      <td style={{ textAlign: "right" }}>{fmtBRL(li.amount)}</td>
                      {i === 0 && (
                        <>
                          <td rowSpan={items.length} style={{ verticalAlign: "top" }}>{fmtDate(c.due_date)}</td>
                          <td rowSpan={items.length} style={{ verticalAlign: "top" }}>
                            <Badge variant={statusVariant(c.status)}>{c.status.toUpperCase()}</Badge>
                          </td>
                        </>
                      )}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}

          {allCharges.length === 0 && (
            <p className="empty-state">Nenhuma cobrança registrada.</p>
          )}
        </Card>
      )}

      {tab === "faturas" && (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Faturas do Inquilino</h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.84rem" }}>
              Faturas geradas a partir das cobranças para o inquilino.
            </p>
          </div>

          {allCharges.length > 0 ? (
            <table className="event-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Composição</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Vencimento</th>
                  <th>Boleto</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allCharges.map((c) => {
                  const items = c.line_items && c.line_items.length > 0 ? c.line_items : [];
                  const boletoLabel = c.status === "paid" ? "Pago" : c.boleto_status === "generated" ? "Gerado" : c.boleto_status === "failed" ? "Falhou" : "Pendente";
                  const boletoVariant = c.status === "paid" ? "success" : c.boleto_status === "generated" ? "success" : c.boleto_status === "failed" ? "danger" : "default";
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.billing_period ?? "—"}</td>
                      <td style={{ fontSize: "0.82rem" }}>
                        {items.length > 0
                          ? items.map((li) => `${li.description} (${fmtBRL(li.amount)})`).join(" + ")
                          : c.description ?? "Fatura"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 500 }}>{fmtBRL(c.amount)}</td>
                      <td>{fmtDate(c.due_date)}</td>
                      <td><Badge variant={boletoVariant as "success" | "danger" | "default"}>{boletoLabel}</Badge></td>
                      <td><Badge variant={statusVariant(c.status)}>{c.status.toUpperCase()}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Nenhuma fatura gerada para o inquilino deste contrato.</p>
          )}
        </Card>
      )}

      {tab === "repasses" && (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Repasses ao Proprietário</h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "0.84rem" }}>
              O repasse é liberado após o pagamento da fatura pelo inquilino. Taxa de adm.: {view.admin_fee_percent}% (mín. {fmtBRL(view.admin_fee_minimum)}).
            </p>
          </div>

          {/* Pending repasses — waiting for tenant payment */}
          {openCharges.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                Aguardando pagamento do inquilino
              </h4>
              {openCharges.map((c) => {
                const chargeAmount = Number(c.amount);
                const fee = calcAdminFee(chargeAmount);
                const repasseAmount = chargeAmount - fee;
                return (
                  <div
                    key={c.id}
                    style={{
                      background: "rgba(212,175,55,0.08)",
                      border: "1px solid rgba(212,175,55,0.3)",
                      borderRadius: 8,
                      padding: "14px 18px",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                          {c.billing_period ?? "—"}
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                          Fatura: {fmtBRL(chargeAmount.toString())} — Vence em {fmtDate(c.due_date)}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <Badge variant="warning">AGUARDANDO</Badge>
                        <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          Taxa adm: {fmtBRL(fee.toString())}
                        </p>
                        <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: "1rem" }}>
                          Repasse: {fmtBRL(repasseAmount.toString())}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Draft charges — not yet issued, repasse not applicable yet */}
          {draftCharges.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                Fatura em rascunho (ainda não emitida)
              </h4>
              {draftCharges.map((c) => {
                const chargeAmount = Number(c.amount);
                const fee = calcAdminFee(chargeAmount);
                const repasseAmount = chargeAmount - fee;
                return (
                  <div
                    key={c.id}
                    style={{
                      background: "rgba(100,100,100,0.08)",
                      border: "1px solid rgba(100,100,100,0.2)",
                      borderRadius: 8,
                      padding: "14px 18px",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                          {c.billing_period ?? "—"}
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          Fatura provisória: {fmtBRL(chargeAmount.toString())}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <Badge variant="default">RASCUNHO</Badge>
                        <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          Taxa adm (prev.): {fmtBRL(fee.toString())}
                        </p>
                        <p style={{ margin: "2px 0 0", fontWeight: 500, fontSize: "0.95rem", color: "var(--text-secondary)" }}>
                          Repasse (prev.): {fmtBRL(repasseAmount.toString())}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed repasses — tenant already paid */}
          {paidCharges.length > 0 ? (
            <>
              <h4 style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                Repasses realizados
              </h4>
              <table className="event-table">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th style={{ textAlign: "right" }}>Fatura</th>
                    <th style={{ textAlign: "right" }}>Taxa adm.</th>
                    <th style={{ textAlign: "right" }}>Repasse</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paidCharges.map((c) => {
                    const chargeAmount = Number(c.amount);
                    const fee = calcAdminFee(chargeAmount);
                    const repasseAmount = chargeAmount - fee;
                    return (
                      <tr key={c.id}>
                        <td>{c.billing_period ?? "—"}</td>
                        <td style={{ textAlign: "right" }}>{fmtBRL(chargeAmount.toString())}</td>
                        <td style={{ textAlign: "right", color: "var(--text-secondary)" }}>- {fmtBRL(fee.toString())}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtBRL(repasseAmount.toString())}</td>
                        <td><Badge variant="success">REPASSADO</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          ) : openCharges.length === 0 && draftCharges.length === 0 ? (
            <p className="empty-state">Nenhum repasse registrado ainda.</p>
          ) : null}
        </Card>
      )}

      {tab === "documentos" && (
        <Card>
          <div style={{ display: "grid", gap: 16 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Envie documentos do contrato para que o agente possa analisar e tomar decisões automaticamente.
            </p>
            <div className="drop-zone">
              <label style={{ cursor: "pointer", display: "grid", gap: 8, textAlign: "center" }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>Clique para enviar ou arraste o arquivo aqui</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>PDF, imagens ou documentos</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: "none" }} multiple />
              </label>
            </div>
            <p className="empty-state">Nenhum documento enviado.</p>
          </div>
        </Card>
      )}

      {tab === "instrucoes" && (
        <Card>
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: "1rem" }}>Instruções para o Agente Orquestrador</h3>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.84rem" }}>
                Escreva instruções específicas sobre este contrato que o agente precisa saber para tomar decisões.
                Ex: regras de repasse, IPTU pago pelo proprietário, condições especiais, etc.
              </p>
            </div>

            <textarea
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                setInstructionsSaved(false);
              }}
              placeholder="Ex: Esse IPTU a proprietária pagou integral, vamos repassar as cotas que o inquilino pagar pra ela. O condomínio é responsabilidade do inquilino."
              className="form-input"
              rows={8}
              style={{
                resize: "vertical",
                fontFamily: "inherit",
                fontSize: "0.9rem",
                lineHeight: 1.6,
              }}
            />

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button
                size="sm"
                variant="primary"
                loading={instructionsSaving}
                onClick={saveInstructions}
              >
                Salvar Instruções
              </Button>
              {instructionsSaved && (
                <span style={{ fontSize: "0.82rem", color: "var(--accent)" }}>
                  Salvo com sucesso!
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {tab === "configuracoes" && (
        <Card>
          <div style={{ display: "grid", gap: 24 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Ciclo de Cobrança</h3>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.84rem" }}>
                Defina as datas do ciclo mensal. O fluxo segue a ordem: fechamento → vencimento → repasse.
              </p>
            </div>

            {/* Timeline visual */}
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              background: "rgba(212,175,55,0.06)", borderRadius: 8, padding: "16px 20px",
              border: "1px solid rgba(212,175,55,0.15)",
            }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Fechamento</p>
                <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: "1.2rem" }}>Dia {cfgClosingDay}</p>
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>mês anterior</p>
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>→</span>
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Vencimento</p>
                <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: "1.2rem" }}>Dia {cfgDueDay}</p>
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{cfgDueDay === 1 ? "1° dia útil" : "do mês"}</p>
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>→</span>
              <div style={{ flex: 1, textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Repasse</p>
                <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: "1.2rem" }}>Dia {cfgPayoutDay}</p>
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>após pagamento</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <FormField label="Dia do fechamento">
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={cfgClosingDay}
                  onChange={(e) => setCfgClosingDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                  className="form-input"
                  placeholder="27"
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Ex: 27 — fecha a fatura e gera o boleto
                </span>
              </FormField>

              <FormField label="Dia do vencimento">
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={cfgDueDay}
                  onChange={(e) => setCfgDueDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                  className="form-input"
                  placeholder="1"
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Ex: 1 — vencimento do boleto (1° dia útil)
                </span>
              </FormField>

              <FormField label="Dia do repasse">
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={cfgPayoutDay}
                  onChange={(e) => setCfgPayoutDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                  className="form-input"
                  placeholder="4"
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Ex: 4 — repasse ao proprietário (após pagamento)
                </span>
              </FormField>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Taxa de Administração</h3>
              <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: "0.84rem" }}>
                Percentual cobrado sobre o valor da fatura. Aplica-se o maior valor entre o percentual e o mínimo.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <FormField label="Percentual (%)">
                  <input
                    type="text"
                    value={cfgAdminPercent}
                    onChange={(e) => setCfgAdminPercent(e.target.value)}
                    className="form-input"
                    placeholder="10.00"
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Entre 6% e 10%
                  </span>
                </FormField>

                <FormField label="Valor mínimo (R$)">
                  <input
                    type="text"
                    value={cfgAdminMin}
                    onChange={(e) => setCfgAdminMin(e.target.value)}
                    className="form-input"
                    placeholder="180.00"
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Mínimo R$ 180,00
                  </span>
                </FormField>

                <FormField label="Valor efetivo">
                  <div className="form-input" style={{ display: "flex", alignItems: "center", background: "rgba(100,100,100,0.1)" }}>
                    {fmtBRL(
                      Math.max(
                        Number(cfgAdminMin) || 0,
                        Number(view.rent_amount) * (Number(cfgAdminPercent) || 0) / 100,
                      ).toString(),
                    )}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Sobre aluguel de {fmtBRL(view.rent_amount)}
                  </span>
                </FormField>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Button size="sm" variant="primary" loading={cfgSaving} onClick={saveConfig}>
                Salvar Configurações
              </Button>
              {cfgSaved && (
                <span style={{ fontSize: "0.82rem", color: "var(--accent)" }}>Salvo com sucesso!</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Add Line Item Modal */}
      {showAddLineItem && (
        <AddLineItemModal
          onClose={() => setShowAddLineItem(null)}
          onSave={handleAddLineItem}
          saving={lineItemSaving}
          period={addLineItemPeriod}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="muted-text"
        style={{ margin: "0 0 2px", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}
      >
        {label}
      </p>
      <p style={{ margin: 0, fontWeight: 500 }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form field helper
// ---------------------------------------------------------------------------

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={{ fontSize: "0.78rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
