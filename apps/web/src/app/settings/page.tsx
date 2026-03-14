"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  document?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  plan?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "viewer" | string;
  status: "active" | "invited" | string;
  joined_at?: string;
}

interface NotificationPrefs {
  email_new_payment: boolean;
  email_overdue: boolean;
  email_escalation: boolean;
  email_maintenance: boolean;
  whatsapp_new_payment: boolean;
  whatsapp_overdue: boolean;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
  last_delivery?: string;
  last_status?: "success" | "failed";
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used?: string;
  expires_at?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Gerente" },
  { value: "viewer", label: "Visualizador" },
];

const WEBHOOK_EVENTS = [
  "payment.received",
  "payment.overdue",
  "contract.activated",
  "contract.terminated",
  "maintenance.created",
  "maintenance.resolved",
  "escalation.created",
  "agent.task.completed",
];

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type SettingsTab =
  | "org"
  | "team"
  | "notifications"
  | "webhooks"
  | "api_keys"
  | "plan";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("org");
  const [loading, setLoading] = useState(true);

  // Org profile
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [orgForm, setOrgForm] = useState<Partial<OrgProfile>>({});
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgMsg, setOrgMsg] = useState<string | null>(null);

  // Team
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("manager");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    email_new_payment: true,
    email_overdue: true,
    email_escalation: true,
    email_maintenance: false,
    whatsapp_new_payment: false,
    whatsapp_overdue: true,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);

  // Webhooks
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [showWebhook, setShowWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showNewKey, setShowNewKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [o, t, w, k] = await Promise.all([
        apiGet<OrgProfile>("/v1/org/profile"),
        apiGet<TeamMember[]>("/v1/org/team").catch(() => [] as TeamMember[]),
        apiGet<WebhookEndpoint[]>("/v1/webhooks").catch(
          () => [] as WebhookEndpoint[],
        ),
        apiGet<ApiKey[]>("/v1/api-keys").catch(() => [] as ApiKey[]),
      ]);
      setOrg(o);
      setOrgForm(o);
      setTeam(t);
      setWebhooks(w);
      setApiKeys(k);
    } catch {
      // silent — show partial data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Save org
  // ---------------------------------------------------------------------------

  const handleSaveOrg = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingOrg(true);
      setOrgMsg(null);
      try {
        await apiPost("/v1/org/profile", orgForm);
        setOrgMsg("Perfil salvo com sucesso!");
        await load();
      } catch (e) {
        setOrgMsg(
          `Erro: ${e instanceof Error ? e.message : "falha ao salvar"}`,
        );
      } finally {
        setSavingOrg(false);
      }
    },
    [orgForm, load],
  );

  // ---------------------------------------------------------------------------
  // Invite
  // ---------------------------------------------------------------------------

  const handleInvite = useCallback(async () => {
    setInviting(true);
    setInviteMsg(null);
    try {
      await apiPost("/v1/org/team/invite", {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteMsg(`Convite enviado para ${inviteEmail}`);
      setInviteEmail("");
      await load();
    } catch (e) {
      setInviteMsg(
        `Erro: ${e instanceof Error ? e.message : "falha ao convidar"}`,
      );
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, load]);

  const handleRemoveMember = useCallback(async (id: string) => {
    try {
      await apiPost(`/v1/org/team/${id}/remove`, {});
      setTeam((t) => t.filter((m) => m.id !== id));
    } catch {
      // silent
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Notification prefs
  // ---------------------------------------------------------------------------

  const handleSaveNotif = useCallback(async () => {
    setSavingNotif(true);
    setNotifMsg(null);
    try {
      await apiPost("/v1/org/notifications", notifPrefs);
      setNotifMsg("Preferências salvas!");
    } catch (e) {
      setNotifMsg(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally {
      setSavingNotif(false);
    }
  }, [notifPrefs]);

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  const handleCreateWebhook = useCallback(async () => {
    setCreatingWebhook(true);
    setWebhookMsg(null);
    try {
      await apiPost("/v1/webhooks", { url: webhookUrl, events: webhookEvents });
      setShowWebhook(false);
      setWebhookUrl("");
      setWebhookEvents([]);
      setWebhookMsg("Webhook criado!");
      await load();
    } catch (e) {
      setWebhookMsg(`Erro: ${e instanceof Error ? e.message : "falha"}`);
    } finally {
      setCreatingWebhook(false);
    }
  }, [webhookUrl, webhookEvents, load]);

  const toggleWebhookEvent = useCallback((ev: string) => {
    setWebhookEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev],
    );
  }, []);

  // ---------------------------------------------------------------------------
  // API Keys
  // ---------------------------------------------------------------------------

  const handleCreateKey = useCallback(async () => {
    setCreatingKey(true);
    try {
      const res = await apiPost<{ key: string; id: string }>("/v1/api-keys", {
        name: keyName,
      });
      setCreatedKey(res.key);
      setKeyName("");
      await load();
    } catch {
      // silent
    } finally {
      setCreatingKey(false);
    }
  }, [keyName, load]);

  const handleRevokeKey = useCallback(async (id: string) => {
    try {
      await apiPost(`/v1/api-keys/${id}/revoke`, {});
      setApiKeys((k) => k.filter((key) => key.id !== id));
    } catch {
      // silent
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Tab list
  // ---------------------------------------------------------------------------

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "org", label: "Perfil da organização" },
    { id: "team", label: "Equipe" },
    { id: "notifications", label: "Notificações" },
    { id: "webhooks", label: "Webhooks" },
    { id: "api_keys", label: "Chaves de API" },
    { id: "plan", label: "Plano" },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configurações</p>
          <h2>Configurações</h2>
          <p>Gerencie sua organização, equipe e integrações</p>
        </div>
      </header>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--color-border)",
          flexWrap: "wrap",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === t.id ? 600 : 400,
              borderBottom:
                activeTab === t.id
                  ? "2px solid var(--color-primary)"
                  : "2px solid transparent",
              color:
                activeTab === t.id
                  ? "var(--color-primary)"
                  : "var(--color-muted)",
              marginBottom: "-1px",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "3rem" }}
        >
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* ---- Org profile ---- */}
          {activeTab === "org" && (
            <div style={{ maxWidth: 600 }}>
              <form onSubmit={(e) => void handleSaveOrg(e)}>
                <Card title="Perfil da organização">
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                      marginTop: "1rem",
                    }}
                  >
                    <Input
                      label="Nome da organização"
                      value={orgForm.name ?? ""}
                      onChange={(e) =>
                        setOrgForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                    <Input
                      label="E-mail de contato"
                      type="email"
                      value={orgForm.email ?? ""}
                      onChange={(e) =>
                        setOrgForm((f) => ({ ...f, email: e.target.value }))
                      }
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                      }}
                    >
                      <Input
                        label="Telefone"
                        value={orgForm.phone ?? ""}
                        onChange={(e) =>
                          setOrgForm((f) => ({ ...f, phone: e.target.value }))
                        }
                      />
                      <Input
                        label="CNPJ"
                        value={orgForm.document ?? ""}
                        onChange={(e) =>
                          setOrgForm((f) => ({
                            ...f,
                            document: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <Input
                      label="Endereço"
                      value={orgForm.address ?? ""}
                      onChange={(e) =>
                        setOrgForm((f) => ({ ...f, address: e.target.value }))
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
                        value={orgForm.city ?? ""}
                        onChange={(e) =>
                          setOrgForm((f) => ({ ...f, city: e.target.value }))
                        }
                      />
                      <Input
                        label="UF"
                        value={orgForm.state ?? ""}
                        maxLength={2}
                        onChange={(e) =>
                          setOrgForm((f) => ({
                            ...f,
                            state: e.target.value.toUpperCase(),
                          }))
                        }
                      />
                      <Input
                        label="CEP"
                        value={orgForm.zip ?? ""}
                        onChange={(e) =>
                          setOrgForm((f) => ({ ...f, zip: e.target.value }))
                        }
                      />
                    </div>

                    {orgMsg && (
                      <p
                        style={{
                          fontSize: "0.875rem",
                          color: orgMsg.startsWith("Erro")
                            ? "var(--color-danger)"
                            : "var(--color-success)",
                        }}
                      >
                        {orgMsg}
                      </p>
                    )}

                    <div
                      style={{ display: "flex", justifyContent: "flex-end" }}
                    >
                      <Button type="submit" disabled={savingOrg}>
                        {savingOrg ? <Spinner size="sm" /> : "Salvar"}
                      </Button>
                    </div>
                  </div>
                </Card>
              </form>
            </div>
          )}

          {/* ---- Team ---- */}
          {activeTab === "team" && (
            <div style={{ maxWidth: 700 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <p
                  style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}
                >
                  {team.length} membro{team.length !== 1 ? "s" : ""}
                </p>
                <Button size="sm" onClick={() => setShowInvite(true)}>
                  + Convidar
                </Button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {team.map((m) => (
                  <div
                    key={m.id}
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
                      <p style={{ fontWeight: 500 }}>{m.name}</p>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted)",
                        }}
                      >
                        {m.email}
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <Badge
                        variant={
                          m.role === "admin"
                            ? "danger"
                            : m.role === "manager"
                              ? "info"
                              : "default"
                        }
                      >
                        {m.role}
                      </Badge>
                      {m.status === "invited" && (
                        <Badge variant="warning">Pendente</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRemoveMember(m.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
                {team.length === 0 && (
                  <p
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--color-muted)",
                    }}
                  >
                    Nenhum membro
                  </p>
                )}
              </div>

              {/* Invite modal */}
              <Modal
                open={showInvite}
                onClose={() => {
                  setShowInvite(false);
                  setInviteMsg(null);
                }}
                title="Convidar membro"
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <Input
                    label="E-mail *"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <Select
                    label="Papel"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    options={ROLE_OPTIONS}
                  />
                  {inviteMsg && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: inviteMsg.startsWith("Erro")
                          ? "var(--color-danger)"
                          : "var(--color-success)",
                      }}
                    >
                      {inviteMsg}
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
                      onClick={() => setShowInvite(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => void handleInvite()}
                      disabled={inviting || !inviteEmail}
                    >
                      {inviting ? <Spinner size="sm" /> : "Enviar convite"}
                    </Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {/* ---- Notifications ---- */}
          {activeTab === "notifications" && (
            <div style={{ maxWidth: 560 }}>
              <Card title="Preferências de notificação">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                    marginTop: "1rem",
                  }}
                >
                  {[
                    {
                      key: "email_new_payment",
                      label: "E-mail — Pagamento recebido",
                    },
                    {
                      key: "email_overdue",
                      label: "E-mail — Cobrança em atraso",
                    },
                    {
                      key: "email_escalation",
                      label: "E-mail — Nova escalação",
                    },
                    {
                      key: "email_maintenance",
                      label: "E-mail — Chamado de manutenção",
                    },
                    {
                      key: "whatsapp_new_payment",
                      label: "WhatsApp — Pagamento recebido",
                    },
                    {
                      key: "whatsapp_overdue",
                      label: "WhatsApp — Cobrança em atraso",
                    },
                  ].map((pref) => (
                    <div
                      key={pref.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "0.875rem" }}>{pref.label}</span>
                      <label
                        style={{
                          position: "relative",
                          display: "inline-block",
                          width: 40,
                          height: 22,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            notifPrefs[pref.key as keyof NotificationPrefs]
                          }
                          onChange={(e) =>
                            setNotifPrefs((p) => ({
                              ...p,
                              [pref.key]: e.target.checked,
                            }))
                          }
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            cursor: "pointer",
                            inset: 0,
                            background: notifPrefs[
                              pref.key as keyof NotificationPrefs
                            ]
                              ? "var(--color-primary)"
                              : "var(--color-border)",
                            borderRadius: 11,
                            transition: "background 0.2s",
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            content: '""',
                            height: 16,
                            width: 16,
                            left: notifPrefs[
                              pref.key as keyof NotificationPrefs
                            ]
                              ? 21
                              : 3,
                            bottom: 3,
                            background: "#fff",
                            borderRadius: "50%",
                            transition: "left 0.2s",
                          }}
                        />
                      </label>
                    </div>
                  ))}

                  {notifMsg && (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: notifMsg.startsWith("Erro")
                          ? "var(--color-danger)"
                          : "var(--color-success)",
                      }}
                    >
                      {notifMsg}
                    </p>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      onClick={() => void handleSaveNotif()}
                      disabled={savingNotif}
                    >
                      {savingNotif ? <Spinner size="sm" /> : "Salvar"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ---- Webhooks ---- */}
          {activeTab === "webhooks" && (
            <div style={{ maxWidth: 700 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "1rem",
                }}
              >
                {webhookMsg && (
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: webhookMsg.startsWith("Erro")
                        ? "var(--color-danger)"
                        : "var(--color-success)",
                    }}
                  >
                    {webhookMsg}
                  </p>
                )}
                <div style={{ marginLeft: "auto" }}>
                  <Button size="sm" onClick={() => setShowWebhook(true)}>
                    + Adicionar webhook
                  </Button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {webhooks.map((wh) => (
                  <div
                    key={wh.id}
                    style={{
                      padding: "1rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                        }}
                      >
                        {wh.url}
                      </p>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Badge variant={wh.active ? "success" : "default"}>
                          {wh.active ? "Ativo" : "Inativo"}
                        </Badge>
                        {wh.last_status && (
                          <Badge
                            variant={
                              wh.last_status === "success"
                                ? "success"
                                : "danger"
                            }
                          >
                            {wh.last_status === "success"
                              ? "Última entrega: OK"
                              : "Última entrega: Falhou"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.375rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {wh.events.map((ev) => (
                        <span
                          key={ev}
                          style={{
                            fontSize: "0.7rem",
                            padding: "2px 6px",
                            background: "var(--color-primary)",
                            color: "#fff",
                            borderRadius: 4,
                            fontFamily: "monospace",
                          }}
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {webhooks.length === 0 && (
                  <p
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--color-muted)",
                    }}
                  >
                    Nenhum webhook configurado
                  </p>
                )}
              </div>

              {/* Add webhook modal */}
              <Modal
                open={showWebhook}
                onClose={() => {
                  setShowWebhook(false);
                  setWebhookUrl("");
                  setWebhookEvents([]);
                }}
                title="Adicionar webhook"
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <Input
                    label="URL do endpoint *"
                    value={webhookUrl}
                    placeholder="https://seu-sistema.com/webhooks/realstateos"
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <div>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        marginBottom: "0.5rem",
                        color: "var(--color-muted)",
                      }}
                    >
                      Eventos
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.5rem",
                      }}
                    >
                      {WEBHOOK_EVENTS.map((ev) => (
                        <label
                          key={ev}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={webhookEvents.includes(ev)}
                            onChange={() => toggleWebhookEvent(ev)}
                          />
                          <span style={{ fontFamily: "monospace" }}>{ev}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => setShowWebhook(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => void handleCreateWebhook()}
                      disabled={
                        creatingWebhook ||
                        !webhookUrl ||
                        webhookEvents.length === 0
                      }
                    >
                      {creatingWebhook ? <Spinner size="sm" /> : "Criar"}
                    </Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {/* ---- API Keys ---- */}
          {activeTab === "api_keys" && (
            <div style={{ maxWidth: 700 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "1rem",
                }}
              >
                <Button size="sm" onClick={() => setShowNewKey(true)}>
                  + Nova chave
                </Button>
              </div>

              {createdKey && (
                <div
                  style={{
                    padding: "1rem",
                    marginBottom: "1rem",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-success)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--color-success)",
                      marginBottom: "0.5rem",
                      fontWeight: 600,
                    }}
                  >
                    Chave criada — copie agora, não será exibida novamente
                  </p>
                  <p
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      wordBreak: "break-all",
                      background: "var(--color-bg)",
                      padding: "0.5rem",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    {createdKey}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreatedKey(null)}
                    style={{ marginTop: "0.5rem" }}
                  >
                    Fechar
                  </Button>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {apiKeys.map((k) => (
                  <div
                    key={k.id}
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
                      <p style={{ fontWeight: 500 }}>{k.name}</p>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted)",
                          fontFamily: "monospace",
                        }}
                      >
                        {k.prefix}••••••••
                        {k.last_used
                          ? ` · Usado em ${fmtDate(k.last_used)}`
                          : " · Nunca usado"}
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleRevokeKey(k.id)}
                    >
                      Revogar
                    </Button>
                  </div>
                ))}
                {apiKeys.length === 0 && (
                  <p
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--color-muted)",
                    }}
                  >
                    Nenhuma chave de API
                  </p>
                )}
              </div>

              {/* New key modal */}
              <Modal
                open={showNewKey}
                onClose={() => {
                  setShowNewKey(false);
                  setKeyName("");
                }}
                title="Criar chave de API"
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <Input
                    label="Nome da chave *"
                    value={keyName}
                    placeholder="Ex: Integração ERP, CI/CD, etc."
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => setShowNewKey(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => {
                        setShowNewKey(false);
                        void handleCreateKey();
                      }}
                      disabled={creatingKey || !keyName}
                    >
                      {creatingKey ? <Spinner size="sm" /> : "Criar"}
                    </Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {/* ---- Plan ---- */}
          {activeTab === "plan" && (
            <div style={{ maxWidth: 600 }}>
              <Card title="Plano atual">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    marginTop: "1rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    {org?.plan ?? "Professional"}
                  </p>
                  <Badge variant="success">Ativo</Badge>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  {[
                    { label: "Imóveis", value: "Ilimitado" },
                    { label: "Contratos", value: "Ilimitado" },
                    { label: "Usuários", value: "10" },
                    { label: "Agentes de IA", value: "Todos" },
                    { label: "Webhooks", value: "20" },
                    { label: "Exportações/mês", value: "100" },
                  ].map((f) => (
                    <div key={f.label}>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--color-muted)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {f.label}
                      </p>
                      <p style={{ fontWeight: 600 }}>{f.value}</p>
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-muted)",
                    textAlign: "center",
                    padding: "1rem",
                    border: "1px dashed var(--color-border)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  Para alterar ou cancelar seu plano, entre em contato com o
                  suporte.
                </p>
              </Card>
            </div>
          )}
        </>
      )}
    </section>
  );
}
