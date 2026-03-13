"use client";

import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card, PageGrid } from "@/components/page-sections";
import { apiGet, apiPost } from "@/lib/api";
import type { Contract, Property, Renter } from "@/lib/types";

export default function ContractsPage() {
  const [renters, setRenters] = useState<Renter[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const [rentersResponse, propertiesResponse, contractsResponse] = await Promise.all([
        apiGet<Renter[]>("/renters"),
        apiGet<Property[]>("/properties"),
        apiGet<Contract[]>("/contracts"),
      ]);
      setRenters(rentersResponse);
      setProperties(propertiesResponse);
      setContracts(contractsResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar contratos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createRenter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData(event.currentTarget);
      await apiPost<Renter>("/renters", Object.fromEntries(formData));
      event.currentTarget.reset();
      setSuccess("Inquilino criado.");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao criar inquilino.");
    }
  }

  async function createContract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData(event.currentTarget);
      await apiPost<Contract>("/contracts", Object.fromEntries(formData));
      event.currentTarget.reset();
      setSuccess("Contrato criado.");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao criar contrato.");
    }
  }

  return (
    <ProtectedPage
      title="Contratos"
      description="Cadastre o inquilino e vincule um contrato ativo ao imóvel."
    >
      {error ? <p className="error-banner">{error}</p> : null}
      {success ? <p className="success-banner">{success}</p> : null}

      <PageGrid>
        <Card title="Novo inquilino">
          <form className="stack" onSubmit={createRenter}>
            <label>
              Nome
              <input name="name" placeholder="Ex.: João Lima" required />
            </label>
            <label>
              Documento
              <input name="document" placeholder="CPF" required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" placeholder="joao@exemplo.com" required />
            </label>
            <label>
              Telefone
              <input name="phone" placeholder="(11) 98888-7777" required />
            </label>
            <button className="primary-button" type="submit">
              Criar inquilino
            </button>
          </form>
        </Card>

        <Card title="Novo contrato" subtitle="Ação obrigatória: Novo contrato">
          <form className="stack" onSubmit={createContract}>
            <label>
              Imóvel
              <select name="property_id" required defaultValue="">
                <option value="" disabled>
                  Selecione um imóvel
                </option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.address}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Inquilino
              <select name="renter_id" required defaultValue="">
                <option value="" disabled>
                  Selecione um inquilino
                </option>
                {renters.map((renter) => (
                  <option key={renter.id} value={renter.id}>
                    {renter.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="split-fields">
              <label>
                Início
                <input name="start_date" type="date" required />
              </label>
              <label>
                Fim
                <input name="end_date" type="date" required />
              </label>
            </div>
            <div className="split-fields">
              <label>
                Aluguel mensal
                <input
                  name="monthly_rent"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="2000.00"
                  required
                />
              </label>
              <label>
                Dia do vencimento
                <input name="due_day" type="number" min="1" max="31" placeholder="1" required />
              </label>
            </div>
            <button
              className="primary-button"
              type="submit"
              disabled={properties.length === 0 || renters.length === 0}
            >
              Novo contrato
            </button>
          </form>
          {properties.length === 0 || renters.length === 0 ? (
            <p className="empty-state">Cadastre um imóvel e um inquilino antes de criar o contrato.</p>
          ) : null}
        </Card>
      </PageGrid>

      <Card title="Contratos cadastrados">
        {loading ? (
          <p className="empty-state">Carregando contratos...</p>
        ) : contracts.length === 0 ? (
          <p className="empty-state">Nenhum contrato cadastrado ainda.</p>
        ) : (
          <div className="list">
            {contracts.map((contract) => {
              const property = properties.find((item) => item.id === contract.property_id);
              const renter = renters.find((item) => item.id === contract.renter_id);
              return (
                <article key={contract.id} className="list-row blocky">
                  <div>
                    <strong>{property?.address ?? contract.property_id}</strong>
                    <p>Inquilino: {renter?.name ?? contract.renter_id}</p>
                    <p>
                      {contract.start_date} até {contract.end_date}
                    </p>
                  </div>
                  <div className="detail-stack">
                    <span className="status-pill status-done">ATIVO</span>
                    <span>R$ {contract.monthly_rent}</span>
                    <span>Vence dia {contract.due_day}</span>
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
