"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password, remember });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card auth-card" style={{ width: "100%", maxWidth: 440 }}>
      <div style={{ marginBottom: 28 }}>
        <p className="eyebrow">REAL ESTATE OS</p>
        <h2 style={{ margin: "4px 0 6px", fontSize: "1.6rem" }}>Entrar</h2>
        <p
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "0.92rem",
          }}
        >
          Gerencie seu portfólio imobiliário
        </p>
      </div>

      {error && (
        <p className="error-banner" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="stack" noValidate>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="voce@exemplo.com"
        />

        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.88rem",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: "auto", padding: 0, borderRadius: 4 }}
            />
            Lembrar-me
          </label>
          <Link
            href="/forgot-password"
            className="inline-link"
            style={{ fontSize: "0.88rem" }}
          >
            Esqueci a senha
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={loading}
          style={{ marginTop: 8 }}
        >
          Entrar
        </Button>
      </form>

      <p
        style={{
          marginTop: 20,
          textAlign: "center",
          fontSize: "0.88rem",
          color: "var(--text-muted)",
        }}
      >
        Quer saber mais?{" "}
        <a href="mailto:henrique009.hsc@gmail.com?subject=Real Estate OS — Contato" className="inline-link">
          Entre em contato
        </a>
      </p>
    </div>
  );
}
