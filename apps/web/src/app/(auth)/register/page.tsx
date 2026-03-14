"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    org_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (form.password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        org_name: form.org_name,
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card auth-card" style={{ width: "100%", maxWidth: 480 }}>
      <div style={{ marginBottom: 28 }}>
        <p className="eyebrow">REAL ESTATE OS</p>
        <h2 style={{ margin: "4px 0 6px", fontSize: "1.6rem" }}>Criar conta</h2>
        <p
          style={{
            margin: 0,
            color: "rgba(31,41,55,0.62)",
            fontSize: "0.92rem",
          }}
        >
          Comece a gerenciar seu portfólio hoje
        </p>
      </div>

      {error && (
        <p className="error-banner" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="stack" noValidate>
        <Input
          label="Nome completo"
          type="text"
          autoComplete="name"
          value={form.name}
          onChange={set("name")}
          required
          placeholder="João Silva"
        />

        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          required
          placeholder="voce@exemplo.com"
        />

        <Input
          label="Nome da empresa / organização"
          type="text"
          value={form.org_name}
          onChange={set("org_name")}
          required
          placeholder="Imobiliária ABC"
          hint="Será o nome do seu workspace"
        />

        <div className="split-fields">
          <Input
            label="Senha"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            required
            placeholder="Mín. 8 caracteres"
          />
          <Input
            label="Confirmar senha"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set("confirm")}
            required
            placeholder="Repita a senha"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={loading}
          style={{ marginTop: 8 }}
        >
          Criar conta
        </Button>
      </form>

      <p
        style={{
          marginTop: 20,
          textAlign: "center",
          fontSize: "0.88rem",
          color: "rgba(31,41,55,0.62)",
        }}
      >
        Já tem conta?{" "}
        <Link href="/login" className="inline-link">
          Entrar
        </Link>
      </p>
    </div>
  );
}
