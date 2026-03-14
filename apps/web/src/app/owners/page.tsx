"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OwnerDetail extends Owner {
  properties?: PropertySummary[];
  revenue_summary?: RevenueSummary;
  documents?: DocItem[];
  bank_account?: BankAccount;
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
  bank_name: string;
  agency: string;
  account: string;
  account_type: string;
  pix_key?: string;
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

type DetailTab = "info" | "properties" | "revenue" | "documents";

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

  // Document upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState("RG");
  const [uploading, setUploading] = useState(false);

  // ---------------------------------------------------------------------------
  // Load owners
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<OwnerDetail[]>("/v1/owners");
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
  // Upload document
  // ---------------------------------------------------------------------------

  const handleUpload = useCallback(async () => {
    if (!uploadFile || !selected) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("folder", `owners/${selected.id}`);
      fd.append("type", uploadType);
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/v1/uploads`,
        { method: "POST", body: fd },
      );
      setUploadFile(null);
      const detail = await apiGet<OwnerDetail>(`/v1/owners/${selected.id}`);
      setSelected(detail);
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  }, [uploadFile, uploadType, selected]);

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
            {count} imóvel{count !== 1 ? "is" : ""}
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
        <Button onClick={() => setShowCreate(true)}>+ Novo Proprietário</Button>
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
                ["info", "properties", "revenue", "documents"] as DetailTab[]
              ).map((tab) => {
                const labels: Record<DetailTab, string> = {
                  info: "Informações",
                  properties: "Imóveis",
                  revenue: "Receitas",
                  documents: "Documentos",
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
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                }}
              >
                {/* Personal */}
                <div>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--color-muted)",
                      marginBottom: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    Dados pessoais
                  </p>
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
                        Nome completo
                      </p>
                      <p style={{ fontWeight: 500 }}>{selected.name}</p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        CPF / CNPJ
                      </p>
                      <p style={{ fontFamily: "monospace" }}>
                        {formatDoc(selected.document)}
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
                        E-mail
                      </p>
                      <p>{selected.email || "—"}</p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Telefone
                      </p>
                      <p>{selected.phone || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Bank account */}
                {selected.bank_account && (
                  <div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--color-muted)",
                        marginBottom: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      Dados bancários
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: "1rem",
                        padding: "1rem",
                        background:
                          "var(--color-surface-alt, var(--color-surface))",
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
                          Banco
                        </p>
                        <p style={{ fontWeight: 500 }}>
                          {selected.bank_account.bank_name}
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
                          Agência
                        </p>
                        <p style={{ fontFamily: "monospace" }}>
                          {selected.bank_account.agency}
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
                          Conta ({selected.bank_account.account_type})
                        </p>
                        <p style={{ fontFamily: "monospace" }}>
                          {selected.bank_account.account}
                        </p>
                      </div>
                      {selected.bank_account.pix_key && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <p
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--color-muted)",
                              marginBottom: "0.25rem",
                            }}
                          >
                            Chave PIX
                          </p>
                          <p style={{ fontFamily: "monospace" }}>
                            {selected.bank_account.pix_key}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Imóveis */}
            {activeTab === "properties" && (
              <div>
                {!selected.properties?.length ? (
                  <p
                    style={{
                      color: "var(--color-muted)",
                      textAlign: "center",
                      padding: "2rem",
                    }}
                  >
                    Nenhum imóvel vinculado
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {selected.properties.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          padding: "1rem",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <p
                            style={{ fontWeight: 500, marginBottom: "0.25rem" }}
                          >
                            {p.address}
                          </p>
                          <p
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--color-muted)",
                            }}
                          >
                            {p.city}, {p.state}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {p.monthly_rent && (
                            <p
                              style={{
                                fontWeight: 600,
                                color: "var(--color-primary)",
                                marginBottom: "0.25rem",
                              }}
                            >
                              {fmtBRL(p.monthly_rent)}/mês
                            </p>
                          )}
                          {p.active_contract_status && (
                            <Badge
                              variant={statusVariant(p.active_contract_status)}
                            >
                              {p.active_contract_status}
                            </Badge>
                          )}
                        </div>
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

            {/* Tab: Documentos */}
            {activeTab === "documents" && (
              <div>
                {/* Upload form */}
                <div
                  style={{
                    padding: "1rem",
                    border: "1px dashed var(--color-border)",
                    borderRadius: "var(--radius)",
                    marginBottom: "1.5rem",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <Select
                      label="Tipo"
                      value={uploadType}
                      onChange={(e) => setUploadType(e.target.value)}
                      options={[
                        { value: "RG", label: "RG" },
                        { value: "CPF", label: "CPF" },
                        { value: "CNPJ", label: "Cartão CNPJ" },
                        {
                          value: "COMPROVANTE_RESIDENCIA",
                          label: "Comprovante de residência",
                        },
                        {
                          value: "ESCRITURA",
                          label: "Escritura / Matrícula",
                        },
                        { value: "PROCURACAO", label: "Procuração" },
                        { value: "OUTRO", label: "Outro" },
                      ]}
                    />
                  </div>
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        marginBottom: "0.25rem",
                        color: "var(--color-muted)",
                      }}
                    >
                      Arquivo (PDF / Imagem)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) =>
                        setUploadFile(e.target.files?.[0] ?? null)
                      }
                      style={{ fontSize: "0.875rem" }}
                    />
                  </div>
                  <Button
                    onClick={() => void handleUpload()}
                    disabled={!uploadFile || uploading}
                    size="sm"
                  >
                    {uploading ? <Spinner size="sm" /> : "Enviar"}
                  </Button>
                </div>

                {/* Document list */}
                {!selected.documents?.length ? (
                  <p
                    style={{
                      color: "var(--color-muted)",
                      textAlign: "center",
                      padding: "1rem",
                    }}
                  >
                    Nenhum documento enviado
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    {selected.documents.map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.75rem",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius)",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontWeight: 500,
                              marginBottom: "0.125rem",
                            }}
                          >
                            {doc.name}
                          </p>
                          <p
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--color-muted)",
                            }}
                          >
                            {doc.type} · {fmtDate(doc.uploaded_at)}
                          </p>
                        </div>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--color-primary)",
                            fontSize: "0.875rem",
                          }}
                        >
                          Abrir
                        </a>
                      </div>
                    ))}
                  </div>
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
