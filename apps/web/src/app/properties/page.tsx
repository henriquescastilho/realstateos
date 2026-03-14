"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { Contract, Owner, Property } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  statusVariant,
} from "@/components/ui";
import type { Column } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MaintenanceTicket {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
}

interface PropertyDetail extends Property {
  contracts?: Contract[];
  maintenance?: MaintenanceTicket[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBRL(n: string | number) {
  return Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function buildMapUrl(property: Property): string {
  const q = encodeURIComponent(
    `${property.address}, ${property.city}, ${property.state}, Brasil`,
  );
  // OpenStreetMap embed — no API key required
  return `https://www.openstreetmap.org/export/embed.html?bbox=-180,-90,180,90&layer=mapnik&marker=0,0&query=${q}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PropertiesPage() {
  const [properties, setProperties] = useState<PropertyDetail[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterCity, setFilterCity] = useState("");

  // Detail panel
  const [selected, setSelected] = useState<PropertyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingOwner, setCreatingOwner] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, o] = await Promise.all([
        apiGet<PropertyDetail[]>("/properties"),
        apiGet<Owner[]>("/owners"),
      ]);
      setProperties(p);
      setOwners(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar imóveis.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Unique cities for filter
  const cities = useMemo(() => {
    const set = new Set(properties.map((p) => p.city).filter(Boolean));
    return Array.from(set).sort();
  }, [properties]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return properties.filter((p) => {
      const owner = owners.find((o) => o.id === p.owner_id);
      const matchSearch =
        !q ||
        p.address.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        owner?.name.toLowerCase().includes(q) ||
        (p.iptu_registration_number ?? "").toLowerCase().includes(q);
      const matchOwner = !filterOwner || p.owner_id === filterOwner;
      const matchCity = !filterCity || p.city === filterCity;
      return matchSearch && matchOwner && matchCity;
    });
  }, [properties, owners, search, filterOwner, filterCity]);

  async function openDetail(property: PropertyDetail) {
    setSelected(property);
    setDetailLoading(true);
    try {
      const [contracts, maintenance] = await Promise.all([
        apiGet<Contract[]>(`/contracts?property_id=${property.id}`).catch(
          () => [] as Contract[],
        ),
        apiGet<MaintenanceTicket[]>(
          `/maintenance?property_id=${property.id}`,
        ).catch(() => [] as MaintenanceTicket[]),
      ]);
      setSelected((prev) =>
        prev ? { ...prev, contracts, maintenance } : prev,
      );
    } catch {
      /* keep partial data */
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCreateProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost<Property>("/properties", Object.fromEntries(fd));
      setShowCreate(false);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Falha ao criar imóvel.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateOwner(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreatingOwner(true);
    setCreateError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost<Owner>("/owners", Object.fromEntries(fd));
      setShowAddOwner(false);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Falha ao criar proprietário.",
      );
    } finally {
      setCreatingOwner(false);
    }
  }

  const columns: Column<PropertyDetail>[] = [
    {
      key: "address",
      header: "Endereço",
      render: (row) => (
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>{row.address}</p>
          <p
            className="muted-text"
            style={{ margin: "2px 0 0", fontSize: "0.82rem" }}
          >
            {row.city}/{row.state} · CEP {row.zip}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Proprietário",
      render: (row) => {
        const o = owners.find((x) => x.id === row.owner_id);
        return o?.name ?? "—";
      },
    },
    {
      key: "iptu",
      header: "Inscrição IPTU",
      render: (row) => row.iptu_registration_number ?? "—",
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: () => <Badge variant="paid">ATIVO</Badge>,
    },
  ];

  const ownerOptions = [
    { value: "", label: "Todos proprietários" },
    ...owners.map((o) => ({ value: o.id, label: o.name })),
  ];
  const cityOptions = [
    { value: "", label: "Todas cidades" },
    ...cities.map((c) => ({ value: c, label: c })),
  ];

  return (
    <section className="page">
      <header
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p className="eyebrow">Carteira</p>
          <h2>Imóveis</h2>
          <p>
            Gerencie o portfólio de imóveis, proprietários e histórico
            financeiro.
          </p>
        </div>
        <div className="actions">
          <Button variant="ghost" onClick={() => setShowAddOwner(true)}>
            + Proprietário
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + Novo Imóvel
          </Button>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {/* Filters */}
      <Card>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "2fr 1fr 1fr",
          }}
        >
          <Input
            placeholder="Buscar por endereço, cidade, proprietário, IPTU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            options={ownerOptions}
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
          />
          <Select
            options={cityOptions}
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
          />
        </div>
        <p className="muted-text" style={{ marginTop: 10 }}>
          {filtered.length} imóvel{filtered.length !== 1 ? "is" : ""} encontrado
          {filtered.length !== 1 ? "s" : ""}
        </p>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          rowKey={(row) => (row as unknown as PropertyDetail).id}
          loading={loading}
          emptyText="Nenhum imóvel encontrado."
          onRowClick={(row) => openDetail(row as unknown as PropertyDetail)}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detalhes do Imóvel"
        maxWidth={700}
      >
        {selected && (
          <PropertyDetailPanel
            property={selected}
            owner={owners.find((o) => o.id === selected.owner_id)}
            loading={detailLoading}
          />
        )}
      </Modal>

      {/* Create Property Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Novo Imóvel"
        maxWidth={520}
      >
        <CreatePropertyForm
          owners={owners}
          loading={creating}
          error={createError}
          onSubmit={handleCreateProperty}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {/* Add Owner Modal */}
      <Modal
        open={showAddOwner}
        onClose={() => setShowAddOwner(false)}
        title="Novo Proprietário"
        maxWidth={460}
      >
        <CreateOwnerForm
          loading={creatingOwner}
          error={createError}
          onSubmit={handleCreateOwner}
          onCancel={() => setShowAddOwner(false)}
        />
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function PropertyDetailPanel({
  property,
  owner,
  loading,
}: {
  property: PropertyDetail;
  owner?: Owner;
  loading: boolean;
}) {
  const [tab, setTab] = useState<
    "info" | "map" | "contracts" | "maintenance" | "financial"
  >("info");

  const totalMonthlyRent = (property.contracts ?? []).reduce(
    (sum, c) => sum + Number(c.monthly_rent ?? 0),
    0,
  );

  const activeContracts = (property.contracts ?? []).filter(
    (c) => !c.end_date || new Date(c.end_date) > new Date(),
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Tab bar */}
      <div className="filter-group">
        {(
          [
            ["info", "Informações"],
            ["map", "Mapa"],
            ["contracts", `Contratos (${property.contracts?.length ?? "…"})`],
            [
              "maintenance",
              `Manutenção (${property.maintenance?.length ?? "…"})`,
            ],
            ["financial", "Financeiro"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`filter-button${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {tab === "info" && (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          <DetailField label="Endereço" value={property.address} />
          <DetailField label="Proprietário" value={owner?.name ?? "—"} />
          <DetailField
            label="Cidade"
            value={`${property.city}/${property.state}`}
          />
          <DetailField label="CEP" value={property.zip} />
          <DetailField
            label="Inscrição IPTU"
            value={property.iptu_registration_number ?? "Não informado"}
          />
          <DetailField
            label="Contratos ativos"
            value={String(activeContracts.length)}
          />
        </div>
      )}

      {/* Map tab */}
      {tab === "map" && (
        <div style={{ borderRadius: 16, overflow: "hidden", height: 320 }}>
          <iframe
            title={`Mapa — ${property.address}`}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=-180,-90,180,90&layer=mapnik&query=${encodeURIComponent(
              `${property.address}, ${property.city}, ${property.state}`,
            )}`}
            style={{ width: "100%", height: "100%", border: "none" }}
            loading="lazy"
          />
          <p
            className="muted-text"
            style={{ marginTop: 8, fontSize: "0.78rem" }}
          >
            Mapa via OpenStreetMap ·{" "}
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(
                `${property.address}, ${property.city}, ${property.state}, Brasil`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-link"
            >
              Abrir no mapa
            </a>
          </p>
        </div>
      )}

      {/* Contracts tab */}
      {tab === "contracts" && (
        <div>
          {loading ? (
            <LoadingRow />
          ) : !property.contracts || property.contracts.length === 0 ? (
            <p className="empty-state">
              Nenhum contrato vinculado a este imóvel.
            </p>
          ) : (
            <div className="list">
              {property.contracts.map((c) => (
                <article key={c.id} className="list-row">
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>
                      Inquilino: {c.renter_id.slice(0, 8)}…
                    </p>
                    <p className="muted-text" style={{ margin: "2px 0 0" }}>
                      {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                    </p>
                  </div>
                  <div className="detail-stack">
                    <span style={{ fontWeight: 600 }}>
                      {fmtBRL(c.monthly_rent)}/mês
                    </span>
                    <Badge variant={statusVariant("active")}>ATIVO</Badge>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Maintenance tab */}
      {tab === "maintenance" && (
        <div>
          {loading ? (
            <LoadingRow />
          ) : !property.maintenance || property.maintenance.length === 0 ? (
            <p className="empty-state">
              Nenhum chamado de manutenção registrado.
            </p>
          ) : (
            <div className="list">
              {property.maintenance.map((m) => (
                <article key={m.id} className="list-row">
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{m.title}</p>
                    <p
                      className="muted-text"
                      style={{ margin: "2px 0 0", fontSize: "0.82rem" }}
                    >
                      {fmtDate(m.created_at)}
                    </p>
                  </div>
                  <div className="actions">
                    <Badge variant={statusVariant(m.priority)}>
                      {m.priority.toUpperCase()}
                    </Badge>
                    <Badge variant={statusVariant(m.status)}>
                      {m.status.toUpperCase()}
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Financial tab */}
      {tab === "financial" && (
        <div>
          {loading ? (
            <LoadingRow />
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {/* KPI row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                }}
              >
                <KpiCard
                  label="Receita mensal"
                  value={fmtBRL(totalMonthlyRent)}
                  color="var(--accent)"
                />
                <KpiCard
                  label="Contratos ativos"
                  value={String(activeContracts.length)}
                  color="#166534"
                />
                <KpiCard
                  label="Total contratos"
                  value={String(property.contracts?.length ?? 0)}
                  color="rgba(31,41,55,0.55)"
                />
              </div>

              {/* Rent breakdown per contract */}
              {property.contracts && property.contracts.length > 0 && (
                <div>
                  <p
                    className="muted-text"
                    style={{
                      fontSize: "0.78rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 8,
                    }}
                  >
                    Composição da receita
                  </p>
                  <div className="list">
                    {property.contracts.map((c) => (
                      <div key={c.id} className="list-row">
                        <span
                          className="muted-text"
                          style={{ fontSize: "0.88rem" }}
                        >
                          Inquilino {c.renter_id.slice(0, 8)}…
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {fmtBRL(c.monthly_rent)}
                        </span>
                      </div>
                    ))}
                    <div className="list-row">
                      <strong>Total</strong>
                      <strong>{fmtBRL(totalMonthlyRent)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="muted-text"
        style={{
          margin: "0 0 2px",
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0, fontWeight: 500 }}>{value}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        textAlign: "center",
        background: "rgba(255,255,255,0.5)",
      }}
    >
      <p
        style={{
          margin: "0 0 4px",
          fontSize: "1.5rem",
          fontWeight: 700,
          color,
        }}
      >
        {value}
      </p>
      <p className="muted-text" style={{ margin: 0, fontSize: "0.8rem" }}>
        {label}
      </p>
    </div>
  );
}

function LoadingRow() {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        color: "rgba(31,41,55,0.5)",
        padding: "16px 0",
      }}
    >
      <Spinner size={16} />
      <span style={{ fontSize: "0.88rem" }}>Carregando…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create forms
// ---------------------------------------------------------------------------

function CreatePropertyForm({
  owners,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  owners: Owner[];
  loading: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const ownerOpts = owners.map((o) => ({ value: o.id, label: o.name }));

  return (
    <form onSubmit={onSubmit} className="stack">
      {error && <p className="error-banner">{error}</p>}

      <Input
        label="Endereço"
        name="address"
        placeholder="Rua das Flores, 100"
        required
      />

      <div className="split-fields">
        <Input label="Cidade" name="city" placeholder="São Paulo" required />
        <Input
          label="Estado"
          name="state"
          placeholder="SP"
          maxLength={2}
          required
        />
      </div>

      <div className="split-fields">
        <Input label="CEP" name="zip" placeholder="01000-000" required />
        <Input
          label="Inscrição IPTU"
          name="iptu_registration_number"
          placeholder="IPTU-001"
        />
      </div>

      <Select
        label="Proprietário"
        name="owner_id"
        options={ownerOpts}
        placeholder="Selecione um proprietário"
        required
      />

      <div
        className="actions"
        style={{ justifyContent: "flex-end", marginTop: 8 }}
      >
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={loading}>
          Criar Imóvel
        </Button>
      </div>
    </form>
  );
}

function CreateOwnerForm({
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  loading: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="stack">
      {error && <p className="error-banner">{error}</p>}

      <Input
        label="Nome completo"
        name="name"
        placeholder="Maria Souza"
        required
      />
      <Input
        label="CPF ou CNPJ"
        name="document"
        placeholder="000.000.000-00"
        required
        hint="Somente números ou formato com pontuação"
      />
      <Input
        label="E-mail"
        name="email"
        type="email"
        placeholder="maria@exemplo.com"
        required
      />
      <Input
        label="Telefone"
        name="phone"
        placeholder="(11) 99999-9999"
        required
      />

      <div
        className="actions"
        style={{ justifyContent: "flex-end", marginTop: 8 }}
      >
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={loading}>
          Criar Proprietário
        </Button>
      </div>
    </form>
  );
}
