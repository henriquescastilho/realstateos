"use client";

import { useCallback, useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Modal } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/Icon";
import { apiGet, apiPost } from "@/lib/api";
import type { AgentRegistryEntry, OrchestratorEvent, TaskRecord } from "@/lib/types";
import { PagadorBillsSection } from "./PagadorBillsSection";

const POLL_INTERVAL_MS = 15_000;

/** Orchestrator event → agent mapping (mirrors backend EVENT_HANDLERS) */
const EVENT_AGENT_MAP: Record<string, string> = {
  "expense.captured": "Maestro",
  "charges.composed": "Cobrador",
  "payment.received": "Sentinela",
  "payout.completed": "Contador",
  "payout.bills_paid": "(fim do fluxo)",
  "statement.ready": "(fim do fluxo)",
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

interface SimStep {
  agent: string;
  status: string;
  confidence?: number;
  summary: string;
  durationMs: number;
}

interface SimResult {
  contractId: string;
  billingPeriod: string;
  steps: SimStep[];
  report: string;
  emailSent: boolean;
  totalDurationMs: number;
}

interface ContractOption {
  id: string;
  ownerName: string;
  tenantName: string;
  address: string;
  rentAmount: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRegistryEntry[]>([]);
  const [events, setEvents] = useState<OrchestratorEvent[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentRegistryEntry | null>(null);

  // Simulation state
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [simContractId, setSimContractId] = useState("");
  const [simEmail, setSimEmail] = useState("henrique009.hsc@gmail.com");
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simCurrentStep, setSimCurrentStep] = useState("");

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [agentsData, eventsData, tasksData] = await Promise.all([
        apiGet<AgentRegistryEntry[]>("/agents/registry"),
        apiGet<OrchestratorEvent[]>("/agents/orchestrator/events"),
        apiGet<TaskRecord[]>("/agent-tasks?limit=50"),
      ]);
      setAgents(agentsData);
      setEvents(eventsData);
      setTasks(tasksData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Load contracts for simulation picker
  useEffect(() => {
    apiGet<ContractOption[]>("/agents/simulation/contracts")
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setContracts(list);
        if (list.length > 0 && !simContractId) setSimContractId(list[0].id);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSimulation = useCallback(async () => {
    if (!simContractId || simRunning) return;
    setSimRunning(true);
    setSimResult(null);
    setSimCurrentStep("Iniciando simulação...");
    try {
      const result = await apiPost<SimResult>("/agents/simulate", {
        contractId: simContractId,
        email: simEmail,
      });
      setSimResult(result);
      setSimCurrentStep("");
    } catch (err) {
      setSimCurrentStep(`Erro: ${err instanceof Error ? err.message : "falha"}`);
    } finally {
      setSimRunning(false);
    }
  }, [simContractId, simEmail, simRunning]);

  const agentTasks = selectedAgent
    ? tasks.filter((t) => t.type === selectedAgent.taskType).slice(0, 10)
    : [];

  return (
    <ProtectedPage
      title="Agentes de IA"
      description="Painel de monitoramento dos agentes autônomos. Clique em um agente para ver detalhes."
    >
      {error && <p className="error-banner">{error}</p>}

      {loading ? (
        <p className="empty-state">Carregando agentes...</p>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => (
            <article
              key={agent.id}
              className="card agent-card"
              onClick={() => setSelectedAgent(agent)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Icon name={agent.icon as IconName} size={28} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>{agent.name}</strong>
                    <span className={agent.currentStatus === "active" ? "alive-dot" : "idle-dot"} />
                  </div>
                  <p className="muted-text" style={{ margin: 0 }}>
                    {agent.schedule ?? "Sob demanda (evento)"}
                  </p>
                </div>
              </div>
              <p style={{ margin: "0 0 12px", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                {agent.description}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                <span className="muted-text">
                  {agent.totalTasks} tarefa{agent.totalTasks !== 1 ? "s" : ""}
                </span>
                <span className="muted-text">{formatRelativeTime(agent.lastExecutedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Simulation Panel ── */}
      <div className="card" style={{ marginTop: 32, padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem" }}>Simulação do Pipeline</h3>
        <p className="muted-text" style={{ margin: "0 0 16px" }}>
          Execute o fluxo completo dos agentes para um contrato e receba um relatório por e-mail.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: "block", fontSize: "0.82rem", marginBottom: 4, color: "var(--text-muted)" }}>Contrato</label>
            <select
              value={simContractId}
              onChange={(e) => setSimContractId(e.target.value)}
              disabled={simRunning}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 10,
                border: "1px solid var(--line)", background: "var(--card)",
                fontSize: "0.88rem",
              }}
            >
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ownerName} → {c.tenantName} | {c.address} | R$ {c.rentAmount}
                </option>
              ))}
              {contracts.length === 0 && <option value="">Carregando contratos...</option>}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <label style={{ display: "block", fontSize: "0.82rem", marginBottom: 4, color: "var(--text-muted)" }}>E-mail do relatório</label>
            <input
              type="email"
              value={simEmail}
              onChange={(e) => setSimEmail(e.target.value)}
              disabled={simRunning}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 10,
                border: "1px solid var(--line)", background: "var(--card)",
                fontSize: "0.88rem",
              }}
            />
          </div>
          <button
            onClick={() => void runSimulation()}
            disabled={simRunning || !simContractId}
            className="btn-primary"
            style={{ padding: "8px 24px", borderRadius: 10, whiteSpace: "nowrap" }}
          >
            {simRunning ? "Executando..." : "Simular Fluxo"}
          </button>
        </div>

        {simRunning && simCurrentStep && (
          <p style={{ fontSize: "0.88rem", color: "var(--accent)" }}>{simCurrentStep}</p>
        )}

        {simResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <span className="status-pill status-done">
                {simResult.steps.length} etapas
              </span>
              <span className="muted-text" style={{ alignSelf: "center" }}>
                {(simResult.totalDurationMs / 1000).toFixed(1)}s total
              </span>
              {simResult.emailSent && (
                <span className="status-pill status-running">E-mail enviado</span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {simResult.steps.map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 12,
                    border: "1px solid var(--line)", background: "var(--card)",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: step.status === "completed" ? "var(--color-success)"
                      : step.status === "failed" ? "var(--color-danger)"
                      : "var(--color-warning)",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: "0.88rem" }}>{step.agent}</strong>
                    <p className="muted-text" style={{ margin: 0, fontSize: "0.8rem" }}>{step.summary}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {step.confidence !== undefined && (
                      <span style={{ fontSize: "0.78rem", color: "var(--accent)" }}>
                        {(step.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    <p className="muted-text" style={{ margin: 0, fontSize: "0.75rem" }}>
                      {step.durationMs}ms
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {simResult.report && (
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: "pointer", fontSize: "0.92rem", fontWeight: 600 }}>
                  Ver Relatório Completo (Gemini)
                </summary>
                <div
                  style={{
                    marginTop: 12, padding: 16, borderRadius: 12,
                    background: "var(--card)", border: "1px solid var(--line)",
                    fontSize: "0.85rem", lineHeight: 1.6, whiteSpace: "pre-wrap",
                  }}
                >
                  {simResult.report}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Agent detail modal */}
      <Modal
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
        title={selectedAgent?.name}
        description={selectedAgent?.description}
        maxWidth={680}
      >
        {selectedAgent && (
          <div>
            {/* Status + schedule */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <span
                className={`status-pill ${selectedAgent.currentStatus === "active" ? "status-running" : "status-done"}`}
              >
                {selectedAgent.currentStatus === "active" ? "Ativo" : "Idle"}
              </span>
              <span className="muted-text" style={{ alignSelf: "center" }}>
                {selectedAgent.schedule
                  ? `Schedule: ${selectedAgent.schedule}`
                  : "Sob demanda (evento)"}
              </span>
            </div>

            {/* Orchestrator-specific: event mapping */}
            {selectedAgent.id === "orquestrador" && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>Mapeamento de Eventos</h4>
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th>Dispara</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(EVENT_AGENT_MAP).map(([event, target]) => (
                      <tr key={event}>
                        <td>
                          <code style={{ fontSize: "0.82rem" }}>{event}</code>
                        </td>
                        <td>{target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 style={{ margin: "20px 0 12px", fontSize: "0.95rem" }}>Eventos Recentes</h4>
                {events.length === 0 ? (
                  <p className="empty-state">Nenhum evento registrado.</p>
                ) : (
                  <div className="list">
                    {events.slice(0, 10).map((evt) => (
                      <div key={evt.id} className="list-row" style={{ fontSize: "0.88rem" }}>
                        <div>
                          <code style={{ fontSize: "0.82rem" }}>{evt.eventType}</code>
                          <p className="muted-text">{new Date(evt.createdAt).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pagador-specific: bill payment section */}
            {selectedAgent.id === "pagador" && <PagadorBillsSection />}

            {/* Recent tasks for this agent */}
            <h4 style={{ margin: "20px 0 12px", fontSize: "0.95rem" }}>Histórico Recente</h4>
            {agentTasks.length === 0 ? (
              <p className="empty-state">Nenhuma tarefa registrada para este agente.</p>
            ) : (
              <div className="list">
                {agentTasks.map((task) => (
                  <div key={task.id} className="task-card" style={{ padding: "12px 0" }}>
                    <div className="task-header">
                      <div>
                        <strong style={{ fontSize: "0.88rem" }}>{task.type}</strong>
                        <p className="muted-text">{task.id.slice(0, 8)}...</p>
                      </div>
                      <span className={`status-pill status-${task.status.toLowerCase()}`}>
                        {task.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </ProtectedPage>
  );
}
