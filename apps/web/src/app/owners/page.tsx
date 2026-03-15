"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, nodeApiGet } from "@/lib/api";
import type { Owner, Property } from "@/lib/types";
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
import { exportCSV } from "@/lib/export-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OwnerDetail extends Owner {
  properties?: PropertySummary[];
  contracts?: ContractSummary[];
  revenue_summary?: RevenueSummary;
  documents?: DocItem[];
  bank_account?: BankAccount | null;
}

interface PropertySummary {
  id: string;
  address: string;
  city: string;
  state: string;
  active_contract_status?: string;
  monthly_rent?: string;
}

interface RevenueSummary {
  total_received: string;
  pending_amount: string;
  properties_count: number;
}

interface DocItem {
  id: string;
  name: string;
  type: string;
  uploaded_at: string;
  url: string;
}

interface BankAccount {
  bank_code?: string;
  bank_name?: string;
  agency: string;
  account: string;
  account_type: string;
  pix_key?: string;
}

interface ContractSummary {
  id: string;
  code?: string;
  property_address: string;
  monthly_rent: string;
  start_date: string;
  end_date: string;
  status: string;
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

function formatDoc(doc: string) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

function validateDoc(doc: string): boolean {
  const d = doc.replace(/\D/g, "");
  return d.length === 11 || d.length === 14;
}

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type DetailTab = "info" | "contracts" | "revenue";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OwnersPage() {
  const [owners, setOwners] = useState<OwnerDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");

  // Detail panel
  const [selected, setSelected] = useState<OwnerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("info");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    bank_name: "",
    bank_agency: "",
    bank_account: "",
    bank_account_type: "corrente",
    pix_key: "",
    notes: "",
  });
  const [docError, setDocError] = useState<string | null>(null);


  // ---------------------------------------------------------------------------
  // Load owners
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await nodeApiGet<OwnerDetail[]>("/owners");
      setOwners(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao carregar proprietários",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Load detail
  // ---------------------------------------------------------------------------

  const openDetail = useCallback(async (owner: OwnerDetail) => {
    setSelected(owner);
    setActiveTab("info");
    setDetailLoading(true);
    try {
      const detail = await apiGet<OwnerDetail>(`/v1/owners/${owner.id}`);
      setSelected(detail);
    } catch {
      // keep partial data
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return owners.filter(
      (o) =>
        !q ||
        o.name.toLowerCase().includes(q) ||
        o.email?.toLowerCase().includes(q) ||
        o.document?.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    );
  }, [owners, search]);

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateDoc(form.document)) {
        setDocError("CPF (11 dígitos) ou CNPJ (14 dígitos) inválido");
        return;
      }
      setDocError(null);
      setCreating(true);
      setCreateError(null);
      try {
        await apiPost("/v1/owners", {
          name: form.name,
          document: form.document.replace(/\D/g, ""),
          email: form.email,
          phone: form.phone,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          bank_account: form.bank_account
            ? {
                bank_name: form.bank_name,
                agency: form.bank_agency,
                account: form.bank_account,
                account_type: form.bank_account_type,
                pix_key: form.pix_key || undefined,
              }
            : undefined,
          notes: form.notes,
        });
        setShowCreate(false);
        setForm({
          name: "",
          document: "",
          email: "",
          phone: "",
          address: "",
          city: "",
          state: "",
          zip: "",
          bank_name: "",
          bank_agency: "",
          bank_account: "",
          bank_account_type: "corrente",
          pix_key: "",
          notes: "",
        });
        await load();
      } catch (e) {
        setCreateError(
          e instanceof Error ? e.message : "Erro ao criar proprietário",
        );
      } finally {
        setCreating(false);
      }
    },
    [form, load],
  );


  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "name",
      header: "Nome",
      render: (r) => (
        <span style={{ fontWeight: 500 }}>{r.name as string}</span>
      ),
    },
    {
      key: "document",
      header: "CPF / CNPJ",
      render: (r) => (
        <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
          {formatDoc(r.document as string)}
        </span>
      ),
    },
    {
      key: "email",
      header: "E-mail",
      render: (r) => <span>{(r.email as string) || "—"}</span>,
    },
    {
      key: "phone",
      header: "Telefone",
      render: (r) => <span>{(r.phone as string) || "—"}</span>,
    },
    {
      key: "properties",
      header: "Imóveis",
      render: (r) => {
        const props = r.properties as PropertySummary[] | undefined;
        const count = props?.length ?? 0;
        return (
          <Badge variant={count > 0 ? "info" : "default"}>
            {count} {count === 1 ? "imóvel" : "imóveis"}
          </Badge>
        );
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
          <p className="eyebrow">Gestão</p>
          <h2>Proprietários</h2>
          <p>Gerencie os proprietários dos imóveis</p>
        </div>
        <div className="actions">
          <Button
            variant="ghost"
            onClick={() => {
              exportCSV(
                filtered as (Owner & Record<string, unknown>)[],
                [
                  { key: "name", header: "Nome" },
                  { key: "document", header: "CPF/CNPJ" },
                  { key: "email", header: "E-mail" },
                  { key: "phone", header: "Telefone" },
                ],
                "proprietarios.csv",
              );
            }}
          >
            Exportar CSV
          </Button>
          <Button onClick={() => setShowCreate(true)}>+ Novo Proprietário</Button>
        </div>
      </header>

      {/* Search */}
      <div style={{ marginBottom: "1rem", maxWidth: 400 }}>
        <Input
          placeholder="Buscar por nome, e-mail ou CPF/CNPJ…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "3rem" }}
        >
          <Spinner size="lg" label="Carregando proprietários…" />
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
          rowKey={(r) => (r as unknown as OwnerDetail).id}
          emptyText="Nenhum proprietário encontrado"
          onRowClick={(r) => void openDetail(r as unknown as OwnerDetail)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Detail Modal                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        size="lg"
      >
        {selected && (
          <>
            {detailLoading && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "1rem",
                }}
              >
                <Spinner size="sm" />
              </div>
            )}

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginBottom: "1.5rem",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {(
                ["info", "contracts", "revenue"] as DetailTab[]
              ).map((tab) => {
                const labels: Record<DetailTab, string> = {
                  info: "Informações",
                  contracts: "Contratos",
                  revenue: "Receitas",
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: "0.5rem 1rem",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontWeight: activeTab === tab ? 600 : 400,
                      borderBottom:
                        activeTab === tab
                          ? "2px solid var(--color-primary)"
                          : "2px solid transparent",
                      color:
                        activeTab === tab
                          ? "var(--color-primary)"
                          : "var(--color-muted)",
                      marginBottom: "-1px",
                    }}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Tab: Informações */}
            {activeTab === "info" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                }}
              >
                <InfoField label="Nome completo" value={selected.name} />
                <InfoField label="CPF / CNPJ" value={formatDoc(selected.document)} mono />
                <InfoField label="Celular" value={selected.phone || "—"} />
                <InfoField label="E-mail" value={selected.email || "—"} />
                {selected.bank_account ? (
                  <>
                    <InfoField label="Banco (código)" value={selected.bank_account.bank_code || selected.bank_account.bank_name || "—"} mono />
                    <InfoField label="Agência" value={selected.bank_account.agency || "—"} mono />
                    <InfoField label={`Conta (${selected.bank_account.account_type})`} value={selected.bank_account.account || "—"} mono />
                    <InfoField label="Chave PIX" value={selected.bank_account.pix_key || "—"} mono />
                  </>
                ) : (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>Dados bancários não cadastrados</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Contratos (imóveis + status do contrato) */}
            {activeTab === "contracts" && (
              <div>
                {!selected.contracts?.length && !selected.properties?.length ? (
                  <p
                    style={{
                      color: "var(--color-muted)",
                      textAlign: "center",
                      padding: "2rem",
                    }}
                  >
                    Nenhum contrato vinculado
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {(selected.contracts ?? []).map((c) => (
                      <div
                        key={c.id}
                        style={{
                          padding: "1rem",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.25rem" }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.82rem", color: "var(--accent, var(--color-primary))" }}>
                              {c.code ?? c.id.slice(0, 8)}
                            </span>
                            <Badge variant={statusVariant(c.status)}>
                              {c.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                            {c.property_address}
                          </p>
                          <p style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                            {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                          </p>
                        </div>
                        <p style={{ fontWeight: 600, color: "var(--color-primary)", whiteSpace: "nowrap" }}>
                          {fmtBRL(c.monthly_rent)}/mês
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Receitas */}
            {activeTab === "revenue" && (
              <div>
                {selected.revenue_summary ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "1rem",
                    }}
                  >
                    <Card title="Total recebido">
                      <p
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-success)",
                        }}
                      >
                        {fmtBRL(selected.revenue_summary.total_received)}
                      </p>
                    </Card>
                    <Card title="Pendente">
                      <p
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-warning)",
                        }}
                      >
                        {fmtBRL(selected.revenue_summary.pending_amount)}
                      </p>
                    </Card>
                    <Card title="Imóveis ativos">
                      <p
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-primary)",
                        }}
                      >
                        {selected.revenue_summary.properties_count}
                      </p>
                    </Card>
                  </div>
                ) : (
                  <p
                    style={{
                      color: "var(--color-muted)",
                      textAlign: "center",
                      padding: "2rem",
                    }}
                  >
                    Sem dados de receita disponíveis
                  </p>
                )}
              </div>
            )}

          </>
        )}
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Create Modal                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setCreateError(null);
          setDocError(null);
        }}
        title="Novo Proprietário"
        size="lg"
      >
        <form onSubmit={(e) => void handleCreate(e)}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            {/* Personal */}
            <p
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-muted)",
                fontWeight: 600,
              }}
            >
              Dados pessoais
            </p>
            <Input
              label="Nome completo *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="CPF ou CNPJ *"
              value={form.document}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              onChange={(e) => {
                setForm((f) => ({ ...f, document: e.target.value }));
                setDocError(null);
              }}
              error={docError ?? undefined}
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
                label="E-mail"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              <Input
                label="Telefone"
                value={form.phone}
                placeholder="(11) 99999-9999"
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>

            {/* Address */}
            <p
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-muted)",
                fontWeight: 600,
              }}
            >
              Endereço
            </p>
            <Input
              label="Logradouro"
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                gap: "1rem",
              }}
            >
              <Input
                label="Cidade"
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
              />
              <Input
                label="UF"
                value={form.state}
                maxLength={2}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    state: e.target.value.toUpperCase(),
                  }))
                }
              />
              <Input
                label="CEP"
                value={form.zip}
                placeholder="00000-000"
                onChange={(e) =>
                  setForm((f) => ({ ...f, zip: e.target.value }))
                }
              />
            </div>

            {/* Bank */}
            <p
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--color-muted)",
                fontWeight: 600,
              }}
            >
              Dados bancários (opcional)
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "1rem",
              }}
            >
              <Input
                label="Banco"
                value={form.bank_name}
                placeholder="Ex: Itaú, Bradesco, Santander"
                onChange={(e) =>
                  setForm((f) => ({ ...f, bank_name: e.target.value }))
                }
              />
              <Select
                label="Tipo de conta"
                value={form.bank_account_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bank_account_type: e.target.value }))
                }
                options={[
                  { value: "corrente", label: "Corrente" },
                  { value: "poupanca", label: "Poupança" },
                ]}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <Input
                label="Agência"
                value={form.bank_agency}
                placeholder="0000"
                onChange={(e) =>
                  setForm((f) => ({ ...f, bank_agency: e.target.value }))
                }
              />
              <Input
                label="Conta"
                value={form.bank_account}
                placeholder="00000-0"
                onChange={(e) =>
                  setForm((f) => ({ ...f, bank_account: e.target.value }))
                }
              />
            </div>
            <Input
              label="Chave PIX"
              value={form.pix_key}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              onChange={(e) =>
                setForm((f) => ({ ...f, pix_key: e.target.value }))
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
                onClick={() => setShowCreate(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Spinner size="sm" /> : "Criar proprietário"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: "0.25rem" }}>{label}</p>
      <p style={{ fontWeight: 500, ...(mono ? { fontFamily: "monospace" } : {}) }}>{value}</p>
    </div>
  );
}
