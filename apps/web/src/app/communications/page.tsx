"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
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

interface Message {
  id: string;
  type: "email" | "whatsapp" | "sms" | string;
  recipient_name: string;
  recipient_contact: string;
  subject?: string;
  body: string;
  template_id?: string;
  status: "sent" | "delivered" | "failed" | "pending" | string;
  sent_at: string;
  delivered_at?: string;
  failed_reason?: string;
  charge_id?: string;
  contract_id?: string;
}

interface Template {
  id: string;
  name: string;
  type: "email" | "whatsapp" | "sms";
  subject?: string;
  body: string;
  variables: string[];
  category: "payment_reminder" | "contract" | "maintenance" | "general";
}

interface Recipient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  type: "renter" | "owner";
}

interface BulkResult {
  job_id: string;
  queued: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function fmtDateTime(s: string) {
  return s
    ? new Date(s).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

const TYPE_OPTIONS = [
  { value: "", label: "Todos os canais" },
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "sent", label: "Enviado" },
  { value: "delivered", label: "Entregue" },
  { value: "pending", label: "Pendente" },
  { value: "failed", label: "Falhou" },
];

const CATEGORY_LABELS: Record<string, string> = {
  payment_reminder: "Lembrete de pagamento",
  contract: "Contrato",
  maintenance: "Manutenção",
  general: "Geral",
};

const TYPE_ICON: Record<string, string> = {
  email: "✉",
  whatsapp: "💬",
  sms: "📱",
};

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type ActiveTab = "history" | "templates" | "bulk";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommunicationsPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("history");

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Detail modal
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);

  // Compose modal
  const [showCompose, setShowCompose] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeForm, setComposeForm] = useState({
    type: "email",
    recipient_id: "",
    template_id: "",
    subject: "",
    body: "",
  });

  // Bulk send modal
  const [showBulk, setShowBulk] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    type: "email",
    template_id: "",
    recipient_type: "renter",
    category: "payment_reminder",
  });
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Template preview
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [msgs, tpls, rcps] = await Promise.all([
        apiGet<Message[]>("/v1/communications"),
        apiGet<Template[]>("/v1/communications/templates").catch(
          () => [] as Template[],
        ),
        apiGet<Recipient[]>("/v1/communications/recipients").catch(
          () => [] as Recipient[],
        ),
      ]);
      setMessages(msgs);
      setTemplates(tpls);
      setRecipients(rcps);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao carregar comunicações",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Template auto-fill
  // ---------------------------------------------------------------------------

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      setComposeForm((f) => ({ ...f, template_id: templateId }));
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl) {
        setComposeForm((f) => ({
          ...f,
          type: tpl.type,
          subject: tpl.subject ?? f.subject,
          body: tpl.body,
        }));
      }
    },
    [templates],
  );

  // ---------------------------------------------------------------------------
  // Compose
  // ---------------------------------------------------------------------------

  const handleCompose = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setComposing(true);
      setComposeError(null);
      try {
        await apiPost("/v1/communications/send", {
          type: composeForm.type,
          recipient_id: composeForm.recipient_id,
          template_id: composeForm.template_id || undefined,
          subject: composeForm.subject || undefined,
          body: composeForm.body,
        });
        setShowCompose(false);
        setComposeForm({
          type: "email",
          recipient_id: "",
          template_id: "",
          subject: "",
          body: "",
        });
        await load();
      } catch (e) {
        setComposeError(
          e instanceof Error ? e.message : "Erro ao enviar mensagem",
        );
      } finally {
        setComposing(false);
      }
    },
    [composeForm, load],
  );

  // ---------------------------------------------------------------------------
  // Bulk send
  // ---------------------------------------------------------------------------

  const handleBulkSend = useCallback(async () => {
    setBulkSending(true);
    setBulkResult(null);
    setBulkError(null);
    try {
      const res = await apiPost<BulkResult>("/v1/communications/bulk-send", {
        type: bulkForm.type,
        template_id: bulkForm.template_id,
        recipient_type: bulkForm.recipient_type,
        category: bulkForm.category,
      });
      setBulkResult(res);
      await load();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Erro ao enviar em lote");
    } finally {
      setBulkSending(false);
    }
  }, [bulkForm, load]);

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      if (filterType && m.type !== filterType) return false;
      if (filterStatus && m.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          m.recipient_name.toLowerCase().includes(q) ||
          m.subject?.toLowerCase().includes(q) ||
          m.recipient_contact.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [messages, filterType, filterStatus, search]);

  // ---------------------------------------------------------------------------
  // KPIs
  // ---------------------------------------------------------------------------

  const kpis = useMemo(() => {
    const total = messages.length;
    const delivered = messages.filter((m) => m.status === "delivered").length;
    const failed = messages.filter((m) => m.status === "failed").length;
    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, failed, rate };
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "type",
      header: "Canal",
      render: (r) => (
        <span style={{ fontSize: "1.1rem" }} title={r.type as string}>
          {TYPE_ICON[r.type as string] ?? "📨"}
        </span>
      ),
    },
    {
      key: "recipient_name",
      header: "Destinatário",
      render: (r) => (
        <div>
          <p style={{ fontWeight: 500 }}>{r.recipient_name as string}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
            {r.recipient_contact as string}
          </p>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Assunto / Mensagem",
      render: (r) => (
        <p
          style={{
            maxWidth: 280,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {(r.subject as string) || (r.body as string)}
        </p>
      ),
    },
    {
      key: "sent_at",
      header: "Enviado em",
      render: (r) => <span>{fmtDateTime(r.sent_at as string)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const s = r.status as string;
        return (
          <Badge variant={statusVariant(s)}>
            {s === "delivered"
              ? "Entregue"
              : s === "sent"
                ? "Enviado"
                : s === "failed"
                  ? "Falhou"
                  : "Pendente"}
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
          <p className="eyebrow">Comunicações</p>
          <h2>Central de comunicações</h2>
          <p>Histórico de mensagens, templates e envio em massa</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button variant="ghost" onClick={() => setShowBulk(true)}>
            Envio em massa
          </Button>
          <Button onClick={() => setShowCompose(true)}>
            + Compor mensagem
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
        <Card title="Total enviado">
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{kpis.total}</p>
        </Card>
        <Card title="Entregues">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-success)",
            }}
          >
            {kpis.delivered}
          </p>
        </Card>
        <Card title="Falharam">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-danger)",
            }}
          >
            {kpis.failed}
          </p>
        </Card>
        <Card title="Taxa de entrega">
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color:
                kpis.rate >= 90
                  ? "var(--color-success)"
                  : "var(--color-warning)",
            }}
          >
            {kpis.rate}%
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {(["history", "templates", "bulk"] as ActiveTab[]).map((tab) => {
          const labels: Record<ActiveTab, string> = {
            history: "Histórico",
            templates: "Templates",
            bulk: "Envios em massa",
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

      {/* Tab: History */}
      {activeTab === "history" && (
        <>
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
                placeholder="Buscar por destinatário, assunto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                options={TYPE_OPTIONS}
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>

          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "3rem",
              }}
            >
              <Spinner size="lg" label="Carregando mensagens…" />
            </div>
          ) : error ? (
            <Card>
              <p style={{ color: "var(--color-danger)", textAlign: "center" }}>
                {error}
              </p>
            </Card>
          ) : (
            <Table
              columns={columns}
              data={filtered as unknown as Record<string, unknown>[]}
              rowKey={(r) => (r as unknown as Message).id}
              emptyText="Nenhuma mensagem encontrada"
              onRowClick={(r) => setSelectedMsg(r as unknown as Message)}
            />
          )}
        </>
      )}

      {/* Tab: Templates */}
      {activeTab === "templates" && (
        <div>
          {templates.length === 0 ? (
            <p
              style={{
                color: "var(--color-muted)",
                textAlign: "center",
                padding: "3rem",
              }}
            >
              Nenhum template cadastrado
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "1rem",
              }}
            >
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl)}
                  style={{
                    padding: "1.25rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    background: "var(--color-surface)",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "var(--color-primary)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "var(--color-border)";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <p style={{ fontWeight: 600 }}>{tpl.name}</p>
                    <div style={{ display: "flex", gap: "0.375rem" }}>
                      <Badge variant="info">{tpl.type}</Badge>
                      <Badge variant="default">
                        {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                      </Badge>
                    </div>
                  </div>
                  {tpl.subject && (
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--color-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Assunto: {tpl.subject}
                    </p>
                  )}
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--color-muted)",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {tpl.body}
                  </p>
                  {tpl.variables.length > 0 && (
                    <div
                      style={{
                        marginTop: "0.75rem",
                        display: "flex",
                        gap: "0.375rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {tpl.variables.map((v) => (
                        <span
                          key={v}
                          style={{
                            fontSize: "0.7rem",
                            padding: "2px 6px",
                            background: "var(--color-primary)",
                            color: "#fff",
                            borderRadius: 4,
                            fontFamily: "monospace",
                          }}
                        >
                          {"{"}
                          {v}
                          {"}"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Bulk */}
      {activeTab === "bulk" && (
        <div style={{ maxWidth: 600 }}>
          <Card title="Envio em massa — Lembretes de pagamento">
            <p
              style={{
                color: "var(--color-muted)",
                fontSize: "0.875rem",
                marginBottom: "1.25rem",
              }}
            >
              Envie lembretes de pagamento ou outras comunicações para todos os
              locatários ou proprietários de uma vez.
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <Select
                label="Canal"
                value={bulkForm.type}
                onChange={(e) =>
                  setBulkForm((f) => ({ ...f, type: e.target.value }))
                }
                options={[
                  { value: "email", label: "E-mail" },
                  { value: "whatsapp", label: "WhatsApp" },
                  { value: "sms", label: "SMS" },
                ]}
              />
              <Select
                label="Template"
                value={bulkForm.template_id}
                onChange={(e) =>
                  setBulkForm((f) => ({ ...f, template_id: e.target.value }))
                }
                options={[
                  { value: "", label: "Selecionar template…" },
                  ...templates.map((t) => ({
                    value: t.id,
                    label: t.name,
                  })),
                ]}
              />
              <Select
                label="Destinatários"
                value={bulkForm.recipient_type}
                onChange={(e) =>
                  setBulkForm((f) => ({
                    ...f,
                    recipient_type: e.target.value,
                  }))
                }
                options={[
                  { value: "renter", label: "Todos os locatários" },
                  { value: "owner", label: "Todos os proprietários" },
                  { value: "all", label: "Todos (locatários + proprietários)" },
                ]}
              />

              {bulkResult && (
                <p
                  style={{
                    color: "var(--color-success)",
                    fontSize: "0.875rem",
                    padding: "0.75rem",
                    background: "var(--color-surface)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--color-success)",
                  }}
                >
                  {bulkResult.queued} mensagem
                  {bulkResult.queued !== 1 ? "s" : ""} enfileirada
                  {bulkResult.queued !== 1 ? "s" : ""} (job {bulkResult.job_id})
                </p>
              )}

              {bulkError && (
                <p
                  style={{
                    color: "var(--color-danger)",
                    fontSize: "0.875rem",
                  }}
                >
                  {bulkError}
                </p>
              )}

              <Button
                onClick={() => void handleBulkSend()}
                disabled={bulkSending || !bulkForm.template_id}
              >
                {bulkSending ? <Spinner size="sm" /> : "Enviar em massa"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Message Detail Modal                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={!!selectedMsg}
        onClose={() => setSelectedMsg(null)}
        title="Detalhe da mensagem"
      >
        {selectedMsg && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
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
                  Canal
                </p>
                <p>
                  {TYPE_ICON[selectedMsg.type] ?? "📨"} {selectedMsg.type}
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
                <Badge variant={statusVariant(selectedMsg.status)}>
                  {selectedMsg.status}
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
                  Destinatário
                </p>
                <p style={{ fontWeight: 500 }}>{selectedMsg.recipient_name}</p>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--color-muted)",
                  }}
                >
                  {selectedMsg.recipient_contact}
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
                  Enviado em
                </p>
                <p>{fmtDateTime(selectedMsg.sent_at)}</p>
              </div>
              {selectedMsg.delivered_at && (
                <div>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-muted)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Entregue em
                  </p>
                  <p>{fmtDateTime(selectedMsg.delivered_at)}</p>
                </div>
              )}
              {selectedMsg.failed_reason && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-muted)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Motivo da falha
                  </p>
                  <p style={{ color: "var(--color-danger)" }}>
                    {selectedMsg.failed_reason}
                  </p>
                </div>
              )}
            </div>

            {selectedMsg.subject && (
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Assunto
                </p>
                <p style={{ fontWeight: 500 }}>{selectedMsg.subject}</p>
              </div>
            )}

            <div>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Conteúdo
              </p>
              <div
                style={{
                  padding: "1rem",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.875rem",
                  lineHeight: 1.6,
                }}
              >
                {selectedMsg.body}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Compose Modal                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={showCompose}
        onClose={() => {
          setShowCompose(false);
          setComposeError(null);
        }}
        title="Compor mensagem"
        size="lg"
      >
        <form onSubmit={(e) => void handleCompose(e)}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <Select
                label="Canal *"
                value={composeForm.type}
                onChange={(e) =>
                  setComposeForm((f) => ({ ...f, type: e.target.value }))
                }
                options={[
                  { value: "email", label: "E-mail" },
                  { value: "whatsapp", label: "WhatsApp" },
                  { value: "sms", label: "SMS" },
                ]}
              />
              <Select
                label="Template (opcional)"
                value={composeForm.template_id}
                onChange={(e) => handleTemplateChange(e.target.value)}
                options={[
                  { value: "", label: "Sem template" },
                  ...templates.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>

            <Select
              label="Destinatário *"
              value={composeForm.recipient_id}
              onChange={(e) =>
                setComposeForm((f) => ({ ...f, recipient_id: e.target.value }))
              }
              options={[
                { value: "", label: "Selecionar destinatário…" },
                ...recipients.map((r) => ({
                  value: r.id,
                  label: `${r.name} (${r.type === "renter" ? "Locatário" : "Proprietário"})`,
                })),
              ]}
            />

            {composeForm.type === "email" && (
              <Input
                label="Assunto"
                value={composeForm.subject}
                onChange={(e) =>
                  setComposeForm((f) => ({ ...f, subject: e.target.value }))
                }
              />
            )}

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  marginBottom: "0.25rem",
                  color: "var(--color-muted)",
                }}
              >
                Mensagem *
              </label>
              <textarea
                value={composeForm.body}
                onChange={(e) =>
                  setComposeForm((f) => ({ ...f, body: e.target.value }))
                }
                rows={6}
                required
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

            {composeError && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.875rem" }}>
                {composeError}
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
                onClick={() => setShowCompose(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  composing || !composeForm.recipient_id || !composeForm.body
                }
              >
                {composing ? <Spinner size="sm" /> : "Enviar"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Template preview modal */}
      <Modal
        open={!!selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        title={selectedTemplate?.name ?? ""}
      >
        {selectedTemplate && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Badge variant="info">{selectedTemplate.type}</Badge>
              <Badge variant="default">
                {CATEGORY_LABELS[selectedTemplate.category] ??
                  selectedTemplate.category}
              </Badge>
            </div>
            {selectedTemplate.subject && (
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Assunto
                </p>
                <p style={{ fontWeight: 500 }}>{selectedTemplate.subject}</p>
              </div>
            )}
            <div>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-muted)",
                  marginBottom: "0.5rem",
                }}
              >
                Conteúdo
              </p>
              <div
                style={{
                  padding: "1rem",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.875rem",
                  lineHeight: 1.6,
                }}
              >
                {selectedTemplate.body}
              </div>
            </div>
            {selectedTemplate.variables.length > 0 && (
              <div>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Variáveis disponíveis
                </p>
                <div
                  style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}
                >
                  {selectedTemplate.variables.map((v) => (
                    <span
                      key={v}
                      style={{
                        fontSize: "0.8rem",
                        padding: "2px 8px",
                        background: "var(--color-primary)",
                        color: "#fff",
                        borderRadius: 4,
                        fontFamily: "monospace",
                      }}
                    >
                      {"{"}
                      {v}
                      {"}"}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                onClick={() => {
                  setSelectedTemplate(null);
                  setComposeForm((f) => ({
                    ...f,
                    template_id: selectedTemplate.id,
                    type: selectedTemplate.type,
                    subject: selectedTemplate.subject ?? f.subject,
                    body: selectedTemplate.body,
                  }));
                  setShowCompose(true);
                }}
              >
                Usar este template
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
