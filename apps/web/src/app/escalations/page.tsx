"use client";

import { useCallback, useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/page-sections";
import { apiGet, apiPost } from "@/lib/api";
import type { TaskRecord } from "@/lib/types";

type ResolveAction = "approved" | "rejected" | "retry";

function EscalationCard({
  task,
  onAction,
}: {
  task: TaskRecord;
  onAction: (
    id: string,
    action: ResolveAction,
    notes?: string,
  ) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (action: ResolveAction) => {
    setBusy(true);
    try {
      await onAction(task.id, action, notes);
    } finally {
      setBusy(false);
    }
  };

  const message =
    typeof task.payload.message === "string"
      ? task.payload.message
      : "Sem contexto disponível.";
  const dlqReason =
    typeof task.payload.dlq_reason === "string"
      ? task.payload.dlq_reason
      : null;
  const originalTaskId =
    typeof task.payload.original_task_id === "string"
      ? task.payload.original_task_id
      : null;

  return (
    <article className="task-card escalation-card">
      <div className="task-header">
        <div>
          <strong>{task.type}</strong>
          <p className="muted-text">{task.id}</p>
          {originalTaskId && (
            <p className="muted-text">Tarefa original: {originalTaskId}</p>
          )}
        </div>
        <span className="status-pill status-escalated">ESCALADO</span>
      </div>

      <p className="task-message">{message}</p>

      {dlqReason && (
        <div className="error-box">
          <strong>Motivo da falha:</strong>
          <p>{dlqReason}</p>
        </div>
      )}

      <details className="payload-details">
        <summary>Ver payload completo</summary>
        <pre className="mini-json">{JSON.stringify(task.payload, null, 2)}</pre>
      </details>

      <div className="action-section">
        <label htmlFor={`notes-${task.id}`} className="muted-text">
          Observações (opcional):
        </label>
        <textarea
          id={`notes-${task.id}`}
          className="notes-input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Adicione contexto ou decisão..."
          disabled={busy}
        />
        <div className="action-buttons">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handle("approved")}
            disabled={busy}
          >
            ✓ Aprovar
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => void handle("rejected")}
            disabled={busy}
          >
            ✗ Rejeitar
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void handle("retry")}
            disabled={busy}
          >
            ↻ Retentar
          </button>
        </div>
      </div>
    </article>
  );
}

export default function EscalationsPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<TaskRecord[]>(
        "/agent-tasks?status=ESCALATED&limit=100",
      );
      setTasks(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar escalações.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAction = async (
    taskId: string,
    action: ResolveAction,
    notes?: string,
  ) => {
    try {
      setActionResult(null);
      if (action === "retry") {
        await apiPost(`/agent-tasks/${taskId}/retry`);
        setActionResult(`Tarefa ${taskId} marcada para retentar.`);
      } else {
        await apiPost(`/agent-tasks/${taskId}/resolve`, {
          resolution: action,
          notes: notes ?? "",
        });
        setActionResult(
          `Tarefa ${taskId} ${action === "approved" ? "aprovada" : "rejeitada"}.`,
        );
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar ação.");
    }
  };

  return (
    <ProtectedPage
      title="Caixa de Escalações"
      description="Tarefas que os agentes não conseguiram resolver automaticamente e precisam de revisão humana."
    >
      {error ? <p className="error-banner">{error}</p> : null}
      {actionResult ? <p className="success-banner">{actionResult}</p> : null}

      <Card
        title={`Escalações Pendentes (${tasks.length})`}
        subtitle="Revise cada caso e tome uma decisão: aprovar, rejeitar ou retentar."
      >
        <div className="section-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => void refresh()}
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className="empty-state">Carregando escalações...</p>
        ) : tasks.length === 0 ? (
          <p className="empty-state">
            Nenhuma escalação pendente. Os agentes estão funcionando bem!
          </p>
        ) : (
          <div className="list">
            {tasks.map((task) => (
              <EscalationCard
                key={task.id}
                task={task}
                onAction={handleAction}
              />
            ))}
          </div>
        )}
      </Card>
    </ProtectedPage>
  );
}
