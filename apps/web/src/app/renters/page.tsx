"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, nodeApiGet } from "@/lib/api";
import type { Contract, Renter } from "@/lib/types";
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

interface RenterDetail extends Renter {
  contracts?: ContractSummary[];
  charges_summary?: ChargeSummary;
  documents?: DocItem[];
}

interface ContractSummary {
  id: string;
  property_address: string;
  monthly_rent: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface ChargeSummary {
  total_due: string;
  total_paid: string;
  overdue_count: number;
}

interface DocItem {
  id: string;
  name: string;
  type: string;
  uploaded_at: string;
  url: string;
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

type DetailTab = "info" | "contracts" | "charges" | "documents";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RentersPage() {
  const [renters, setRenters] = useState<RenterDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");

  // Detail panel
  const [selected, setSelected] = useState<RenterDetail | null>(null);
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
    notes: "",
  });
  const [docError, setDocError] = useState<string | null>(null);

  // Document upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState("RG");
  const [uploading, setUploading] = useState(false);

  // ---------------------------------------------------------------------------
  // Load renters
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await nodeApiGet<RenterDetail[]>("/renters");
      setRenters(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar locatários");
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

  const openDetail = useCallback(async (renter: RenterDetail) => {
    setSelected(renter);
    setActiveTab("info");
    setDetailLoading(true);
    try {
      const detail = await apiGet<RenterDetail>(`/v1/renters/${renter.id}`);
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
    return renters.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.document?.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    );
  }, [renters, search]);

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
        await apiPost("/v1/renters", {
          ...form,
          document: form.document.replace(/\D/g, ""),
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
          notes: "",
        });
        await load();
      } catch (e) {
        setCreateError(
          e instanceof Error ? e.message : "Erro ao criar locatário",
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
      fd.append("folder", `renters/${selected.id}`);
      fd.append("type", uploadType);
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/v1/uploads`,
        { method: "POST", body: fd },
      );
      setUploadFile(null);
      // Reload detail
      const detail = await apiGet<RenterDetail>(`/v1/renters/${selected.id}`);
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
      key: "contracts",
      header: "Contratos",
      render: (r) => {
        const contracts = r.contracts as ContractSummary[] | undefined;
        const count = contracts?.length ?? 0;
        return (
          <Badge variant={count > 0 ? "info" : "default"}>
            {count} contrato{count !== 1 ? "s" : ""}
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
          <h2>Locatários</h2>
          <p>Gerencie os locatários dos seus imóveis</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Novo Locatário</Button>
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
          <Spinner size="lg" label="Carregando locatários…" />
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
          rowKey={(r) => (r as unknown as RenterDetail).id}
          emptyText="Nenhum locatário encontrado"
          onRowClick={(r) => void openDetail(r as unknown as RenterDetail)}
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
                ["info", "contracts", "charges", "documents"] as DetailTab[]
              ).map((tab) => {
                const labels: Record<DetailTab, string> = {
                  info: "Informações",
                  contracts: "Contratos",
                  charges: "Pagamentos",
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
            )}

            {/* Tab: Contratos */}
            {activeTab === "contracts" && (
              <div>
                {!selected.contracts?.length ? (
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
                    {selected.contracts.map((c) => (
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
                          <p
                            style={{ fontWeight: 500, marginBottom: "0.25rem" }}
                          >
                            {c.property_address}
                          </p>
                          <p
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--color-muted)",
                            }}
                          >
                            {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p
                            style={{
                              fontWeight: 600,
                              color: "var(--color-primary)",
                            }}
                          >
                            {fmtBRL(c.monthly_rent)}/mês
                          </p>
                          <Badge
                            variant={statusVariant(c.status)}
                            style={{ marginTop: "0.25rem" }}
                          >
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Pagamentos */}
            {activeTab === "charges" && (
              <div>
                {selected.charges_summary ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "1rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    <Card title="Total devedor">
                      <p
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-danger)",
                        }}
                      >
                        {fmtBRL(selected.charges_summary.total_due)}
                      </p>
                    </Card>
                    <Card title="Total pago">
                      <p
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-success)",
                        }}
                      >
                        {fmtBRL(selected.charges_summary.total_paid)}
                      </p>
                    </Card>
                    <Card title="Em atraso">
                      <p
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "var(--color-warning)",
                        }}
                      >
                        {selected.charges_summary.overdue_count} cobrança
                        {selected.charges_summary.overdue_count !== 1
                          ? "s"
                          : ""}
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
                    Sem histórico de pagamentos
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
                        {
                          value: "COMPROVANTE_RENDA",
                          label: "Comprovante de renda",
                        },
                        {
                          value: "COMPROVANTE_RESIDENCIA",
                          label: "Comprovante de residência",
                        },
                        {
                          value: "CONTRATO_ASSINADO",
                          label: "Contrato assinado",
                        },
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
        title="Novo Locatário"
      >
        <form onSubmit={(e) => void handleCreate(e)}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
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
            <Input
              label="Endereço"
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
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  marginBottom: "0.25rem",
                  color: "var(--color-muted)",
                }}
              >
                Observações
              </label>
              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={3}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  fontSize: "0.875rem",
                  resize: "vertical",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              />
            </div>

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
                {creating ? <Spinner size="sm" /> : "Criar locatário"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </section>
  );
}
