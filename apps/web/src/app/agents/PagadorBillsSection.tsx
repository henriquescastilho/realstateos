"use client";

import { useState, useCallback, type DragEvent } from "react";
import { apiPost } from "@/lib/api";
import { deductBalance, formatBRL } from "@/lib/balance";

interface ExtractedBill {
  value: string;
  dueDate: string;
  type: string;
  barcode?: string;
  issuerName?: string;
  confidence: number;
  fileName: string | null;
}

export function PagadorBillsSection() {
  const [bills, setBills] = useState<ExtractedBill[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(async (fileList: FileList) => {
    setLoading(true);
    setError(null);
    setPaid(false);

    try {
      const filesPayload: Array<{ base64: string; name: string }> = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const base64 = await fileToBase64(file);
        filesPayload.push({ base64, name: file.name });
      }

      const result = await apiPost<{ bills: ExtractedBill[] }>(
        "/agents/pagador/extract-bills",
        { files: filesPayload },
      );

      setBills(result.bills);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao extrair dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        void processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void processFiles(e.target.files);
      }
    },
    [processFiles],
  );

  const totalCents = bills.reduce((sum, b) => {
    const val = parseFloat(b.value) || 0;
    return sum + Math.round(val * 100);
  }, 0);

  const handleConfirmPayment = async () => {
    setPaying(true);
    setError(null);
    try {
      await apiPost("/agents/pagador/extract-bills", {
        files: [], // just confirmation — real system would call pay_bills_manual
      });
      deductBalance(totalCents);
      setPaid(true);
      setBills([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao pagar.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>Pagar Contas</h4>

      {/* Drop zone */}
      <div
        className={`drop-zone${dragActive ? " active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        {loading ? (
          <p style={{ margin: 0 }}>Extraindo dados dos boletos...</p>
        ) : (
          <>
            <p style={{ margin: "0 0 8px" }}>
              Arraste PDFs de boletos aqui ou{" "}
              <label
                style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}
              >
                selecione arquivos
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  onChange={handleFileInput}
                  style={{ display: "none" }}
                />
              </label>
            </p>
            <p className="muted-text">PDF, PNG ou JPG</p>
          </>
        )}
      </div>

      {error && <p className="error-banner" style={{ marginTop: 12 }}>{error}</p>}
      {paid && <p className="success-banner" style={{ marginTop: 12 }}>Pagamento confirmado!</p>}

      {/* Bills table */}
      {bills.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <table className="event-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Emitente</th>
                <th>Valor</th>
                <th>Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill, i) => (
                <tr key={i}>
                  <td>{bill.type}</td>
                  <td>{bill.issuerName ?? "—"}</td>
                  <td>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(parseFloat(bill.value) || 0)}
                  </td>
                  <td>{bill.dueDate}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 600 }}>Total</td>
                <td colSpan={2} style={{ fontWeight: 600 }}>
                  {formatBRL(totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button
              className="primary-button"
              onClick={() => void handleConfirmPayment()}
              disabled={paying}
            >
              {paying ? "Pagando..." : "Confirmar Pagamento"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
