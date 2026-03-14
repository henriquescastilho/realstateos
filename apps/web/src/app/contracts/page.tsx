"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { Contract, Owner, Property, Renter } from "@/lib/types";
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

interface ContractHistory {
  id: string;
  action: string;
  description: string;
  created_at: string;
  actor?: string;
}

interface ContractDetail extends Contract {
  status?: string;
  owner_id?: string;
  history?: ContractHistory[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function fmtBRL(s: string | number) {
  return Number(s).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "terminated", label: "Encerrado" },
  { value: "pending", label: "Pendente" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractDetail[]>([]);
  const [renters, setRenters] = useState<Renter[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterRenter, setFilterRenter] = useState("");
  const [filterProperty, setFilterProperty] = useState("");

  // Detail panel
  const [selected, setSelected] = useState<ContractDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Status workflow
  const [workflowLoading, setWorkflowLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, r, p, o] = await Promise.all([
        apiGet<ContractDetail[]>("/contracts"),
        apiGet<Renter[]>("/renters"),
        apiGet<Property[]>("/properties"),
        apiGet<Owner[]>("/owners").catch(() => [] as Owner[]),
      ]);
      setContracts(c);
      setRenters(r);
      setProperties(p);
      setOwners(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar contratos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtered list
  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      const renter = renters.find((r) => r.id === c.renter_id);
      const property = properties.find((p) => p.id === c.property_id);
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        renter?.name.toLowerCase().includes(q) ||
        property?.address.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q);
      const matchStatus =
        !filterStatus || (c.status ?? "active") === filterStatus;
      const matchRenter = !filterRenter || c.renter_id === filterRenter;
      const matchProperty = !filterProperty || c.property_id === filterProperty;
      return matchSearch && matchStatus && matchRenter && matchProperty;
    });
  }, [
    contracts,
    renters,
    properties,
    search,
    filterStatus,
    filterRenter,
    filterProperty,
  ]);

  async function openDetail(contract: ContractDetail) {
    setSelected(contract);
    setDetailLoading(true);
    try {
      const detail = await apiGet<ContractDetail>(`/contracts/${contract.id}`);
      setSelected((prev) => (prev ? { ...prev, ...detail } : prev));
    } catch {
      /* keep existing data */
    } finally {
      setDetailLoading(false);
    }
  }

  async function applyWorkflow(
    contractId: string,
    action: "activate" | "suspend" | "terminate",
  ) {
    setWorkflowLoading(action);
    try {
      await apiPost(`/contracts/${contractId}/${action}`, {});
      await load();
      const nextStatus =
        action === "activate"
          ? "active"
          : action === "suspend"
            ? "suspended"
            : "terminated";
      setSelected((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setWorkflowLoading(null);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost<Contract>("/contracts", Object.fromEntries(fd));
      setShowCreate(false);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Falha ao criar contrato.",
      );
    } finally {
      setCreating(false);
    }
  }

  const columns: Column<ContractDetail>[] = [
    {
      key: "property",
      header: "Imóvel",
      render: (row) => {
        const p = properties.find((x) => x.id === row.property_id);
        return (
          <span style={{ fontWeight: 500 }}>
            {p?.address ?? row.property_id.slice(0, 8)}
          </span>
        );
      },
    },
    {
      key: "renter",
      header: "Inquilino",
      render: (row) => {
        const r = renters.find((x) => x.id === row.renter_id);
        return r?.name ?? row.renter_id.slice(0, 8);
      },
    },
    {
      key: "period",
      header: "Período",
      render: (row) => `${fmtDate(row.start_date)} – ${fmtDate(row.end_date)}`,
    },
    {
      key: "monthly_rent",
      header: "Aluguel",
      align: "right",
      render: (row) => fmtBRL(row.monthly_rent),
    },
    {
      key: "due_day",
      header: "Vcto",
      align: "center",
      render: (row) => `Dia ${row.due_day}`,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (row) => {
        const s = row.status ?? "active";
        return <Badge variant={statusVariant(s)}>{s.toUpperCase()}</Badge>;
      },
    },
  ];

  const renterOptions = [
    { value: "", label: "Todos inquilinos" },
    ...renters.map((r) => ({ value: r.id, label: r.name })),
  ];
  const propertyOptions = [
    { value: "", label: "Todos imóveis" },
    ...properties.map((p) => ({ value: p.id, label: p.address })),
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
          <p className="eyebrow">Gestão</p>
          <h2>Contratos</h2>
          <p>Visualize, filtre e gerencie o ciclo de vida dos contratos.</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          + Novo Contrato
        </Button>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {/* Filters */}
      <Card>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
          }}
        >
          <Input
            placeholder="Buscar por imóvel, inquilino, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
          <Select
            options={renterOptions}
            value={filterRenter}
            onChange={(e) => setFilterRenter(e.target.value)}
          />
          <Select
            options={propertyOptions}
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
          />
        </div>
        <p className="muted-text" style={{ marginTop: 10 }}>
          {filtered.length} contrato{filtered.length !== 1 ? "s" : ""}{" "}
          encontrado{filtered.length !== 1 ? "s" : ""}
        </p>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          rowKey={(row) => (row as unknown as ContractDetail).id}
          loading={loading}
          emptyText="Nenhum contrato encontrado."
          onRowClick={(row) => openDetail(row as unknown as ContractDetail)}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detalhes do Contrato"
        maxWidth={640}
      >
        {selected && (
          <ContractDetailPanel
            contract={selected}
            renter={renters.find((r) => r.id === selected.renter_id)}
            property={properties.find((p) => p.id === selected.property_id)}
            owner={owners.find((o) => o.id === selected.owner_id)}
            loading={detailLoading}
            workflowLoading={workflowLoading}
            onWorkflow={(action) => applyWorkflow(selected.id, action)}
          />
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Novo Contrato"
        description="Preencha os dados para criar um contrato"
        maxWidth={560}
      >
        <CreateContractForm
          renters={renters}
          properties={properties}
          loading={creating}
          error={createError}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function ContractDetailPanel({
  contract,
  renter,
  property,
  owner,
  loading,
  workflowLoading,
  onWorkflow,
}: {
  contract: ContractDetail;
  renter?: Renter;
  property?: Property;
  owner?: Owner;
  loading: boolean;
  workflowLoading: string | null;
  onWorkflow: (action: "activate" | "suspend" | "terminate") => void;
}) {
  const status = contract.status ?? "active";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field
          label="Imóvel"
          value={property?.address ?? contract.property_id}
        />
        <Field label="Inquilino" value={renter?.name ?? contract.renter_id} />
        <Field label="Proprietário" value={owner?.name ?? "—"} />
        <Field label="Status">
          <Badge variant={statusVariant(status)}>{status.toUpperCase()}</Badge>
        </Field>
        <Field label="Início" value={fmtDate(contract.start_date)} />
        <Field label="Término" value={fmtDate(contract.end_date)} />
        <Field label="Aluguel mensal" value={fmtBRL(contract.monthly_rent)} />
        <Field label="Dia do vencimento" value={`Dia ${contract.due_day}`} />
      </div>

      {/* Workflow buttons */}
      <div>
        <p
          className="muted-text"
          style={{
            marginBottom: 8,
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Ações de status
        </p>
        <div className="actions">
          {status !== "active" && (
            <Button
              size="sm"
              variant="primary"
              loading={workflowLoading === "activate"}
              disabled={!!workflowLoading}
              onClick={() => onWorkflow("activate")}
            >
              Ativar
            </Button>
          )}
          {status === "active" && (
            <Button
              size="sm"
              variant="ghost"
              loading={workflowLoading === "suspend"}
              disabled={!!workflowLoading}
              onClick={() => onWorkflow("suspend")}
            >
              Suspender
            </Button>
          )}
          {status !== "terminated" && (
            <Button
              size="sm"
              variant="danger"
              loading={workflowLoading === "terminate"}
              disabled={!!workflowLoading}
              onClick={() => onWorkflow("terminate")}
            >
              Encerrar
            </Button>
          )}
        </div>
      </div>

      {/* History timeline */}
      <div>
        <p
          className="muted-text"
          style={{
            marginBottom: 10,
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Histórico
        </p>
        {loading ? (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              color: "rgba(31,41,55,0.5)",
            }}
          >
            <Spinner size={16} />
            <span style={{ fontSize: "0.88rem" }}>Carregando histórico…</span>
          </div>
        ) : contract.history && contract.history.length > 0 ? (
          <Timeline entries={contract.history} />
        ) : (
          <p className="empty-state">Nenhum registro de histórico.</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
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
      {children ?? <p style={{ margin: 0, fontWeight: 500 }}>{value}</p>}
    </div>
  );
}

function Timeline({ entries }: { entries: ContractHistory[] }) {
  return (
    <ol
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        display: "grid",
        gap: 0,
      }}
    >
      {entries.map((entry, i) => (
        <li
          key={entry.id}
          style={{
            display: "grid",
            gridTemplateColumns: "16px 1fr",
            gap: "0 12px",
            paddingBottom: i < entries.length - 1 ? 16 : 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--accent)",
                flexShrink: 0,
                marginTop: 4,
              }}
            />
            {i < entries.length - 1 && (
              <span
                style={{
                  width: 1,
                  flex: 1,
                  background: "rgba(31,41,55,0.12)",
                  marginTop: 4,
                }}
              />
            )}
          </div>
          <div style={{ paddingBottom: 4 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem" }}>
              {entry.action}
            </p>
            <p className="muted-text" style={{ margin: "2px 0 0" }}>
              {entry.description}
            </p>
            <p
              className="muted-text"
              style={{ margin: "2px 0 0", fontSize: "0.75rem" }}
            >
              {entry.actor ? `${entry.actor} · ` : ""}
              {fmtDate(entry.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateContractForm({
  renters,
  properties,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  renters: Renter[];
  properties: Property[];
  loading: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const renterOpts = renters.map((r) => ({ value: r.id, label: r.name }));
  const propOpts = properties.map((p) => ({ value: p.id, label: p.address }));

  return (
    <form onSubmit={onSubmit} className="stack">
      {error && <p className="error-banner">{error}</p>}

      <Select
        label="Imóvel"
        name="property_id"
        options={propOpts}
        placeholder="Selecione um imóvel"
        required
      />
      <Select
        label="Inquilino"
        name="renter_id"
        options={renterOpts}
        placeholder="Selecione um inquilino"
        required
      />

      <div className="split-fields">
        <Input label="Início" name="start_date" type="date" required />
        <Input label="Término" name="end_date" type="date" required />
      </div>

      <div className="split-fields">
        <Input
          label="Aluguel mensal (R$)"
          name="monthly_rent"
          type="number"
          min="0"
          step="0.01"
          placeholder="2000.00"
          required
        />
        <Input
          label="Dia do vencimento"
          name="due_day"
          type="number"
          min="1"
          max="31"
          placeholder="1"
          required
        />
      </div>

      <label style={{ display: "grid", gap: 6, color: "rgba(31,41,55,0.75)" }}>
        <span style={{ fontSize: "0.88rem" }}>Contrato em PDF (opcional)</span>
        <input type="file" name="contract_pdf" accept="application/pdf" />
      </label>

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
          Criar Contrato
        </Button>
      </div>
    </form>
  );
}
