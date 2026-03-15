"use client";

import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/page-sections";
import { apiGet } from "@/lib/api";
import type { TaskRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// Friendly translations
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  cobrador_collect: "Cobrança automática",
  cobrador_remind: "Lembrete de pagamento",
  boleto_generate: "Geração de boleto",
  report_generate: "Geração de relatório",
  sync_balance: "Sincronização bancária",
  email_send: "Envio de e-mail",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  DONE: { label: "Concluída", className: "status-done" },
  QUEUED: { label: "Na fila", className: "status-pending" },
  PENDING: { label: "Aguardando", className: "status-pending" },
  RUNNING: { label: "Executando", className: "status-running" },
  ERROR: { label: "Erro", className: "status-failed" },
  FAILED: { label: "Falhou", className: "status-failed" },
  ESCALATED: { label: "Requer atenção", className: "status-escalated" },
};

function friendlyType(type: string) {
  return TYPE_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function friendlyStatus(status: string) {
  return STATUS_LABELS[status.toUpperCase()] || { label: status, className: "status-default" };
}

function taskMessage(task: TaskRecord) {
  const message = task.payload?.message;
  return typeof message === "string" && message.trim()
    ? message
    : null;
}

type StatusFilter = "ALL" | "DONE" | "ERROR" | "PENDING";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "DONE", label: "Concluídas" },
  { value: "PENDING", label: "Pendentes" },
  { value: "ERROR", label: "Com erro" },
];

function matchesFilter(task: TaskRecord, filter: StatusFilter) {
  if (filter === "ALL") return true;
  const s = task.status.toUpperCase();
  if (filter === "PENDING") return s === "PENDING" || s === "QUEUED" || s === "RUNNING";
  if (filter === "ERROR") return s === "ERROR" || s === "FAILED" || s === "ESCALATED";
  return s === filter;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const response = await apiGet<TaskRecord[]>("/tasks");
      setTasks(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = [...tasks]
    .reverse()
    .filter((task) => matchesFilter(task, filter));

  const countFor = (f: StatusFilter) => tasks.filter((t) => matchesFilter(t, f)).length;

  return (
    <ProtectedPage
      title="Atividades"
      description="Acompanhe o que a automação executou no seu portfólio."
    >
      {error ? <p className="error-banner">{error}</p> : null}

      <Card title="Histórico de atividades" subtitle="Cobranças, envios e processamentos realizados automaticamente.">
        <div className="section-actions">
          <div className="filter-group">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? "filter-button active" : "filter-button"}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
                {item.value !== "ALL" && (
                  <span className="filter-count">
                    {countFor(item.value)}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button className="ghost-button" type="button" onClick={() => void refresh()}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className="empty-state">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">Nenhuma atividade encontrada.</p>
        ) : (
          <div className="list">
            {filtered.map((task) => {
              const st = friendlyStatus(task.status);
              const msg = taskMessage(task);
              return (
                <article key={task.id} className="task-card">
                  <div className="task-header">
                    <div>
                      <strong>{friendlyType(task.type)}</strong>
                      {msg && <p className="task-message">{msg}</p>}
                    </div>
                    <span className={`status-pill ${st.className}`}>{st.label}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </ProtectedPage>
  );
}
