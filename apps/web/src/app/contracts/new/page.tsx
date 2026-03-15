"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { authFetch } from "@/lib/auth";
import { apiGet, apiPost } from "@/lib/api";
import type { Contract, Property, Renter } from "@/lib/types";

interface UploadResponse {
  object_key: string;
}

export default function NewContractPage() {
  const router = useRouter();

  const [properties, setProperties] = useState<Property[]>([]);
  const [renters, setRenters] = useState<Renter[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState("");
  const [renterId, setRenterId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [dueDay, setDueDay] = useState("");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfObjectKey, setPdfObjectKey] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoadingData(true);
        const [propertiesData, rentersData] = await Promise.all([
          apiGet<Property[]>("/properties"),
          apiGet<Renter[]>("/renters"),
        ]);
        setProperties(propertiesData);
        setRenters(rentersData);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Falha ao carregar dados.",
        );
      } finally {
        setLoadingData(false);
      }
    })();
  }, []);

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPdfFile(file);
    setPdfObjectKey(null);
    setPdfError(null);

    if (!file) return;

    try {
      setUploadingPdf(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch("/uploads", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload falhou (${res.status})`);
      }
      const data = (await res.json()) as UploadResponse;
      setPdfObjectKey(data.object_key);
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : "Falha no upload do PDF.",
      );
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!propertyId || !renterId) {
      setFormError("Selecione um imóvel e um inquilino.");
      return;
    }

    const payload: Record<string, unknown> = {
      property_id: propertyId,
      renter_id: renterId,
      start_date: startDate,
      end_date: endDate,
      monthly_rent: monthlyRent,
      due_day: Number(dueDay),
    };

    if (pdfObjectKey) {
      payload.document_key = pdfObjectKey;
    }

    try {
      setSubmitting(true);
      await apiPost<Contract>("/contracts", payload);
      router.push("/contracts");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Falha ao criar contrato.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const propertyOptions = properties.map((p) => ({
    value: p.id,
    label: p.address,
  }));

  const renterOptions = renters.map((r) => ({
    value: r.id,
    label: r.name,
  }));

  return (
    <ProtectedPage
      title="Novo Contrato"
      description="Preencha os dados para criar um novo contrato de locação."
    >
      {loadError && <p className="error-banner">{loadError}</p>}

      <Card title="Dados do contrato" style={{ maxWidth: 640 }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
          {loadingData ? (
            <p style={{ color: "rgba(31,41,55,0.5)", margin: 0 }}>
              Carregando imóveis e inquilinos...
            </p>
          ) : (
            <>
              <Select
                label="Imóvel"
                options={propertyOptions}
                placeholder="Selecione um imóvel"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                required
              />

              <Select
                label="Inquilino"
                options={renterOptions}
                placeholder="Selecione um inquilino"
                value={renterId}
                onChange={(e) => setRenterId(e.target.value)}
                required
              />
            </>
          )}

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <Input
              label="Data de início"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="Data de fim"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <Input
              label="Aluguel mensal (R$)"
              type="number"
              min="0"
              step="0.01"
              placeholder="2000.00"
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(e.target.value)}
              required
            />
            <Input
              label="Dia do vencimento"
              type="number"
              min="1"
              max="31"
              placeholder="1"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              required
            />
          </div>

          <label
            style={{ display: "grid", gap: 6, color: "rgba(31,41,55,0.75)" }}
          >
            <span style={{ fontSize: "0.88rem" }}>
              Contrato em PDF (opcional)
            </span>
            <input
              type="file"
              accept="application/pdf"
              onChange={handlePdfChange}
              disabled={uploadingPdf}
              style={{ fontSize: "0.9rem" }}
            />
            {uploadingPdf && (
              <span
                style={{ fontSize: "0.82rem", color: "rgba(31,41,55,0.5)" }}
              >
                Enviando PDF...
              </span>
            )}
            {pdfObjectKey && !uploadingPdf && (
              <span style={{ fontSize: "0.82rem", color: "#15803d" }}>
                PDF enviado com sucesso.
              </span>
            )}
            {pdfError && (
              <span className="error-text" style={{ fontSize: "0.82rem" }}>
                {pdfError}
              </span>
            )}
          </label>

          {formError && (
            <p className="error-banner" style={{ margin: 0 }}>
              {formError}
            </p>
          )}

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/contracts")}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={loadingData || uploadingPdf}
            >
              Criar contrato
            </Button>
          </div>
        </form>
      </Card>
    </ProtectedPage>
  );
}
