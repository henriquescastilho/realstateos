"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { nodeApiGet } from "@/lib/api";
import {
  Badge,
  Card,
  Input,
  Select,
  Table,
  statusVariant,
} from "@/components/ui";
import type { Column } from "@/components/ui";

interface Repasse {
  id: string;
  contract_id: string;
  owner_id: string;
  amount: string | number;
  net_amount?: string | number;
  paid_at?: string;
  reference_month?: string;
  status: string;
}

interface Owner {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  property_id: string;
  code?: string;
}

interface Property {
  id: string;
  address: string;
}

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
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Pago" },
  { value: "scheduled", label: "Agendado" },
];

export default function RepassesPage() {
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, o, c, p] = await Promise.all([
        nodeApiGet<Repasse[]>("/repasses").catch(() => [] as Repasse[]),
        nodeApiGet<Owner[]>("/owners").catch(() => [] as Owner[]),
        nodeApiGet<Contract[]>("/contracts").catch(() => [] as Contract[]),
        nodeApiGet<Property[]>("/properties").catch(() => [] as Property[]),
      ]);
      setRepasses(r);
      setOwners(o);
      setContracts(c);
      setProperties(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar repasses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return repasses.filter((r) => {
      const owner = owners.find((o) => o.id === r.owner_id);
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        owner?.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q);
      const matchStatus = !filterStatus || r.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [repasses, owners, search, filterStatus]);

  const columns: Column<Repasse>[] = [
    {
      key: "owner",
      header: "Proprietário",
      render: (row) => {
        const o = owners.find((x) => x.id === row.owner_id);
        return <span style={{ fontWeight: 500 }}>{o?.name ?? "—"}</span>;
      },
    },
    {
      key: "property",
      header: "Imóvel",
      render: (row) => {
        const c = contracts.find((x) => x.id === row.contract_id);
        const p = c ? properties.find((x) => x.id === c.property_id) : null;
        return p?.address ?? "—";
      },
    },
    {
      key: "reference",
      header: "Referência",
      render: (row) => row.reference_month ?? "—",
    },
    {
      key: "amount",
      header: "Valor bruto",
      align: "right",
      render: (row) => fmtBRL(row.amount),
    },
    {
      key: "net_amount",
      header: "Valor líquido",
      align: "right",
      render: (row) => row.net_amount ? fmtBRL(row.net_amount) : "—",
    },
    {
      key: "paid_at",
      header: "Pago em",
      render: (row) => row.paid_at ? fmtDate(row.paid_at) : "—",
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {row.status.toUpperCase()}
        </Badge>
      ),
    },
  ];

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Financeiro</p>
          <h2>Repasses</h2>
          <p>Visão geral dos repasses aos proprietários.</p>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      <Card>
        <div className="filter-grid" style={{ display: "grid", gap: 12 }}>
          <Input
            placeholder="Buscar por proprietário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
        </div>
        <p className="muted-text" style={{ marginTop: 10 }}>
          {filtered.length} repasse{filtered.length !== 1 ? "s" : ""}{" "}
          encontrado{filtered.length !== 1 ? "s" : ""}
        </p>
      </Card>

      <Card>
        <Table
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          rowKey={(row) => (row as unknown as Repasse).id}
          loading={loading}
          emptyText="Nenhum repasse encontrado."
        />
      </Card>
    </section>
  );
}
