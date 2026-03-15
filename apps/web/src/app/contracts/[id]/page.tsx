"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { nodeApiGet, nodeApiPost } from "@/lib/api";
import type { Contract, Owner, Property, Renter } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Spinner,
  Table,
  statusVariant,
} from "@/components/ui";
import type { Column } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractHistory {
  id: string;
  action: string;
  description: string;
  created_at: string;
  actor?: string;
}

interface ChargeRow {
  id: string;
  description?: string;
  amount: string | number;
  due_date: string;
  status: string;
}

interface BillingRow {
  id: string;
  description?: string;
  amount: string | number;
  issued_at?: string;
  status: string;
}

interface RepasseRow {
  id: string;
  amount: string | number;
  paid_at?: string;
  status: string;
}

interface ContractDetail extends Contract {
  code?: string;
  status?: string;
  owner_id?: string;
  history?: ContractHistory[];
  charges?: ChargeRow[];
  billings?: BillingRow[];
  repasses?: RepasseRow[];
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

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "dados" | "cobrancas" | "faturas" | "repasses" | "documentos" | "historico";

const TABS: { key: Tab; label: string }[] = [
  { key: "dados", label: "Dados" },
  { key: "cobrancas", label: "Cobranças" },
  { key: "faturas", label: "Faturas" },
  { key: "repasses", label: "Repasses" },
  { key: "documentos", label: "Documentos" },
  { key: "historico", label: "Histórico" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [renter, setRenter] = useState<Renter | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dados");
  const [workflowLoading, setWorkflowLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await nodeApiGet<ContractDetail>(`/contracts/${id}`);
      setContract(c);

      const [renters, properties, owners] = await Promise.all([
        nodeApiGet<Renter[]>("/renters").catch(() => [] as Renter[]),
        nodeApiGet<Property[]>("/properties").catch(() => [] as Property[]),
        nodeApiGet<Owner[]>("/owners").catch(() => [] as Owner[]),
      ]);

      setRenter(renters.find((r) => r.id === c.renter_id) ?? null);
      setProperty(properties.find((p) => p.id === c.property_id) ?? null);
      setOwner(owners.find((o) => o.id === c.owner_id) ?? null);
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
    if (!contract) return;
    setWorkflowLoading(action);
    try {
      const statusMap = { activate: "active", suspend: "suspended", terminate: "terminated" };
      await nodeApiPost(`/contracts/${contract.id}/transition`, { status: statusMap[action] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setWorkflowLoading(null);
    }
  }

  if (loading) {
    return (
      <section className="page" style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
        <Spinner size={32} />
      </section>
    );
  }

  if (error || !contract) {
    return (
      <section className="page">
        <p className="error-banner">{error ?? "Contrato não encontrado."}</p>
        <Button variant="ghost" onClick={() => router.push("/contracts")}>
          Voltar para contratos
        </Button>
      </section>
    );
  }

  const status = contract.status ?? "active";
  const code = contract.code ?? `REOS-${id.slice(0, 4).toUpperCase()}`;

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
            {property?.address ?? "Imóvel não identificado"}
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
            <Field label="Imóvel" value={property?.address ?? "—"} />
            <Field label="Inquilino" value={renter?.name ?? "—"} />
            <Field label="Proprietário" value={owner?.name ?? "—"} />
            <Field label="Aluguel mensal" value={fmtBRL(contract.monthly_rent)} />
            <Field label="Início" value={fmtDate(contract.start_date)} />
            <Field label="Término" value={fmtDate(contract.end_date)} />
            <Field label="Dia do vencimento" value={`Dia ${contract.due_day}`} />
            <Field label="Código" value={code} />
          </div>
        </Card>
      )}

      {tab === "cobrancas" && (
        <Card>
          {contract.charges && contract.charges.length > 0 ? (
            <table className="event-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contract.charges.map((c) => (
                  <tr key={c.id}>
                    <td>{c.description ?? "Cobrança"}</td>
                    <td style={{ textAlign: "right" }}>{fmtBRL(c.amount)}</td>
                    <td>{fmtDate(c.due_date)}</td>
                    <td><Badge variant={statusVariant(c.status)}>{c.status.toUpperCase()}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Nenhuma cobrança registrada neste contrato.</p>
          )}
        </Card>
      )}

      {tab === "faturas" && (
        <Card>
          {contract.billings && contract.billings.length > 0 ? (
            <table className="event-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Emissão</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contract.billings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.description ?? "Fatura"}</td>
                    <td style={{ textAlign: "right" }}>{fmtBRL(b.amount)}</td>
                    <td>{b.issued_at ? fmtDate(b.issued_at) : "—"}</td>
                    <td><Badge variant={statusVariant(b.status)}>{b.status.toUpperCase()}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Nenhuma fatura registrada neste contrato.</p>
          )}
        </Card>
      )}

      {tab === "repasses" && (
        <Card>
          {contract.repasses && contract.repasses.length > 0 ? (
            <table className="event-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Data do pagamento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contract.repasses.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: "right" }}>{fmtBRL(r.amount)}</td>
                    <td>{r.paid_at ? fmtDate(r.paid_at) : "—"}</td>
                    <td><Badge variant={statusVariant(r.status)}>{r.status.toUpperCase()}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-state">Nenhum repasse registrado neste contrato.</p>
          )}
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

      {tab === "historico" && (
        <Card>
          {contract.history && contract.history.length > 0 ? (
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 0 }}>
              {contract.history.map((entry, i) => (
                <li
                  key={entry.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "16px 1fr",
                    gap: "0 12px",
                    paddingBottom: i < contract.history!.length - 1 ? 16 : 0,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 4 }} />
                    {i < contract.history!.length - 1 && (
                      <span style={{ width: 1, flex: 1, background: "rgba(31,41,55,0.12)", marginTop: 4 }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: 4 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem" }}>{entry.action}</p>
                    <p className="muted-text" style={{ margin: "2px 0 0" }}>{entry.description}</p>
                    <p className="muted-text" style={{ margin: "2px 0 0", fontSize: "0.75rem" }}>
                      {entry.actor ? `${entry.actor} · ` : ""}{fmtDate(entry.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Nenhum registro de histórico.</p>
          )}
        </Card>
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
