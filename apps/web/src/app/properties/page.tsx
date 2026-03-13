"use client";

import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card, PageGrid } from "@/components/page-sections";
import { apiGet, apiPost } from "@/lib/api";
import type { Owner, Property } from "@/lib/types";

export default function PropertiesPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const [ownersResponse, propertiesResponse] = await Promise.all([
        apiGet<Owner[]>("/owners"),
        apiGet<Property[]>("/properties"),
      ]);
      setOwners(ownersResponse);
      setProperties(propertiesResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar imóveis.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createOwner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData(event.currentTarget);
      await apiPost<Owner>("/owners", Object.fromEntries(formData));
      event.currentTarget.reset();
      setSuccess("Proprietário criado.");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao criar proprietário.");
    }
  }

  async function createProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData(event.currentTarget);
      await apiPost<Property>("/properties", Object.fromEntries(formData));
      event.currentTarget.reset();
      setSuccess("Imóvel criado.");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao criar imóvel.");
    }
  }

  return (
    <ProtectedPage
      title="Imóveis"
      description="Cadastre o proprietário e o imóvel. Esse é o primeiro passo obrigatório da demo."
    >
      {error ? <p className="error-banner">{error}</p> : null}
      {success ? <p className="success-banner">{success}</p> : null}

      <PageGrid>
        <Card title="Novo proprietário">
          <form className="stack" onSubmit={createOwner}>
            <label>
              Nome
              <input name="name" placeholder="Ex.: Maria Souza" required />
            </label>
            <label>
              Documento
              <input name="document" placeholder="CPF ou CNPJ" required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" placeholder="maria@exemplo.com" required />
            </label>
            <label>
              Telefone
              <input name="phone" placeholder="(11) 99999-9999" required />
            </label>
            <button className="primary-button" type="submit">
              Criar proprietário
            </button>
          </form>
        </Card>

        <Card title="Novo imóvel" subtitle="Ação obrigatória: Novo imóvel">
          <form className="stack" onSubmit={createProperty}>
            <label>
              Endereço
              <input name="address" placeholder="Rua Demo, 100" required />
            </label>
            <div className="split-fields">
              <label>
                Cidade
                <input name="city" placeholder="São Paulo" required />
              </label>
              <label>
                Estado
                <input name="state" placeholder="SP" required />
              </label>
            </div>
            <div className="split-fields">
              <label>
                CEP
                <input name="zip" placeholder="01000-000" required />
              </label>
              <label>
                Inscrição IPTU
                <input name="iptu_registration_number" placeholder="IPTU-100" />
              </label>
            </div>
            <label>
              Proprietário
              <select name="owner_id" required defaultValue="">
                <option value="" disabled>
                  Selecione um proprietário
                </option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={owners.length === 0}>
              Novo imóvel
            </button>
          </form>
          {owners.length === 0 ? (
            <p className="empty-state">Crie um proprietário antes de cadastrar o imóvel.</p>
          ) : null}
        </Card>
      </PageGrid>

      <Card title="Carteira de imóveis">
        {loading ? (
          <p className="empty-state">Carregando imóveis...</p>
        ) : properties.length === 0 ? (
          <p className="empty-state">Nenhum imóvel cadastrado ainda.</p>
        ) : (
          <div className="list">
            {properties.map((property) => {
              const owner = owners.find((item) => item.id === property.owner_id);
              return (
                <article key={property.id} className="list-row blocky">
                  <div>
                    <strong>{property.address}</strong>
                    <p>
                      {property.city}/{property.state} · {property.zip}
                    </p>
                    <p>Proprietário: {owner?.name ?? property.owner_id}</p>
                  </div>
                  <div className="detail-stack">
                    <span className="status-pill status-done">ATIVO</span>
                    <span>IPTU: {property.iptu_registration_number ?? "Não informado"}</span>
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
