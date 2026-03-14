"use client";

import { useCallback, useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/page-sections";
import { apiGet, apiPost } from "@/lib/api";
import type { TaskRecord } from "@/lib/types";

const POLL_INTERVAL_MS = 10_000;

type AgentMetrics = {
  overall: {
    total_tasks: number;
    automation_rate_pct: number;
    escalation_rate_pct: number;
  };
  by_task_type: Record<
    string,
    {
      total: number;
      done: number;
      escalated: number;
      failed: number;
      automation_rate_pct: number;
      escalation_rate_pct: number;
    }
  >;
};

type StatusFilter =
  | "ALL"
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "ESCALATED";

const FILTERS: { value: StatusFilter; label: string; color: string }[] = [
  { value: "ALL", label: "Todos", color: "" },
  { value: "RUNNING", label: "Em execução", color: "blue" },
  { value: "PENDING", label: "Pendente", color: "yellow" },
  { value: "DONE", label: "Concluído", color: "green" },
  { value: "ESCALATED", label: "Escalados", color: "orange" },
  { value: "FAILED", label: "Falhou", color: "red" },
];

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill status-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}

function MetricCard({
  label,
  value,
  unit = "",
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="metric-card">
      <p className="muted-text">{label}</p>
      <strong>
        {value}
        {unit}
      </strong>
    </div>
  );
}

export default function AgentsPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [tasksData, metricsData] = await Promise.all([
        apiGet<TaskRecord[]>("/agent-tasks?limit=100"),
        apiGet<AgentMetrics>("/analytics/agents").catch(() => null),
      ]);
      setTasks(tasksData);
      setMetrics(metricsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling every 10s
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const filtered = tasks.filter(
    (t) => filter === "ALL" || t.status.toUpperCase() === filter,
  );

  const counts: Record<string, number> = {};
  for (const t of tasks) {
    counts[t.status.toUpperCase()] = (counts[t.status.toUpperCase()] ?? 0) + 1;
  }

  return (
    <ProtectedPage
      title="Atividade dos Agentes"
      description="Monitoramento em tempo real das tarefas executadas pelos agentes de IA. Atualizado a cada 10 segundos."
    >
      {error ? <p className="error-banner">{error}</p> : null}

      {/* Metrics summary */}
      {metrics && (
        <Card
          title="Performance dos Agentes"
          subtitle="Métricas do período atual"
        >
          <div className="metrics-grid">
            <MetricCard
              label="Total de tarefas"
              value={metrics.overall.total_tasks}
            />
            <MetricCard
              label="Taxa de automação"
              value={metrics.overall.automation_rate_pct}
              unit="%"
            />
            <MetricCard
              label="Taxa de escalação"
              value={metrics.overall.escalation_rate_pct}
              unit="%"
            />
            <MetricCard label="Em execução" value={counts["RUNNING"] ?? 0} />
            <MetricCard label="Escalados" value={counts["ESCALATED"] ?? 0} />
            <MetricCard label="Com falha" value={counts["FAILED"] ?? 0} />
          </div>
        </Card>
      )}

      {/* Task list */}
      <Card title="Tarefas dos Agentes" subtitle="Histórico de execução">
        <div className="section-actions">
          <div className="filter-group">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={
                  filter === f.value ? "filter-button active" : "filter-button"
                }
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                {f.value !== "ALL" && (
                  <span className="filter-count">{counts[f.value] ?? 0}</span>
                )}
              </button>
            ))}
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void refresh()}
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className="empty-state">Carregando tarefas...</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">Nenhuma tarefa para este filtro.</p>
        ) : (
          <div className="list">
            {filtered.map((task) => (
              <article key={task.id} className="task-card">
                <div className="task-header">
                  <div>
                    <strong>{task.type}</strong>
                    <p className="muted-text">{task.id}</p>
                  </div>
                  <StatusPill status={task.status} />
                </div>
                <p className="task-message">
                  {typeof task.payload.message === "string"
                    ? task.payload.message
                    : "Sem mensagem"}
                </p>
                {task.payload.error ? (
                  <p className="error-text">
                    Erro: {String(task.payload.error)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </ProtectedPage>
  );
}
