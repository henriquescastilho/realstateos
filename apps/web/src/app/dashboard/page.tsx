"use client";

import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card, PageGrid } from "@/components/page-sections";
import { apiGet } from "@/lib/api";
import type { Charge, Contract, DocumentRecord, Property, TaskRecord } from "@/lib/types";

type DashboardData = {
  properties: Property[];
  contracts: Contract[];
  charges: Charge[];
  documents: DocumentRecord[];
  tasks: TaskRecord[];
};

function taskMessage(task: TaskRecord) {
  const message = task.payload.message;
  return typeof message === "string" ? message : "Sem mensagem registrada.";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    properties: [],
    contracts: [],
    charges: [],
    documents: [],
    tasks: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [properties, contracts, charges, documents, tasks] = await Promise.all([
          apiGet<Property[]>("/properties"),
          apiGet<Contract[]>("/contracts"),
          apiGet<Charge[]>("/charges"),
          apiGet<DocumentRecord[]>("/documents"),
          apiGet<TaskRecord[]>("/tasks"),
        ]);
        setData({ properties, contracts, charges, documents, tasks });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar dashboard.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const consolidatedCharge = data.charges.find((charge) => charge.type === "CONSOLIDATED");
  const paymentTask = [...data.tasks]
    .reverse()
    .find((task) => task.type === "GENERATE_PAYMENT" && task.status === "DONE");

  return (
    <ProtectedPage
      title="Dashboard"
      description="Resumo do caminho feliz da demo para mostrar que o contrato está sob controle."
    >
      {error ? <p className="error-banner">{error}</p> : null}

      <PageGrid>
        <Card title="Imóveis cadastrados">
          <p className="metric-value">{loading ? "..." : data.properties.length}</p>
          <p className="metric-copy">Mostra que o imóvel já existe na carteira.</p>
        </Card>
        <Card title="Contratos ativos">
          <p className="metric-value">{loading ? "..." : data.contracts.length}</p>
          <p className="metric-copy">Confirma o contrato vinculado ao imóvel.</p>
        </Card>
        <Card title="Cobranças do mês">
          <p className="metric-value">{loading ? "..." : data.charges.length}</p>
          <p className="metric-copy">Inclui aluguel, IPTU, condomínio e consolidado.</p>
        </Card>
        <Card title="Documentos enviados">
          <p className="metric-value">{loading ? "..." : data.documents.length}</p>
          <p className="metric-copy">Uploads manuais para IPTU e condomínio.</p>
        </Card>
      </PageGrid>

      <PageGrid>
        <Card title="Checklist da demo">
          <div className="checklist">
            <div className={data.properties.length > 0 ? "check-item is-done" : "check-item"}>
              1. Imóvel existe
            </div>
            <div className={data.contracts.length > 0 ? "check-item is-done" : "check-item"}>
              2. Contrato existe
            </div>
            <div
              className={
                data.charges.some((charge) => charge.type === "RENT") ? "check-item is-done" : "check-item"
              }
            >
              3. Cobrança mensal existe
            </div>
            <div
              className={
                data.documents.some((document) => document.type === "IPTU") &&
                data.documents.some((document) => document.type === "CONDO")
                  ? "check-item is-done"
                  : "check-item"
              }
            >
              4. Uploads de IPTU e condomínio existem
            </div>
            <div className={consolidatedCharge ? "check-item is-done" : "check-item"}>
              5. Cobrança consolidada existe
            </div>
            <div className={paymentTask ? "check-item is-done" : "check-item"}>
              6. Boleto/PIX foi gerado
            </div>
            <div className={data.tasks.length > 0 ? "check-item is-done" : "check-item"}>
              7. Task log existe
            </div>
          </div>
        </Card>

        <Card title="Última tarefa registrada">
          {data.tasks.length === 0 ? (
            <p className="empty-state">Nenhuma task ainda. O fluxo cria tarefas automaticamente.</p>
          ) : (
            <div className="stack">
              <span className={`status-pill status-${data.tasks[data.tasks.length - 1].status.toLowerCase()}`}>
                {data.tasks[data.tasks.length - 1].status}
              </span>
              <strong>{data.tasks[data.tasks.length - 1].type}</strong>
              <p>{taskMessage(data.tasks[data.tasks.length - 1])}</p>
            </div>
          )}
        </Card>
      </PageGrid>
    </ProtectedPage>
  );
}
