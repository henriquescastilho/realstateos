"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Draft {
  // Step 1 — Company
  orgName: string;
  cnpj: string;
  phone: string;
  city: string;
  state: string;

  // Step 2 — Property
  propertyAddress: string;
  propertyType: string;
  propertyArea: string;
  propertyRent: string;

  // Step 3 — Contract
  renterName: string;
  renterCpf: string;
  renterEmail: string;
  renterPhone: string;
  contractStart: string;
  contractDuration: string;
  contractDueDay: string;

  // Step 4 — Bank
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  pixKey: string;
}

const DRAFT_KEY = "ro_onboarding_draft";

const EMPTY_DRAFT: Draft = {
  orgName: "",
  cnpj: "",
  phone: "",
  city: "",
  state: "",
  propertyAddress: "",
  propertyType: "Residencial",
  propertyArea: "",
  propertyRent: "",
  renterName: "",
  renterCpf: "",
  renterEmail: "",
  renterPhone: "",
  contractStart: "",
  contractDuration: "12",
  contractDueDay: "10",
  bankName: "",
  bankAgency: "",
  bankAccount: "",
  pixKey: "",
};

// ---------------------------------------------------------------------------
// Step metadata
// ---------------------------------------------------------------------------

const STEPS = [
  { title: "Empresa", subtitle: "Dados básicos da sua organização" },
  { title: "Imóvel", subtitle: "Cadastre seu primeiro imóvel" },
  { title: "Contrato", subtitle: "Configure o primeiro contrato" },
  { title: "Conta Bancária", subtitle: "Para receber aluguéis" },
  { title: "Pronto para começar!", subtitle: "Revise as informações e inicie" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore write errors in SSR/private browsing
  }
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Small reusable field component
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <label
      style={{
        display: "grid",
        gap: 6,
        color: "rgba(31,41,55,0.75)",
        fontSize: "0.9rem",
      }}
    >
      <span>
        {label}
        {required && (
          <span style={{ color: "var(--accent)", marginLeft: 3 }}>*</span>
        )}
      </span>
      {children}
      {hint && !error && (
        <span style={{ fontSize: "0.78rem", color: "rgba(31,41,55,0.52)" }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          style={{ fontSize: "0.78rem", color: "#991b1b" }}
          role="alert"
          aria-live="polite"
        >
          {error}
        </span>
      )}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(31,41,55,0.12)",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.82)",
  fontSize: "0.95rem",
  color: "var(--ink)",
  width: "100%",
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: "1px solid #991b1b",
};

function getInputStyle(error?: string): React.CSSProperties {
  return error ? inputErrorStyle : inputStyle;
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

interface StepProps {
  draft: Draft;
  errors: Partial<Record<keyof Draft, string>>;
  onChange: (field: keyof Draft, value: string) => void;
}

function StepCompany({ draft, errors, onChange }: StepProps) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Nome da organização" required error={errors.orgName}>
        <input
          type="text"
          style={getInputStyle(errors.orgName)}
          value={draft.orgName}
          onChange={(e) => onChange("orgName", e.target.value)}
          placeholder="Imobiliária ABC"
          autoComplete="organization"
        />
      </Field>

      <Field
        label="CNPJ"
        required
        hint="Formato: XX.XXX.XXX/XXXX-XX"
        error={errors.cnpj}
      >
        <input
          type="text"
          style={getInputStyle(errors.cnpj)}
          value={draft.cnpj}
          onChange={(e) => onChange("cnpj", e.target.value)}
          placeholder="00.000.000/0001-00"
          maxLength={18}
        />
      </Field>

      <Field label="Telefone" error={errors.phone}>
        <input
          type="tel"
          style={getInputStyle(errors.phone)}
          value={draft.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder="(11) 99999-9999"
        />
      </Field>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}
      >
        <Field label="Cidade" error={errors.city}>
          <input
            type="text"
            style={getInputStyle(errors.city)}
            value={draft.city}
            onChange={(e) => onChange("city", e.target.value)}
            placeholder="São Paulo"
          />
        </Field>

        <Field label="UF" error={errors.state}>
          <input
            type="text"
            style={{ ...getInputStyle(errors.state), width: 64 }}
            value={draft.state}
            onChange={(e) => onChange("state", e.target.value.toUpperCase())}
            placeholder="SP"
            maxLength={2}
          />
        </Field>
      </div>
    </div>
  );
}

function StepProperty({ draft, errors, onChange }: StepProps) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Endereço completo" required error={errors.propertyAddress}>
        <input
          type="text"
          style={getInputStyle(errors.propertyAddress)}
          value={draft.propertyAddress}
          onChange={(e) => onChange("propertyAddress", e.target.value)}
          placeholder="Rua das Flores, 123 — Jardim América, São Paulo/SP"
        />
      </Field>

      <Field label="Tipo" error={errors.propertyType}>
        <select
          style={getInputStyle(errors.propertyType)}
          value={draft.propertyType}
          onChange={(e) => onChange("propertyType", e.target.value)}
        >
          <option value="Residencial">Residencial</option>
          <option value="Comercial">Comercial</option>
          <option value="Industrial">Industrial</option>
        </select>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Área (m²)" error={errors.propertyArea}>
          <input
            type="text"
            style={getInputStyle(errors.propertyArea)}
            value={draft.propertyArea}
            onChange={(e) => onChange("propertyArea", e.target.value)}
            placeholder="65"
          />
        </Field>

        <Field label="Valor do aluguel (R$)" error={errors.propertyRent}>
          <input
            type="text"
            style={getInputStyle(errors.propertyRent)}
            value={draft.propertyRent}
            onChange={(e) => onChange("propertyRent", e.target.value)}
            placeholder="2.500,00"
          />
        </Field>
      </div>
    </div>
  );
}

function StepContract({ draft, errors, onChange }: StepProps) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Nome do locatário" required error={errors.renterName}>
        <input
          type="text"
          style={getInputStyle(errors.renterName)}
          value={draft.renterName}
          onChange={(e) => onChange("renterName", e.target.value)}
          placeholder="Maria da Silva"
        />
      </Field>

      <Field
        label="CPF"
        required
        hint="Formato: XXX.XXX.XXX-XX"
        error={errors.renterCpf}
      >
        <input
          type="text"
          style={getInputStyle(errors.renterCpf)}
          value={draft.renterCpf}
          onChange={(e) => onChange("renterCpf", e.target.value)}
          placeholder="000.000.000-00"
          maxLength={14}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="E-mail" error={errors.renterEmail}>
          <input
            type="email"
            style={getInputStyle(errors.renterEmail)}
            value={draft.renterEmail}
            onChange={(e) => onChange("renterEmail", e.target.value)}
            placeholder="maria@exemplo.com"
          />
        </Field>

        <Field label="Telefone" error={errors.renterPhone}>
          <input
            type="tel"
            style={getInputStyle(errors.renterPhone)}
            value={draft.renterPhone}
            onChange={(e) => onChange("renterPhone", e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </Field>
      </div>

      <Field label="Data de início" error={errors.contractStart}>
        <input
          type="date"
          style={getInputStyle(errors.contractStart)}
          value={draft.contractStart}
          onChange={(e) => onChange("contractStart", e.target.value)}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field
          label="Duração (meses)"
          hint="Padrão: 12 meses"
          error={errors.contractDuration}
        >
          <input
            type="text"
            style={getInputStyle(errors.contractDuration)}
            value={draft.contractDuration}
            onChange={(e) => onChange("contractDuration", e.target.value)}
            placeholder="12"
          />
        </Field>

        <Field
          label="Dia de vencimento"
          hint="Entre 1 e 31"
          error={errors.contractDueDay}
        >
          <input
            type="text"
            style={getInputStyle(errors.contractDueDay)}
            value={draft.contractDueDay}
            onChange={(e) => onChange("contractDueDay", e.target.value)}
            placeholder="10"
          />
        </Field>
      </div>
    </div>
  );
}

function StepBank({ draft, errors, onChange }: StepProps) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p
        style={{
          margin: 0,
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(180,90,42,0.08)",
          color: "var(--accent-dark)",
          fontSize: "0.875rem",
          border: "1px solid rgba(180,90,42,0.18)",
        }}
      >
        Você pode adicionar conta bancária depois nas configurações.
      </p>

      <Field label="Nome do banco" error={errors.bankName}>
        <input
          type="text"
          style={getInputStyle(errors.bankName)}
          value={draft.bankName}
          onChange={(e) => onChange("bankName", e.target.value)}
          placeholder="Banco do Brasil"
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Agência" error={errors.bankAgency}>
          <input
            type="text"
            style={getInputStyle(errors.bankAgency)}
            value={draft.bankAgency}
            onChange={(e) => onChange("bankAgency", e.target.value)}
            placeholder="0001"
          />
        </Field>

        <Field label="Conta" error={errors.bankAccount}>
          <input
            type="text"
            style={getInputStyle(errors.bankAccount)}
            value={draft.bankAccount}
            onChange={(e) => onChange("bankAccount", e.target.value)}
            placeholder="12345-6"
          />
        </Field>
      </div>

      <Field
        label="Chave PIX"
        hint="Opcional — CPF, e-mail, telefone ou chave aleatória"
        error={errors.pixKey}
      >
        <input
          type="text"
          style={getInputStyle(errors.pixKey)}
          value={draft.pixKey}
          onChange={(e) => onChange("pixKey", e.target.value)}
          placeholder="email@banco.com.br"
        />
      </Field>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--line)",
        fontSize: "0.9rem",
      }}
    >
      <span style={{ color: "rgba(31,41,55,0.55)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          color: "var(--ink)",
          fontWeight: 500,
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function StepGoLive({ draft }: { draft: Draft }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: "20px 20px 8px",
          background: "rgba(255,255,255,0.5)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "0.78rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "rgba(31,41,55,0.45)",
          }}
        >
          Organização
        </p>
        <SummaryRow label="Nome" value={draft.orgName} />
        <SummaryRow label="CNPJ" value={draft.cnpj} />
        {(draft.city || draft.state) && (
          <SummaryRow
            label="Localização"
            value={[draft.city, draft.state].filter(Boolean).join(", ")}
          />
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: "20px 20px 8px",
          background: "rgba(255,255,255,0.5)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "0.78rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "rgba(31,41,55,0.45)",
          }}
        >
          Imóvel
        </p>
        <SummaryRow label="Endereço" value={draft.propertyAddress} />
        <SummaryRow label="Tipo" value={draft.propertyType} />
        {draft.propertyRent && (
          <SummaryRow label="Aluguel" value={`R$ ${draft.propertyRent}`} />
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: "20px 20px 8px",
          background: "rgba(255,255,255,0.5)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "0.78rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "rgba(31,41,55,0.45)",
          }}
        >
          Contrato
        </p>
        <SummaryRow label="Locatário" value={draft.renterName} />
        <SummaryRow label="CPF" value={draft.renterCpf} />
        {draft.contractStart && (
          <SummaryRow label="Início" value={draft.contractStart} />
        )}
        <SummaryRow
          label="Duração"
          value={
            draft.contractDuration ? `${draft.contractDuration} meses` : ""
          }
        />
        <SummaryRow
          label="Vencimento"
          value={draft.contractDueDay ? `Dia ${draft.contractDueDay}` : ""}
        />
      </div>

      {(draft.bankName || draft.bankAgency || draft.pixKey) && (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: "20px 20px 8px",
            background: "rgba(255,255,255,0.5)",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "0.78rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "rgba(31,41,55,0.45)",
            }}
          >
            Conta Bancária
          </p>
          {draft.bankName && (
            <SummaryRow label="Banco" value={draft.bankName} />
          )}
          {draft.bankAgency && (
            <SummaryRow label="Agência" value={draft.bankAgency} />
          )}
          {draft.bankAccount && (
            <SummaryRow label="Conta" value={draft.bankAccount} />
          )}
          {draft.pixKey && (
            <SummaryRow label="Chave PIX" value={draft.pixKey} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Errors = Partial<Record<keyof Draft, string>>;

function validateStep(step: number, draft: Draft): Errors {
  const e: Errors = {};

  if (step === 0) {
    if (!draft.orgName.trim()) e.orgName = "Nome da organização é obrigatório.";
    if (!draft.cnpj.trim()) {
      e.cnpj = "CNPJ é obrigatório.";
    } else if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(draft.cnpj)) {
      e.cnpj = "CNPJ inválido. Use o formato XX.XXX.XXX/XXXX-XX.";
    }
  }

  if (step === 1) {
    if (!draft.propertyAddress.trim())
      e.propertyAddress = "Endereço do imóvel é obrigatório.";
  }

  if (step === 2) {
    if (!draft.renterName.trim())
      e.renterName = "Nome do locatário é obrigatório.";
    if (!draft.renterCpf.trim()) {
      e.renterCpf = "CPF é obrigatório.";
    } else if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(draft.renterCpf)) {
      e.renterCpf = "CPF inválido. Use o formato XXX.XXX.XXX-XX.";
    }
    const dd = parseInt(draft.contractDueDay, 10);
    if (!draft.contractDueDay || isNaN(dd) || dd < 1 || dd > 31) {
      e.contractDueDay = "Informe um dia entre 1 e 31.";
    }
    const dur = parseInt(draft.contractDuration, 10);
    if (!draft.contractDuration || isNaN(dur) || dur < 1) {
      e.contractDuration = "Informe a duração em meses (mínimo 1).";
    }
  }

  return e;
}

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-label={`Passo ${current + 1} de ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === current ? 24 : 10,
            height: 10,
            borderRadius: 5,
            background:
              i < current
                ? "var(--accent)"
                : i === current
                  ? "var(--accent)"
                  : "rgba(31,41,55,0.15)",
            transition: "width 200ms ease, background 200ms ease",
            display: "inline-block",
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Errors>({});
  const [finishing, setFinishing] = useState(false);

  // Load saved draft on mount
  useEffect(() => {
    const saved = loadDraft();
    if (saved) setDraft(saved);
  }, []);

  function handleChange(field: keyof Draft, value: string) {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      saveDraft(next);
      return next;
    });
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handleNext() {
    const stepErrors = validateStep(step, draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    saveDraft(draft);
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setErrors({});
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSkip() {
    router.push("/dashboard");
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      // Placeholder API calls — replace with real implementation later
      console.log("[onboarding] POST /v1/organizations", {
        name: draft.orgName,
        cnpj: draft.cnpj,
        phone: draft.phone,
        city: draft.city,
        state: draft.state,
      });
      console.log("[onboarding] POST /v1/properties", {
        address: draft.propertyAddress,
        type: draft.propertyType,
        area: draft.propertyArea,
        rent: draft.propertyRent,
      });
      console.log("[onboarding] POST /v1/contracts", {
        renter_name: draft.renterName,
        renter_cpf: draft.renterCpf,
        renter_email: draft.renterEmail,
        renter_phone: draft.renterPhone,
        start_date: draft.contractStart,
        duration_months: draft.contractDuration,
        due_day: draft.contractDueDay,
      });
    } finally {
      clearDraft();
      router.push("/dashboard");
    }
  }

  const stepProps: StepProps = { draft, errors, onChange: handleChange };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        display: "grid",
        gap: 0,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <p
          style={{
            margin: "0 0 4px",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontSize: "0.72rem",
            color: "rgba(31,41,55,0.55)",
            fontWeight: 600,
          }}
        >
          REAL ESTATE OS
        </p>
        <h1
          style={{
            margin: "0 0 4px",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          Bem-vindo ao Real Estate OS
        </h1>
        <p
          style={{
            margin: 0,
            color: "rgba(31,41,55,0.6)",
            fontSize: "0.9rem",
          }}
        >
          Configure sua conta em alguns minutos
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ marginBottom: 28 }}>
        <StepDots total={STEPS.length} current={step} />
        <p
          style={{
            textAlign: "center",
            margin: "8px 0 0",
            fontSize: "0.78rem",
            color: "rgba(31,41,55,0.5)",
          }}
        >
          Passo {step + 1} de {STEPS.length}
        </p>
      </div>

      {/* Card */}
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 24,
          padding: 32,
          background: "var(--card)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 18px 60px rgba(122,86,45,0.08)",
        }}
      >
        {/* Step title */}
        <div style={{ marginBottom: 24 }}>
          <h2
            style={{
              margin: "0 0 4px",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            {STEPS[step].title}
          </h2>
          <p
            style={{
              margin: 0,
              color: "rgba(31,41,55,0.6)",
              fontSize: "0.875rem",
            }}
          >
            {STEPS[step].subtitle}
          </p>
        </div>

        {/* Step content */}
        {step === 0 && <StepCompany {...stepProps} />}
        {step === 1 && <StepProperty {...stepProps} />}
        {step === 2 && <StepContract {...stepProps} />}
        {step === 3 && <StepBank {...stepProps} />}
        {step === 4 && <StepGoLive draft={draft} />}

        {/* Navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 28,
          }}
        >
          {/* Back */}
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              style={{
                background: "transparent",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "10px 24px",
                cursor: "pointer",
                fontSize: "0.9rem",
                color: "var(--ink)",
                transition: "border-color 120ms",
              }}
            >
              Voltar
            </button>
          ) : (
            <div />
          )}

          {/* Next / Finish */}
          {isLastStep ? (
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={finishing}
              style={{
                background: "linear-gradient(135deg, var(--accent), #d98a53)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "12px 32px",
                cursor: finishing ? "not-allowed" : "pointer",
                fontSize: "0.95rem",
                fontWeight: 600,
                opacity: finishing ? 0.7 : 1,
                transition: "opacity 120ms",
              }}
            >
              {finishing ? "Iniciando…" : "Começar agora"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              style={{
                background: "linear-gradient(135deg, var(--accent), #d98a53)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "10px 28px",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: 600,
                transition: "opacity 120ms",
              }}
            >
              Próximo
            </button>
          )}
        </div>
      </div>

      {/* Skip / configure later */}
      {!isLastStep && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            type="button"
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "rgba(31,41,55,0.52)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              padding: "4px 8px",
            }}
          >
            Pular por agora
          </button>
        </div>
      )}
      {isLastStep && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            type="button"
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "rgba(31,41,55,0.52)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              padding: "4px 8px",
            }}
          >
            Configurar mais tarde
          </button>
        </div>
      )}
    </div>
  );
}
