"use client";

import { useEffect, useMemo, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card, PageGrid } from "@/components/page-sections";
import { apiGet, apiPost } from "@/lib/api";
import type { Charge, ConsolidatedCharge, Contract, PaymentResult, Property } from "@/lib/types";

function monthToReferenceDate(value: FormDataEntryValue | null) {
  const month = String(value ?? "");
  return month ? `${month}-01` : "";
}

function normalizeStatus(status: string) {
  return status.toLowerCase();
}

export default function ChargesPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [lastConsolidation, setLastConsolidation] = useState<ConsolidatedCharge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const [contractsResponse, propertiesResponse, chargesResponse] = await Promise.all([
        apiGet<Contract[]>("/contracts"),
        apiGet<Property[]>("/properties"),
        apiGet<Charge[]>("/charges"),
      ]);
      setContracts(contractsResponse);
      setProperties(propertiesResponse);
      setCharges(chargesResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar cobranças.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function generateMonthlyCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData(event.currentTarget);
      await apiPost<Charge[]>("/charges/generate-monthly", {
        contract_id: String(formData.get("contract_id")),
        reference_month: monthToReferenceDate(formData.get("reference_month")),
      });
      setSuccess("Cobrança mensal criada.");
      event.currentTarget.reset();
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao gerar cobrança mensal.");
    }
  }

  async function consolidateCharges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData(event.currentTarget);
      const response = await apiPost<ConsolidatedCharge>("/charges/consolidate", {
        contract_id: String(formData.get("contract_id")),
        reference_month: monthToReferenceDate(formData.get("reference_month")),
      });
      setLastConsolidation(response);
      setSuccess("Cobranças consolidadas.");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao consolidar cobranças.");
    }
  }

  async function generatePayment(chargeId: string) {
    try {
      setError(null);
      setSuccess(null);
      const response = await apiPost<PaymentResult>(`/charges/${chargeId}/generate-payment`);
      setPaymentResult(response);
      setSuccess("Boleto/PIX gerado.");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao gerar pagamento.");
    }
  }

  const consolidatedCharges = useMemo(
    () => charges.filter((charge) => charge.type === "CONSOLIDATED"),
    [charges],
  );

  return (
    <ProtectedPage
      title="Cobranças"
      description="Gere o aluguel do mês, consolide os encargos e emita boleto/PIX no mesmo fluxo."
    >
      {error ? <p className="error-banner">{error}</p> : null}
      {success ? <p className="success-banner">{success}</p> : null}

      <PageGrid>
        <Card title="Gerar cobrança mensal" subtitle="Ação obrigatória: Gerar cobrança mensal">
          <form className="stack" onSubmit={generateMonthlyCharge}>
            <label>
              Contrato
              <select name="contract_id" required defaultValue="">
                <option value="" disabled>
                  Selecione um contrato
                </option>
                {contracts.map((contract) => {
                  const property = properties.find((item) => item.id === contract.property_id);
                  return (
                    <option key={contract.id} value={contract.id}>
                      {property?.address ?? contract.id}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Mês de referência
              <input name="reference_month" type="month" required />
            </label>
            <button className="primary-button" type="submit" disabled={contracts.length === 0}>
              Gerar cobrança mensal
            </button>
          </form>
        </Card>

        <Card title="Consolidar cobrança" subtitle="Ação obrigatória: Consolidar cobrança">
          <form className="stack" onSubmit={consolidateCharges}>
            <label>
              Contrato
              <select name="contract_id" required defaultValue="">
                <option value="" disabled>
                  Selecione um contrato
                </option>
                {contracts.map((contract) => {
                  const property = properties.find((item) => item.id === contract.property_id);
                  return (
                    <option key={contract.id} value={contract.id}>
                      {property?.address ?? contract.id}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Mês de referência
              <input name="reference_month" type="month" required />
            </label>
            <button className="primary-button" type="submit" disabled={contracts.length === 0}>
              Consolidar cobrança
            </button>
          </form>
          {lastConsolidation ? (
            <div className="inline-summary">
              <strong>Última consolidação</strong>
              <p>Total: R$ {lastConsolidation.total_amount}</p>
              <p>Itens: {lastConsolidation.items.length}</p>
            </div>
          ) : null}
        </Card>
      </PageGrid>

      <PageGrid>
        <Card title="Cobrança consolidada">
          {consolidatedCharges.length === 0 ? (
            <p className="empty-state">Nenhuma cobrança consolidada ainda.</p>
          ) : (
            <div className="list">
              {consolidatedCharges.map((charge) => (
                <article key={charge.id} className="list-row blocky">
                  <div>
                    <strong>{charge.description}</strong>
                    <p>Vencimento: {charge.due_date}</p>
                    <p>Valor total: R$ {charge.amount}</p>
                  </div>
                  <div className="actions">
                    <span className={`status-pill status-${normalizeStatus(charge.status)}`}>{charge.status}</span>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void generatePayment(charge.id)}
                    >
                      Gerar boleto/PIX
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card title="Resultado do pagamento">
          {!paymentResult ? (
            <p className="empty-state">O retorno do boleto e do PIX aparece aqui.</p>
          ) : (
            <div className="stack">
              <span className="status-pill status-done">{paymentResult.provider.toUpperCase()}</span>
              <p>
                <strong>Boleto:</strong>{" "}
                <a className="inline-link" href={paymentResult.boleto_url} target="_blank" rel="noreferrer">
                  Abrir link
                </a>
              </p>
              <p>
                <strong>Linha digitável:</strong> {paymentResult.barcode}
              </p>
              <p>
                <strong>PIX:</strong> {paymentResult.pix_qrcode}
              </p>
            </div>
          )}
        </Card>
      </PageGrid>

      <Card title="Ledger de cobranças">
        {loading ? (
          <p className="empty-state">Carregando cobranças...</p>
        ) : charges.length === 0 ? (
          <p className="empty-state">Nenhuma cobrança gerada ainda.</p>
        ) : (
          <div className="list">
            {charges.map((charge) => {
              const property = properties.find((item) => item.id === charge.property_id);
              return (
                <article key={charge.id} className="list-row blocky">
                  <div>
                    <strong>{charge.type}</strong>
                    <p>{property?.address ?? charge.property_id}</p>
                    <p>{charge.description}</p>
                  </div>
                  <div className="detail-stack">
                    <span className={`status-pill status-${normalizeStatus(charge.status)}`}>{charge.status}</span>
                    <span>R$ {charge.amount}</span>
                    <span>Vence em {charge.due_date}</span>
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
