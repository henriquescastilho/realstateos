"use client";

import React, { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar e-mail.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card auth-card" style={{ width: "100%", maxWidth: 420 }}>
      <div style={{ marginBottom: 28 }}>
        <p className="eyebrow">REAL ESTATE OS</p>
        <h2 style={{ margin: "4px 0 6px", fontSize: "1.6rem" }}>
          Recuperar senha
        </h2>
        <p
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "0.92rem",
          }}
        >
          Enviaremos um link para redefinir sua senha
        </p>
      </div>

      {sent ? (
        <div className="success-banner">
          <strong>E-mail enviado!</strong> Verifique sua caixa de entrada e siga
          as instruções.
        </div>
      ) : (
        <>
          {error && (
            <p className="error-banner" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="stack" noValidate>
            <Input
              label="E-mail cadastrado"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@exemplo.com"
            />

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              style={{ marginTop: 8 }}
            >
              Enviar link de recuperação
            </Button>
          </form>
        </>
      )}

      <p
        style={{
          marginTop: 20,
          textAlign: "center",
          fontSize: "0.88rem",
          color: "var(--text-muted)",
        }}
      >
        <Link href="/login" className="inline-link">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
