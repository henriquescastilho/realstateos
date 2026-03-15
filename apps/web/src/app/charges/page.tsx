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
          <p>Gere o aluguel do mês, consolide os encargos e emita boleto/PIX.</p>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {success && <p className="success-banner">{success}</p>}

      {/* Action cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <Card>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Gerar cobrança mensal</h3>
          <form className="stack" onSubmit={handleGenerate}>
            <Select
              label="Contrato"
              name="contract_id"
              options={contractOptions.slice(1)}
              placeholder="Selecione um contrato"
              required
            />
            <Input label="Mês de referência" name="reference_month" type="month" required />
            <Button type="submit" variant="primary" disabled={contracts.length === 0}>
              Gerar cobrança mensal
            </Button>
          </form>
        </Card>

        <Card>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Consolidar cobrança</h3>
          <form className="stack" onSubmit={handleConsolidate}>
            <Select
              label="Contrato"
              name="contract_id"
              options={contractOptions.slice(1)}
              placeholder="Selecione um contrato"
              required
            />
            <Input label="Mês de referência" name="reference_month" type="month" required />
            <Button type="submit" variant="primary" disabled={contracts.length === 0}>
              Consolidar cobrança
            </Button>
          </form>
          {lastConsolidation && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--surface-secondary)", borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: "0.88rem" }}>
                <strong>Total:</strong> {fmtBRL(lastConsolidation.total_amount)} · <strong>Itens:</strong> {lastConsolidation.items?.length ?? 0}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Consolidated + Payment result */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <Card>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Cobranças consolidadas</h3>
          {consolidatedCharges.length === 0 ? (
            <p className="empty-state">Nenhuma cobrança consolidada ainda.</p>
          ) : (
            <div className="stack">
              {consolidatedCharges.map((ch) => (
                <div key={ch.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{ch.description}</p>
                    <p className="muted-text" style={{ margin: "2px 0 0", fontSize: "0.8rem" }}>
                      Vence: {fmtDate(ch.due_date)} · {fmtBRL(ch.amount)}
                    </p>
                  </div>
                  <div className="actions">
                    <Badge variant={statusVariant(normalizeStatus(ch.status))}>
                      {normalizeStatus(ch.status).toUpperCase()}
                    </Badge>
                    <Button size="sm" variant="primary" onClick={() => void handlePayment(ch.id)}>
                      Gerar boleto
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Resultado do pagamento</h3>
          {!paymentResult ? (
            <p className="empty-state">O retorno do boleto e do PIX aparece aqui.</p>
          ) : (
            <div className="stack" style={{ fontSize: "0.88rem" }}>
              <Badge variant="success">{(paymentResult.provider ?? "mock").toUpperCase()}</Badge>
              {paymentResult.boleto_url && (
                <p style={{ margin: 0 }}>
                  <strong>Boleto:</strong>{" "}
                  <a href={paymentResult.boleto_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    Abrir link
                  </a>
                </p>
              )}
              {paymentResult.barcode && <p style={{ margin: 0 }}><strong>Linha digitável:</strong> {paymentResult.barcode}</p>}
              {paymentResult.pix_qrcode && <p style={{ margin: 0 }}><strong>PIX:</strong> {paymentResult.pix_qrcode}</p>}
            </div>
          )}
        </Card>
      </div>

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
