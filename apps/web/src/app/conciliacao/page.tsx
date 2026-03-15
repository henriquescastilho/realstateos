"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { nodeApiGet, nodeApiPost } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Table,
  statusVariant,
} from "@/components/ui";
import type { Column } from "@/components/ui";
import { ProtectedPage } from "@/components/layout/protected-page";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Billing {
  id: string;
  contract_id: string;
  renter_id?: string;
  amount: string | number;
  due_date: string;
  paid_at?: string;
  status: string;
  reference_month?: string;
  description?: string;
}

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

interface Contract {
  id: string;
  code?: string;
  property_id: string;
  renter_id?: string;
  owner_id?: string;
  rent_amount?: string | number;
}

interface Owner {
  id: string;
  name: string;
}

interface Renter {
  id: string;
  name: string;
}

interface Property {
  id: string;
  address: string;
}

interface ManualEntry {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  createdAt: string;
}

interface ConciliacaoRow {
  contractId: string;
  contractCode: string;
  propertyAddress: string;
  renterName: string;
  ownerName: string;
  referenceMonth: string;
  rentAmount: number;
  totalCharged: number;
  totalReceived: number;
  totalRepassed: number;
  balance: number;
  status: "conciliado" | "pendente" | "divergente";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBRL(v: string | number) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [
    { value: "", label: "Todos os meses" },
  ];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    months.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return months;
}

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "conciliado", label: "Conciliado" },
  { value: "pendente", label: "Pendente" },
  { value: "divergente", label: "Divergente" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConciliacaoPage() {
  const [billings, setBillings] = useState<Billing[]>([]);
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [renters, setRenters] = useState<Renter[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Manual operations
  const [showOpModal, setShowOpModal] = useState(false);
  const [opType, setOpType] = useState<"credit" | "debit">("credit");
  const [opAmount, setOpAmount] = useState("");
  const [opDescription, setOpDescription] = useState("");
  const [opSaving, setOpSaving] = useState(false);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, r, c, o, rn, p] = await Promise.all([
        nodeApiGet<Billing[]>("/billing").catch(() => [] as Billing[]),
        nodeApiGet<Repasse[]>("/repasses").catch(() => [] as Repasse[]),
        nodeApiGet<Contract[]>("/contracts").catch(() => [] as Contract[]),
        nodeApiGet<Owner[]>("/owners").catch(() => [] as Owner[]),
        nodeApiGet<Renter[]>("/renters").catch(() => [] as Renter[]),
        nodeApiGet<Property[]>("/properties").catch(() => [] as Property[]),
      ]);
      setBillings(b);
      setRepasses(r);
      setContracts(c);
      setOwners(o);
      setRenters(rn);
      setProperties(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Load manual entries
    nodeApiGet<ManualEntry[]>("/conciliacao/entries")
      .then(setManualEntries)
      .catch(() => setManualEntries([]));
  }, [load]);

  const handleSaveOp = useCallback(async () => {
    if (!opAmount || !opDescription) return;
    setOpSaving(true);
    try {
      const entry = await nodeApiPost<ManualEntry>("/conciliacao/entries", {
        type: opType,
        amount: Number(opAmount),
        description: opDescription,
      });
      setManualEntries((prev) => [entry, ...prev]);
      setOpAmount("");
      setOpDescription("");
      setShowOpModal(false);
    } catch {
      // If API doesn't exist yet, store locally
      const localEntry: ManualEntry = {
        id: crypto.randomUUID(),
        type: opType,
        amount: Number(opAmount),
        description: opDescription,
        createdAt: new Date().toISOString(),
      };
      setManualEntries((prev) => [localEntry, ...prev]);
      setOpAmount("");
      setOpDescription("");
      setShowOpModal(false);
    } finally {
      setOpSaving(false);
    }
  }, [opType, opAmount, opDescription]);

  const removeEntry = useCallback((id: string) => {
    setManualEntries((prev) => prev.filter((e) => e.id !== id));
    nodeApiPost("/conciliacao/entries/remove", { id }).catch(() => {});
  }, []);

  const manualBalance = useMemo(() => {
    return manualEntries.reduce((sum, e) => {
      return sum + (e.type === "credit" ? e.amount : -e.amount);
    }, 0);
  }, [manualEntries]);

  // Build conciliation rows: group billings and repasses per contract + month
  const rows = useMemo(() => {
    const map = new Map<string, ConciliacaoRow>();

    for (const contract of contracts) {
      const owner = owners.find((o) => o.id === contract.owner_id);
      const renter = renters.find((r) => r.id === contract.renter_id);
      const property = properties.find((p) => p.id === contract.property_id);

      // Group billings by reference_month for this contract
      const contractBillings = billings.filter((b) => b.contract_id === contract.id);
      const contractRepasses = repasses.filter((r) => r.contract_id === contract.id);

      // Collect all months
      const months = new Set<string>();
      contractBillings.forEach((b) => {
        if (b.reference_month) months.add(b.reference_month);
        else {
          const m = b.due_date?.slice(0, 7);
          if (m) months.add(m);
        }
      });
      contractRepasses.forEach((r) => {
        if (r.reference_month) months.add(r.reference_month);
      });

      // If no activity, add current month
      if (months.size === 0) months.add(getCurrentMonth());

      for (const month of months) {
        const key = `${contract.id}-${month}`;
        const monthBillings = contractBillings.filter((b) => {
          const bMonth = b.reference_month ?? b.due_date?.slice(0, 7);
          return bMonth === month;
        });
        const monthRepasses = contractRepasses.filter((r) => {
          return r.reference_month === month;
        });

        const totalCharged = monthBillings.reduce((sum, b) => sum + Number(b.amount), 0);
        const totalReceived = monthBillings
          .filter((b) => b.status === "paid")
          .reduce((sum, b) => sum + Number(b.amount), 0);
        const totalRepassed = monthRepasses
          .filter((r) => r.status === "paid")
          .reduce((sum, r) => sum + Number(r.net_amount ?? r.amount), 0);

        const balance = totalReceived - totalRepassed;

        let status: ConciliacaoRow["status"] = "pendente";
        if (totalReceived > 0 && totalRepassed > 0 && Math.abs(balance) < 1) {
          status = "conciliado";
        } else if (totalReceived > 0 && totalRepassed > 0 && Math.abs(balance) >= 1) {
          status = "divergente";
        }

        map.set(key, {
          contractId: contract.id,
          contractCode: contract.code ?? contract.id.slice(0, 8),
          propertyAddress: property?.address ?? "—",
          renterName: renter?.name ?? "—",
          ownerName: owner?.name ?? "—",
          referenceMonth: month,
          rentAmount: Number(contract.rent_amount ?? 0),
          totalCharged,
          totalReceived,
          totalRepassed,
          balance,
          status,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));
  }, [billings, repasses, contracts, owners, renters, properties]);

  // Apply filters
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        row.renterName.toLowerCase().includes(q) ||
        row.ownerName.toLowerCase().includes(q) ||
        row.propertyAddress.toLowerCase().includes(q) ||
        row.contractCode.toLowerCase().includes(q);
      const matchMonth = !filterMonth || row.referenceMonth === filterMonth;
      const matchStatus = !filterStatus || row.status === filterStatus;
      return matchSearch && matchMonth && matchStatus;
    });
  }, [rows, search, filterMonth, filterStatus]);

  // KPIs
  const kpis = useMemo(() => {
    const totalReceived = rows.reduce((s, r) => s + r.totalReceived, 0);
    const totalRepassed = rows.reduce((s, r) => s + r.totalRepassed, 0);
    const conciliados = rows.filter((r) => r.status === "conciliado").length;
    const divergentes = rows.filter((r) => r.status === "divergente").length;
    const pendentes = rows.filter((r) => r.status === "pendente").length;
    const saldoRetido = totalReceived - totalRepassed;
    return { totalReceived, totalRepassed, conciliados, divergentes, pendentes, saldoRetido };
  }, [rows]);

  function statusLabel(s: string) {
    switch (s) {
      case "conciliado": return "CONCILIADO";
      case "divergente": return "DIVERGENTE";
      default: return "PENDENTE";
    }
  }

  function statusColor(s: string) {
    switch (s) {
      case "conciliado": return "success" as const;
      case "divergente": return "danger" as const;
      default: return "warning" as const;
    }
  }

  const columns: Column<ConciliacaoRow>[] = [
    {
      key: "contract",
      header: "Contrato",
      render: (row) => (
        <span style={{ fontWeight: 500 }}>{row.contractCode}</span>
      ),
    },
    {
      key: "property",
      header: "Imóvel",
      render: (row) => (
        <span style={{ fontSize: "0.9rem" }}>{row.propertyAddress}</span>
      ),
    },
    {
      key: "renter",
      header: "Inquilino",
      render: (row) => row.renterName,
    },
    {
      key: "owner",
      header: "Proprietário",
      render: (row) => row.ownerName,
    },
    {
      key: "month",
      header: "Mês",
      render: (row) => {
        const [y, m] = row.referenceMonth.split("-");
        const d = new Date(Number(y), Number(m) - 1);
        const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
        return label.charAt(0).toUpperCase() + label.slice(1);
      },
    },
    {
      key: "charged",
      header: "Cobrado",
      align: "right",
      render: (row) => fmtBRL(row.totalCharged),
    },
    {
      key: "received",
      header: "Recebido",
      align: "right",
      render: (row) => (
        <span style={{ color: row.totalReceived > 0 ? "var(--color-success)" : undefined }}>
          {fmtBRL(row.totalReceived)}
        </span>
      ),
    },
    {
      key: "repassed",
      header: "Repassado",
      align: "right",
      render: (row) => fmtBRL(row.totalRepassed),
    },
    {
      key: "balance",
      header: "Saldo",
      align: "right",
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            color: row.balance > 0
              ? "var(--color-warning)"
              : row.balance < 0
                ? "var(--color-danger)"
                : "var(--color-success)",
          }}
        >
          {fmtBRL(row.balance)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (row) => (
        <Badge variant={statusColor(row.status)}>
          {statusLabel(row.status)}
        </Badge>
      ),
    },
  ];

  return (
    <ProtectedPage
      title="Conciliação Bancária"
      description="Visão consolidada de recebimentos e repasses por contrato. Operado pelo agente Contador."
    >
      {error && <p className="error-banner">{error}</p>}

      {/* KPI Cards */}
      <div className="page-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Card>
          <p className="muted-text" style={{ margin: "0 0 4px" }}>Total Recebido</p>
          <p className="metric-value" style={{ fontSize: "1.8rem", color: "var(--color-success)" }}>
            {fmtBRL(kpis.totalReceived)}
          </p>
        </Card>
        <Card>
          <p className="muted-text" style={{ margin: "0 0 4px" }}>Total Repassado</p>
          <p className="metric-value" style={{ fontSize: "1.8rem" }}>
            {fmtBRL(kpis.totalRepassed)}
          </p>
        </Card>
        <Card>
          <p className="muted-text" style={{ margin: "0 0 4px" }}>Saldo Retido</p>
          <p className="metric-value" style={{ fontSize: "1.8rem", color: "var(--color-warning)" }}>
            {fmtBRL(kpis.saldoRetido)}
          </p>
        </Card>
        <Card>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div>
              <p className="muted-text" style={{ margin: "0 0 4px" }}>Conciliados</p>
              <p className="metric-value" style={{ fontSize: "1.8rem", color: "var(--color-success)" }}>
                {kpis.conciliados}
              </p>
            </div>
            <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>
              <p className="muted-text" style={{ margin: "0 0 4px" }}>Pendentes</p>
              <p className="metric-value" style={{ fontSize: "1.8rem", color: "var(--color-warning)" }}>
                {kpis.pendentes}
              </p>
            </div>
            <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>
              <p className="muted-text" style={{ margin: "0 0 4px" }}>Divergentes</p>
              <p className="metric-value" style={{ fontSize: "1.8rem", color: "var(--color-danger)" }}>
                {kpis.divergentes}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Input
            placeholder="Buscar por inquilino, proprietário, imóvel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            options={getMonthOptions()}
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
          <Select
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <p className="muted-text">
            {filtered.length} registro{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="alive-dot" />
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Agente Contador ativo
            </span>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          rowKey={(row) => `${(row as unknown as ConciliacaoRow).contractId}-${(row as unknown as ConciliacaoRow).referenceMonth}`}
          loading={loading}
          emptyText="Nenhum registro de conciliação encontrado."
        />
      </Card>

      {/* Manual Operations */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "1.1rem" }}>Operações Internas</h3>
            <p className="muted-text">Lançamentos manuais de crédito e débito na conta bancária.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setOpType("credit"); setShowOpModal(true); }}
            >
              + Crédito
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setOpType("debit"); setShowOpModal(true); }}
            >
              − Débito
            </Button>
          </div>
        </div>

        {manualEntries.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: "0.92rem" }}>
              Saldo de operações internas:{" "}
              <strong style={{
                color: manualBalance >= 0 ? "var(--color-success)" : "var(--color-danger)",
              }}>
                {fmtBRL(manualBalance)}
              </strong>
            </p>
          </div>
        )}

        {manualEntries.length === 0 ? (
          <p className="empty-state">Nenhum lançamento manual registrado.</p>
        ) : (
          <div className="list">
            {manualEntries.map((entry) => (
              <div key={entry.id} className="list-row">
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.1rem", fontWeight: 700,
                    background: entry.type === "credit" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                    color: entry.type === "credit" ? "var(--color-success)" : "var(--color-danger)",
                  }}>
                    {entry.type === "credit" ? "+" : "−"}
                  </span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{entry.description}</p>
                    <p className="muted-text" style={{ margin: 0 }}>
                      {new Date(entry.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    fontWeight: 600, fontSize: "1rem",
                    color: entry.type === "credit" ? "var(--color-success)" : "var(--color-danger)",
                  }}>
                    {entry.type === "credit" ? "+" : "−"} {fmtBRL(entry.amount)}
                  </span>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    title="Remover lançamento"
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-faint)", fontSize: "0.85rem", padding: 4,
                    }}
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Operation Modal */}
      <Modal
        open={showOpModal}
        onClose={() => setShowOpModal(false)}
        title={opType === "credit" ? "Adicionar Crédito" : "Registrar Débito"}
        description={
          opType === "credit"
            ? "Registre uma entrada de dinheiro na conta bancária."
            : "Registre uma saída de dinheiro da conta bancária."
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            label="Valor (R$)"
            type="number"
            placeholder="0,00"
            value={opAmount}
            onChange={(e) => setOpAmount(e.target.value)}
          />
          <Input
            label="Descrição"
            placeholder={opType === "credit" ? "Ex: Depósito bancário, TED recebida..." : "Ex: Taxa bancária, pagamento avulso..."}
            value={opDescription}
            onChange={(e) => setOpDescription(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowOpModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveOp()}
              disabled={opSaving || !opAmount || !opDescription}
            >
              {opSaving ? "Salvando..." : opType === "credit" ? "Adicionar Crédito" : "Registrar Débito"}
            </Button>
          </div>
        </div>
      </Modal>
    </ProtectedPage>
  );
}
