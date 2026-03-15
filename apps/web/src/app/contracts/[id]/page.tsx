"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { authFetch } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Contract, Property, Renter, TaskRecord } from "@/lib/types";

type ContractWithStatus = Contract & { status?: string };

function statusBadgeVariant(status: string): "success" | "warning" | "danger" | "default" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "warning";
  if (status === "TERMINATED") return "danger";
  return "default";
}

function taskStatusBadgeVariant(
  status: string,
): "success" | "warning" | "danger" | "info" | "default" {
  const s = status.toLowerCase();
  if (s === "done" || s === "completed") return "success";
  if (s === "running" || s === "in_progress") return "info";
  if (s === "failed" || s === "cancelled") return "danger";
  if (s === "pending" || s === "queued") return "warning";
  return "default";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export default function ContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [contract, setContract] = useState<ContractWithStatus | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [renter, setRenter] = useState<Renter | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setLoadError(null);

      const contractData = await apiGet<ContractWithStatus>(`/contracts/${id}`);
      setContract(contractData);

      const [propertyData, renterData, tasksData] = await Promise.all([
        apiGet<Property>(`/properties/${contractData.property_id}`),
        apiGet<Renter>(`/renters/${contractData.renter_id}`),
        apiGet<{ items: TaskRecord[] } | TaskRecord[]>(
          `/tasks?per_page=20`,
        ),
      ]);

      setProperty(propertyData);
      setRenter(renterData);

      const allTasks = Array.isArray(tasksData)
        ? tasksData
        : (tasksData as { items: TaskRecord[] }).items ?? [];

      setTasks(
        allTasks.filter(
          (t) =>
            (t.payload as Record<string, unknown>)?.contract_id === id,
        ),
      );
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Falha ao carregar contrato.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStatusChange(newStatus: "SUSPENDED" | "TERMINATED" | "ACTIVE") {
    try {
      setActionLoading(newStatus);
      setActionError(null);
      const res = await authFetch(`/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Falha ao atualizar status (${res.status})`);
      }
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Falha ao atualizar status.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  const status = contract?.status ?? "ACTIVE";

  return (
    <ProtectedPage
      title="Detalhes do Contrato"
      description="Visualize e gerencie o contrato de locação."
    >
      <div style={{ marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={() => router.push("/contracts")}>
          &larr; Voltar para Contratos
        </Button>
      </div>

      {loadError && <p className="error-banner">{loadError}</p>}
      {actionError && <p className="error-banner">{actionError}</p>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
          <Spinner size={36} />
        </div>
      ) : contract ? (
        <div style={{ display: "grid", gap: 24 }}>
          {/* Info card */}
          <Card
            title="Informações do Contrato"
            actions={
              <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "16px 24px",
              }}
            >
              <InfoField
                label="Imóvel"
                value={
                  property
                    ? `${property.address}${property.city ? `, ${property.city}` : ""}`
                    : contract.property_id
                }
              />
              <InfoField
                label="Inquilino"
                value={renter ? renter.name : contract.renter_id}
              />
              <InfoField label="Início" value={contract.start_date} />
              <InfoField label="Fim" value={contract.end_date} />
              <InfoField label="Aluguel mensal" value={`R$ ${contract.monthly_rent}`} />
              <InfoField label="Dia do vencimento" value={`Dia ${contract.due_day}`} />
            </div>

            {/* Status workflow buttons */}
            {status !== "TERMINATED" && (
              <div
                style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(99,102,241,0.1)",
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {status === "ACTIVE" && (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={actionLoading === "SUSPENDED"}
                      disabled={actionLoading !== null}
                      onClick={() => handleStatusChange("SUSPENDED")}
                    >
                      Suspender
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={actionLoading === "TERMINATED"}
                      disabled={actionLoading !== null}
                      onClick={() => handleStatusChange("TERMINATED")}
                    >
                      Encerrar
                    </Button>
                  </>
                )}
                {status === "SUSPENDED" && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={actionLoading === "ACTIVE"}
                      disabled={actionLoading !== null}
                      onClick={() => handleStatusChange("ACTIVE")}
                    >
                      Reativar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={actionLoading === "TERMINATED"}
                      disabled={actionLoading !== null}
                      onClick={() => handleStatusChange("TERMINATED")}
                    >
                      Encerrar
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>

          {/* Task history */}
          <Card title="Histórico de Tarefas">
            {tasks.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "rgba(31,41,55,0.45)",
                  fontStyle: "italic",
                }}
              >
                Nenhuma tarefa encontrada para este contrato.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(99,102,241,0.04)",
                      border: "1px solid rgba(99,102,241,0.09)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontWeight: 500,
                        fontSize: "0.9rem",
                        minWidth: 140,
                      }}
                    >
                      {task.type}
                    </span>
                    <Badge variant={taskStatusBadgeVariant(task.status)}>
                      {task.status}
                    </Badge>
                    {(task.payload as Record<string, unknown>)?.created_at ? (
                      <span
                        style={{
                          fontSize: "0.82rem",
                          color: "rgba(31,41,55,0.5)",
                        }}
                      >
                        {formatDate(
                          String(
                            (task.payload as Record<string, unknown>).created_at,
                          ),
                        )}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </ProtectedPage>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span
        style={{
          fontSize: "0.78rem",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "rgba(31,41,55,0.45)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "0.95rem", color: "rgba(31,41,55,0.85)" }}>
        {value}
      </span>
    </div>
  );
}
