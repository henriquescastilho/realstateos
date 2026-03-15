"use client";

import { useCallback, useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Modal } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/Icon";
import { apiGet } from "@/lib/api";
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

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRegistryEntry[]>([]);
  const [events, setEvents] = useState<OrchestratorEvent[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentRegistryEntry | null>(null);

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
