"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { Charge, ConsolidatedCharge, Contract, PaymentResult, Property } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Spinner,
  Table,
  statusVariant,
} from "@/components/ui";
import type { Column } from "@/components/ui";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBRL(n: string | number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(s: string | undefined | null) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function normalizeStatus(status: string | undefined | null) {
  return (status ?? "pending").toLowerCase();
}

function monthToRef(value: FormDataEntryValue | null) {
  const m = String(value ?? "");
  return m ? `${m}-01` : "";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChargesPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [lastConsolidation, setLastConsolidation] = useState<ConsolidatedCharge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterContract, setFilterContract] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, p, ch] = await Promise.all([
        apiGet<Contract[]>("/contracts"),
        apiGet<Property[]>("/properties"),
        apiGet<Charge[]>("/charges"),
      ]);
      setContracts(Array.isArray(c) ? c : []);
      setProperties(Array.isArray(p) ? p : []);
      setCharges(Array.isArray(ch) ? ch : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar cobranças.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtered charges
  const filtered = useMemo(() => {
    return charges.filter((ch) => {
      const matchStatus = !filterStatus || normalizeStatus(ch.status) === filterStatus;
      const matchContract = !filterContract || ch.contract_id === filterContract;
      return matchStatus && matchContract;
    });
  }, [charges, filterStatus, filterContract]);

  const consolidatedCharges = useMemo(
    () => charges.filter((ch) => (ch.type ?? "").toUpperCase() === "CONSOLIDATED"),
    [charges],
  );

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost("/charges/generate-monthly", {
        contract_id: String(fd.get("contract_id")),
        reference_month: monthToRef(fd.get("reference_month")),
      });
      setSuccess("Cobrança mensal gerada com sucesso.");
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar cobrança.");
    }
  }

  async function handleConsolidate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiPost<ConsolidatedCharge>("/charges/consolidate", {
        contract_id: String(fd.get("contract_id")),
        reference_month: monthToRef(fd.get("reference_month")),
      });
      setLastConsolidation(res);
      setSuccess("Cobranças consolidadas.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consolidar.");
    }
  }

  async function handlePayment(chargeId: string) {
    setError(null);
    setSuccess(null);
    try {
      const res = await apiPost<PaymentResult>(`/charges/${chargeId}/generate-payment`);
      setPaymentResult(res);
      setSuccess("Boleto/PIX gerado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar pagamento.");
    }
  }

  // Table columns
  const columns: Column<Charge>[] = [
    {
      key: "type",
      header: "Tipo",
      render: (row) => (
        <Badge variant={row.type === "CONSOLIDATED" ? "info" : "default"}>
          {row.type ?? "—"}
        </Badge>
      ),
    },
    {
      key: "property",
      header: "Imóvel",
      render: (row) => {
        const p = properties.find((x) => x.id === row.property_id);
        return <span style={{ fontWeight: 500 }}>{p?.address ?? "—"}</span>;
      },
    },
    {
      key: "description",
      header: "Descrição",
      render: (row) => row.description ?? "—",
    },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      render: (row) => fmtBRL(row.amount ?? 0),
    },
    {
      key: "due_date",
      header: "Vencimento",
      render: (row) => fmtDate(row.due_date),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (row) => {
        const s = normalizeStatus(row.status);
        return <Badge variant={statusVariant(s)}>{s.toUpperCase()}</Badge>;
      },
    },
  ];

  const contractOptions = [
    { value: "", label: "Todos contratos" },
    ...contracts.map((c) => {
      const p = properties.find((x) => x.id === c.property_id);
      return { value: c.id, label: p?.address ?? c.id.slice(0, 8) };
    }),
  ];

  const statusOptions = [
    { value: "", label: "Todos status" },
    { value: "pending", label: "Pendente" },
    { value: "issued", label: "Emitida" },
    { value: "paid", label: "Pago" },
    { value: "overdue", label: "Atrasado" },
  ];

  return (
    <section className="page">
      <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow">Financeiro</p>
          <h2>Cobranças</h2>
          <p>Acompanhe as cobranças geradas automaticamente pelos agentes.</p>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {/* Charges table */}
      <Card>
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <Select options={statusOptions} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} />
          <Select options={contractOptions} value={filterContract} onChange={(e) => setFilterContract(e.target.value)} />
        </div>
        <p className="muted-text" style={{ marginBottom: 10 }}>
          {filtered.length} cobrança{filtered.length !== 1 ? "s" : ""}
        </p>
        <Table
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          rowKey={(row) => (row as unknown as Charge).id}
          loading={loading}
          emptyText="Nenhuma cobrança encontrada."
        />
      </Card>
    </section>
  );
}
