"use client";

import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/page-sections";
import { apiGet } from "@/lib/api";
import type { TaskRecord } from "@/lib/types";

function taskMessage(task: TaskRecord) {
  const message = task.payload.message;
  return typeof message === "string" ? message : "Sem mensagem registrada.";
}

function taskResult(task: TaskRecord) {
  return task.payload.result;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const response = await apiGet<TaskRecord[]>("/tasks");
      setTasks(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <ProtectedPage
      title="Tarefas"
      description="As tarefas do BillingAgent aparecem aqui para dar visibilidade ao que a automação executou."
    >
      {error ? <p className="error-banner">{error}</p> : null}

      <Card title="Log do agente" subtitle="Mensagens obrigatórias do fluxo aparecem com destaque.">
        <div className="section-actions">
          <button className="ghost-button" type="button" onClick={() => void refresh()}>
            Atualizar tarefas
          </button>
        </div>

        {loading ? (
          <p className="empty-state">Carregando tarefas...</p>
        ) : tasks.length === 0 ? (
          <p className="empty-state">Nenhuma tarefa registrada ainda.</p>
        ) : (
          <div className="list">
            {[...tasks].reverse().map((task) => (
              <article key={task.id} className="task-card">
                <div className="task-header">
                  <div>
                    <strong>{task.type}</strong>
                    <p className="muted-text">{task.id}</p>
                  </div>
                  <span className={`status-pill status-${task.status.toLowerCase()}`}>{task.status}</span>
                </div>
                <p className="task-message">{taskMessage(task)}</p>
                {taskResult(task) ? (
                  <pre className="mini-json">{JSON.stringify(taskResult(task), null, 2)}</pre>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </ProtectedPage>
  );
}
