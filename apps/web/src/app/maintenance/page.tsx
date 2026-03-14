"use client";

import { useCallback, useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/page-sections";
import { apiGet, apiPost } from "@/lib/api";
import type { TaskRecord } from "@/lib/types";

type MaintenanceStatus =
  | "ALL"
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "ESCALATED"
  | "FAILED";

const STATUS_OPTIONS: { value: MaintenanceStatus; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "PENDING", label: "Pendente" },
  { value: "RUNNING", label: "Em andamento" },
  { value: "ESCALATED", label: "Escalado" },
  { value: "DONE", label: "Concluído" },
  { value: "FAILED", label: "Falhou" },
];

type CreateTicketForm = {
  description: string;
  property_id: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const colorMap: Record<string, string> = {
    CRITICAL: "red",
    HIGH: "orange",
    MEDIUM: "yellow",
    LOW: "green",
  };
  const color = colorMap[priority.toUpperCase()] ?? "gray";
  return <span className={`status-pill status-${color}`}>{priority}</span>;
}

function TicketCard({ task }: { task: TaskRecord }) {
  const [open, setOpen] = useState(false);
  const msg =
    typeof task.payload.message === "string" ? task.payload.message : "";
  const priority =
    typeof task.payload.priority === "string" ? task.payload.priority : null;

  return (
    <article className="task-card">
      <div className="task-header">
        <div>
          <strong>{task.type.replace("MAINTENANCE_", "")}</strong>
          <p className="muted-text">{task.id}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {priority && <PriorityBadge priority={priority} />}
          <span className={`status-pill status-${task.status.toLowerCase()}`}>
            {task.status}
          </span>
        </div>
      </div>

      <p className="task-message">{msg}</p>

      <button
        type="button"
        className="ghost-button"
        style={{ marginTop: "0.5rem" }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Ocultar detalhes" : "Ver detalhes"}
      </button>

      {open && (
        <pre className="mini-json">{JSON.stringify(task.payload, null, 2)}</pre>
      )}
    </article>
  );
}

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<TaskRecord[]>([]);
  const [filter, setFilter] = useState<MaintenanceStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateTicketForm>({
    description: "",
    property_id: "",
    priority: "MEDIUM",
  });

  const refresh = useCallback(async () => {
    try {
      setError(null);
      // Fetch agent tasks related to maintenance
      const data = await apiGet<TaskRecord[]>("/agent-tasks?limit=200");
      const maintenance = data.filter(
        (t) =>
          t.type.toUpperCase().includes("MAINTENANCE") ||
          t.type.toUpperCase().includes("TICKET") ||
          t.type.toUpperCase().includes("REPAIR"),
      );
      setTickets(maintenance);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar tickets.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = tickets.filter(
    (t) => filter === "ALL" || t.status.toUpperCase() === filter,
  );

  const counts: Record<string, number> = {};
  for (const t of tickets) {
    counts[t.status.toUpperCase()] = (counts[t.status.toUpperCase()] ?? 0) + 1;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return;
    try {
      setError(null);
      await apiPost("/tasks", {
        type: "MAINTENANCE_TICKET",
        payload: {
          description: form.description,
          property_id: form.property_id || null,
          priority: form.priority,
          message: form.description,
          source: "manual",
        },
      });
      setSuccess("Ticket de manutenção criado com sucesso.");
      setShowForm(false);
      setForm({ description: "", property_id: "", priority: "MEDIUM" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar ticket.");
    }
  };

  return (
    <ProtectedPage
      title="Manutenção"
      description="Gerenciamento de chamados de manutenção. O MaintenanceAgent classifica e prioriza automaticamente."
    >
      {error ? <p className="error-banner">{error}</p> : null}
      {success ? <p className="success-banner">{success}</p> : null}

      <Card
        title="Tickets de Manutenção"
        subtitle="Chamados de reparo e manutenção predial"
      >
        <div className="section-actions">
          <div className="filter-group">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={
                  filter === s.value ? "filter-button active" : "filter-button"
                }
                onClick={() => setFilter(s.value)}
              >
                {s.label}
                {s.value !== "ALL" && (
                  <span className="filter-count">{counts[s.value] ?? 0}</span>
                )}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void refresh()}
            >
              Atualizar
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowForm((v) => !v)}
            >
              + Novo ticket
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="inline-form">
            <h4>Novo Ticket de Manutenção</h4>
            <label htmlFor="description">Descrição do problema *</label>
            <textarea
              id="description"
              className="notes-input"
              rows={3}
              required
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Descreva o problema de manutenção..."
            />
            <label htmlFor="property_id">ID do Imóvel (opcional)</label>
            <input
              id="property_id"
              type="text"
              value={form.property_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, property_id: e.target.value }))
              }
              placeholder="UUID do imóvel"
            />
            <label htmlFor="priority">Prioridade</label>
            <select
              id="priority"
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: e.target.value as CreateTicketForm["priority"],
                }))
              }
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <div className="action-buttons">
              <button type="submit" className="primary-button">
                Criar Ticket
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="empty-state">Carregando tickets...</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">Nenhum ticket de manutenção encontrado.</p>
        ) : (
          <div className="list">
            {filtered.map((ticket) => (
              <TicketCard key={ticket.id} task={ticket} />
            ))}
          </div>
        )}
      </Card>
    </ProtectedPage>
  );
}
