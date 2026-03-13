"use client";

import { useEffect, useState } from "react";

import { ProtectedPage } from "@/components/layout/protected-page";
import { Card, PageGrid } from "@/components/page-sections";
import { apiGet, apiUpload } from "@/lib/api";
import type { DocumentRecord, Property } from "@/lib/types";

type DocumentKind = "IPTU" | "CONDO";

function buildDocumentFormData(
  propertyId: string,
  type: DocumentKind,
  amount: string,
  dueDate: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("property_id", propertyId);
  formData.append("type", type);
  formData.append("extracted_amount", amount);
  formData.append("extracted_due_date", dueDate);
  formData.append("file", file);
  return formData;
}

function extractFilename(fileUrl: string) {
  const parts = fileUrl.split("/");
  return parts[parts.length - 1] ?? fileUrl;
}

export default function DocumentsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const [propertiesResponse, documentsResponse] = await Promise.all([
        apiGet<Property[]>("/properties"),
        apiGet<DocumentRecord[]>("/documents"),
      ]);
      setProperties(propertiesResponse);
      setDocuments(documentsResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submitUpload(event: React.FormEvent<HTMLFormElement>, type: DocumentKind) {
    event.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      const formData = new FormData(event.currentTarget);
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Selecione um PDF válido.");
      }

      const payload = buildDocumentFormData(
        String(formData.get("property_id")),
        type,
        String(formData.get("extracted_amount")),
        String(formData.get("extracted_due_date")),
        file,
      );

      await apiUpload<DocumentRecord>("/documents/upload", payload);
      event.currentTarget.reset();
      setSuccess(type === "IPTU" ? "IPTU anexado." : "Condomínio anexado.");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao anexar documento.");
    }
  }

  return (
    <ProtectedPage
      title="Documentos"
      description="Faça upload manual de IPTU e condomínio. O backend cria as charges a partir do upload."
    >
      {error ? <p className="error-banner">{error}</p> : null}
      {success ? <p className="success-banner">{success}</p> : null}

      <PageGrid>
        <Card title="Anexar IPTU" subtitle="Ação obrigatória: Anexar IPTU">
          <form className="stack" onSubmit={(event) => void submitUpload(event, "IPTU")}>
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
            <div className="split-fields">
              <label>
                Valor
                <input name="extracted_amount" type="number" min="0" step="0.01" required />
              </label>
              <label>
                Vencimento
                <input name="extracted_due_date" type="date" required />
              </label>
            </div>
            <label>
              PDF
              <input name="file" type="file" accept="application/pdf" required />
            </label>
            <button className="primary-button" type="submit" disabled={properties.length === 0}>
              Anexar IPTU
            </button>
          </form>
        </Card>

        <Card title="Anexar condomínio" subtitle="Ação obrigatória: Anexar condomínio">
          <form className="stack" onSubmit={(event) => void submitUpload(event, "CONDO")}>
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
            <div className="split-fields">
              <label>
                Valor
                <input name="extracted_amount" type="number" min="0" step="0.01" required />
              </label>
              <label>
                Vencimento
                <input name="extracted_due_date" type="date" required />
              </label>
            </div>
            <label>
              PDF
              <input name="file" type="file" accept="application/pdf" required />
            </label>
            <button className="primary-button" type="submit" disabled={properties.length === 0}>
              Anexar condomínio
            </button>
          </form>
        </Card>
      </PageGrid>

      <Card title="Uploads registrados">
        {loading ? (
          <p className="empty-state">Carregando documentos...</p>
        ) : documents.length === 0 ? (
          <p className="empty-state">Nenhum documento enviado ainda.</p>
        ) : (
          <div className="list">
            {documents.map((document) => {
              const property = properties.find((item) => item.id === document.property_id);
              return (
                <article key={document.id} className="list-row blocky">
                  <div>
                    <strong>{document.type}</strong>
                    <p>{property?.address ?? document.property_id}</p>
                    <p>{extractFilename(document.file_url)}</p>
                  </div>
                  <div className="detail-stack">
                    <span className="status-pill status-done">UPLOAD</span>
                    <span>{document.parsed_data.amount ? `R$ ${String(document.parsed_data.amount)}` : "Sem valor"}</span>
                    <span>{document.parsed_data.due_date ? String(document.parsed_data.due_date) : "Sem vencimento"}</span>
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
