"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function LandingPage() {
  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <span className="lp-logo-mark" />
            <span>Real Estate OS</span>
          </div>
          <Link href="/login" className="lp-nav-cta">
            Entrar
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <p className="lp-eyebrow">Gestão Imobiliária Autônoma</p>
          <h1 className="lp-h1">
            Sete agentes de IA.<br />
            Um portfólio inteiro<br />
            no piloto automático.
          </h1>
          <p className="lp-hero-sub">
            Do boleto que chega por WhatsApp até o extrato na caixa de entrada do
            proprietário — tudo acontece sem intervenção humana. Captura, cobrança,
            reconciliação, repasse e prestação de contas em cadeia.
          </p>
          <div className="lp-hero-actions">
            <Link href="/login" className="lp-btn-primary">
              Acessar plataforma
            </Link>
            <Link href="/register" className="lp-btn-ghost">
              Criar conta
            </Link>
          </div>
        </div>
        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-orbit">
            {[
              { name: "Radar", icon: "R", delay: "0s" },
              { name: "Maestro", icon: "M", delay: "0.8s" },
              { name: "Cobrador", icon: "C", delay: "1.6s" },
              { name: "Sentinela", icon: "S", delay: "2.4s" },
              { name: "Pagador", icon: "P", delay: "3.2s" },
              { name: "Contador", icon: "T", delay: "4.0s" },
            ].map((agent) => (
              <div
                key={agent.name}
                className="lp-orbit-node"
                style={{ animationDelay: agent.delay }}
              >
                <span className="lp-orbit-letter">{agent.icon}</span>
                <span className="lp-orbit-label">{agent.name}</span>
              </div>
            ))}
            <div className="lp-orbit-center">
              <span className="lp-orbit-letter">O</span>
              <span className="lp-orbit-label">Orquestrador</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problema ── */}
      <section className="lp-section">
        <div className="lp-container">
          <div className="lp-split">
            <div className="lp-split-left">
              <p className="lp-eyebrow">O Problema</p>
              <h2 className="lp-h2">
                Administradoras ainda operam no manual.
              </h2>
            </div>
            <div className="lp-split-right">
              <p className="lp-body">
                Boletos chegam por e-mail e WhatsApp. Alguém abre, lê, digita,
                lança. Cobranças são montadas em planilhas. Pagamentos são
                reconciliados um a um. O repasse exige calcular receita menos
                despesa menos taxa — tudo à mão. Extratos saem em Word e são
                enviados individualmente.
              </p>
              <p className="lp-body" style={{ marginTop: 16 }}>
                O resultado: atrasos, erros financeiros, proprietários
                insatisfeitos e equipes sobrecarregadas com trabalho que uma
                máquina faz melhor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Solução — Fluxo de agentes ── */}
      <section className="lp-section lp-section-dark">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p className="lp-eyebrow">A Solução</p>
            <h2 className="lp-h2" style={{ maxWidth: 620, margin: "0 auto" }}>
              Uma cadeia autônoma do boleto ao extrato.
            </h2>
          </div>
          <div className="lp-pipeline">
            <PipelineStep
              number="01"
              agent="Radar"
              title="Captura"
              desc="Boleto chega por e-mail ou WhatsApp. O Gemini Vision extrai valor, vencimento, código de barras e identifica o imóvel."
            />
            <PipelineArrow />
            <PipelineStep
              number="02"
              agent="Maestro"
              title="Composição"
              desc="Consolida aluguel + condomínio + IPTU + taxas em uma cobrança única para cada locatário."
            />
            <PipelineArrow />
            <PipelineStep
              number="03"
              agent="Cobrador"
              title="Cobrança"
              desc="Gera boleto bancário, envia por e-mail e WhatsApp, e agenda lembretes automáticos."
            />
            <PipelineArrow />
            <PipelineStep
              number="04"
              agent="Sentinela"
              title="Reconciliação"
              desc="Compara cada pagamento recebido com a cobrança original. Detecta divergências e parciais."
            />
            <PipelineArrow />
            <PipelineStep
              number="05"
              agent="Pagador"
              title="Repasse"
              desc="Quita contas do imóvel no dia 5. Calcula e registra o repasse ao proprietário no dia 15."
            />
            <PipelineArrow />
            <PipelineStep
              number="06"
              agent="Contador"
              title="Prestação de contas"
              desc="Gera extrato detalhado com todas as receitas e deduções, emite NF simulada e envia ao proprietário."
            />
          </div>
          <div className="lp-pipeline-orq">
            <div className="lp-orq-line" />
            <div className="lp-orq-badge">
              Orquestrador — escuta eventos e dispara o próximo agente automaticamente
            </div>
          </div>
        </div>
      </section>

      {/* ── Decisão por confiança ── */}
      <section className="lp-section">
        <div className="lp-container">
          <div className="lp-split">
            <div className="lp-split-left">
              <p className="lp-eyebrow">Controle</p>
              <h2 className="lp-h2">
                Automação com guardrails.
              </h2>
            </div>
            <div className="lp-split-right">
              <p className="lp-body">
                Cada agente retorna um índice de confiança. O sistema decide
                sozinho o que fazer:
              </p>
              <div className="lp-confidence-grid">
                <ConfidenceCard
                  level="alta"
                  range="≥ 85%"
                  label="Execução automática"
                  desc="A ação é executada sem intervenção. O gestor pode revisar depois."
                  color="var(--color-success)"
                  bg="var(--color-success-bg)"
                />
                <ConfidenceCard
                  level="média"
                  range="50% — 84%"
                  label="Execução com revisão"
                  desc="A ação é executada, mas fica marcada para revisão obrigatória."
                  color="var(--color-warning)"
                  bg="var(--color-warning-bg)"
                />
                <ConfidenceCard
                  level="baixa"
                  range="< 50%"
                  label="Escalação humana"
                  desc="A tarefa é pausada e enviada para aprovação manual do gestor."
                  color="var(--color-danger)"
                  bg="var(--color-danger-bg)"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Números ── */}
      <section className="lp-section lp-section-accent">
        <div className="lp-container">
          <div className="lp-stats-grid">
            <div className="lp-stat">
              <span className="lp-stat-value">7</span>
              <span className="lp-stat-label">Agentes especializados</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">4</span>
              <span className="lp-stat-label">Eventos de domínio encadeados</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">0</span>
              <span className="lp-stat-label">Intervenções manuais no fluxo padrão</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">24/7</span>
              <span className="lp-stat-label">Monitoramento contínuo</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stack ── */}
      <section className="lp-section">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p className="lp-eyebrow">Tecnologia</p>
            <h2 className="lp-h2">Construído para produção.</h2>
          </div>
          <div className="lp-tech-grid">
            {[
              { name: "TypeScript", desc: "Backend e frontend type-safe" },
              { name: "PostgreSQL + pgvector", desc: "Relacional + busca vetorial para IA" },
              { name: "BullMQ + Redis", desc: "Filas e agendamento de agentes" },
              { name: "Gemini 2.0 Flash", desc: "Extração de boletos por visão computacional" },
              { name: "Next.js 16", desc: "Frontend com App Router e React 19" },
              { name: "Drizzle ORM", desc: "Migrações e queries type-safe" },
            ].map((tech) => (
              <div key={tech.name} className="lp-tech-card">
                <strong>{tech.name}</strong>
                <p className="muted-text" style={{ margin: "6px 0 0" }}>{tech.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="lp-section lp-section-dark" style={{ textAlign: "center" }}>
        <div className="lp-container">
          <h2 className="lp-h2" style={{ maxWidth: 540, margin: "0 auto 24px" }}>
            Pare de administrar planilhas. Comece a administrar imóveis.
          </h2>
          <p className="lp-body" style={{ maxWidth: 480, margin: "0 auto 40px" }}>
            Crie uma conta e veja os agentes trabalhando em tempo real no seu portfólio.
          </p>
          <div className="lp-hero-actions" style={{ justifyContent: "center" }}>
            <Link href="/register" className="lp-btn-primary">
              Começar agora
            </Link>
            <Link href="/login" className="lp-btn-ghost">
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div className="lp-logo">
              <span className="lp-logo-mark" />
              <span>Real Estate OS</span>
            </div>
            <p className="muted-text" style={{ margin: 0 }}>
              Gestão imobiliária autônoma com agentes de IA.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Sub-components ── */

function PipelineStep({
  number,
  agent,
  title,
  desc,
}: {
  number: string;
  agent: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="lp-pipe-step">
      <span className="lp-pipe-number">{number}</span>
      <span className="lp-pipe-agent">{agent}</span>
      <strong className="lp-pipe-title">{title}</strong>
      <p className="lp-pipe-desc">{desc}</p>
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="lp-pipe-arrow" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12h14m-7-7 7 7-7 7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ConfidenceCard({
  level,
  range,
  label,
  desc,
  color,
  bg,
}: {
  level: string;
  range: string;
  label: string;
  desc: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="lp-conf-card" style={{ borderColor: bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span
          className="lp-conf-dot"
          style={{ background: color }}
        />
        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{label}</span>
      </div>
      <span
        style={{
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: 999,
          background: bg,
          color,
          fontSize: "0.78rem",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Confiança {range}
      </span>
      <p className="muted-text" style={{ margin: 0 }}>{desc}</p>
    </div>
  );
}
