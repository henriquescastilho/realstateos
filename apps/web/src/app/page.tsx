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
            <a href="mailto:henrique009.hsc@gmail.com?subject=Real Estate OS — Contato" className="lp-btn-ghost">
              Entre em contato
            </a>
          </div>
        </div>
        <div className="lp-hero-visual" aria-hidden="true">
          <AgentFlowDiagram />
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
            Veja os agentes trabalhando em tempo real no seu portfólio.
          </p>
          <div className="lp-hero-actions" style={{ justifyContent: "center" }}>
            <a href="mailto:henrique009.hsc@gmail.com?subject=Real Estate OS — Quero começar" className="lp-btn-primary">
              Entre em contato
            </a>
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

/* ── Agent Flow Diagram ── */

const AGENTS = [
  { name: "Radar", icon: "R" },
  { name: "Maestro", icon: "M" },
  { name: "Cobrador", icon: "C" },
  { name: "Sentinela", icon: "S" },
  { name: "Pagador", icon: "P" },
  { name: "Contador", icon: "C" },
];

function AgentFlowDiagram() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 400;
    const H = 400;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2;
    const radius = 140;
    const nodeR = 30;

    // Node positions in a circle
    const nodes = AGENTS.map((a, i) => {
      const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
      return { ...a, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });

    let t = 0;
    let animId: number;

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      // Draw connection lines (edges between consecutive nodes through center)
      for (let i = 0; i < nodes.length; i++) {
        const from = nodes[i];
        const next = nodes[(i + 1) % nodes.length];

        ctx!.beginPath();
        ctx!.moveTo(from.x, from.y);
        ctx!.lineTo(next.x, next.y);
        ctx!.strokeStyle = "rgba(180, 120, 60, 0.15)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      // Draw lines from each node to center
      for (const node of nodes) {
        ctx!.beginPath();
        ctx!.moveTo(node.x, node.y);
        ctx!.lineTo(cx, cy);
        ctx!.strokeStyle = "rgba(180, 120, 60, 0.08)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      // Animated pulse traveling between nodes
      const totalSegments = nodes.length;
      const segProgress = (t % totalSegments);
      const segIndex = Math.floor(segProgress);
      const segFrac = segProgress - segIndex;

      const fromNode = nodes[segIndex];
      const toNode = nodes[(segIndex + 1) % nodes.length];
      const pulseX = fromNode.x + (toNode.x - fromNode.x) * segFrac;
      const pulseY = fromNode.y + (toNode.y - fromNode.y) * segFrac;

      // Glowing pulse
      const pulseGrad = ctx!.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, 18);
      pulseGrad.addColorStop(0, "rgba(217, 138, 83, 0.7)");
      pulseGrad.addColorStop(1, "rgba(217, 138, 83, 0)");
      ctx!.beginPath();
      ctx!.arc(pulseX, pulseY, 18, 0, Math.PI * 2);
      ctx!.fillStyle = pulseGrad;
      ctx!.fill();

      // Trail highlight on active edge
      ctx!.beginPath();
      ctx!.moveTo(fromNode.x, fromNode.y);
      ctx!.lineTo(pulseX, pulseY);
      ctx!.strokeStyle = "rgba(217, 138, 83, 0.5)";
      ctx!.lineWidth = 2;
      ctx!.stroke();

      // Draw outer nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isActive = i === segIndex || i === (segIndex + 1) % nodes.length;

        // Node background
        ctx!.beginPath();
        ctx!.roundRect(node.x - nodeR, node.y - nodeR, nodeR * 2, nodeR * 2, 14);
        ctx!.fillStyle = isActive ? "rgba(30, 25, 20, 0.95)" : "rgba(25, 22, 18, 0.85)";
        ctx!.fill();
        ctx!.strokeStyle = isActive ? "rgba(217, 138, 83, 0.6)" : "rgba(100, 80, 50, 0.25)";
        ctx!.lineWidth = 1;
        ctx!.stroke();

        // Letter
        ctx!.fillStyle = isActive ? "#d98a53" : "rgba(217, 138, 83, 0.6)";
        ctx!.font = "bold 16px system-ui, -apple-system, sans-serif";
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText(node.icon, node.x, node.y - 5);

        // Label
        ctx!.fillStyle = isActive ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)";
        ctx!.font = "500 8px system-ui, -apple-system, sans-serif";
        ctx!.fillText(node.name, node.x, node.y + 12);
      }

      // Draw center (Orquestrador)
      const centerR = 38;
      const centerGrad = ctx!.createLinearGradient(cx - centerR, cy - centerR, cx + centerR, cy + centerR);
      centerGrad.addColorStop(0, "#c87f4a");
      centerGrad.addColorStop(1, "#d98a53");
      ctx!.beginPath();
      ctx!.roundRect(cx - centerR, cy - centerR, centerR * 2, centerR * 2, 18);
      ctx!.fillStyle = centerGrad;
      ctx!.fill();

      // Center glow
      const glowGrad = ctx!.createRadialGradient(cx, cy + centerR, 0, cx, cy + centerR, 50);
      glowGrad.addColorStop(0, "rgba(217, 138, 83, 0.25)");
      glowGrad.addColorStop(1, "rgba(217, 138, 83, 0)");
      ctx!.beginPath();
      ctx!.arc(cx, cy + centerR, 50, 0, Math.PI * 2);
      ctx!.fillStyle = glowGrad;
      ctx!.fill();

      // Center letter
      ctx!.fillStyle = "#fff";
      ctx!.font = "bold 22px system-ui, -apple-system, sans-serif";
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText("O", cx, cy - 5);

      // Center label
      ctx!.fillStyle = "rgba(255,255,255,0.8)";
      ctx!.font = "500 9px system-ui, -apple-system, sans-serif";
      ctx!.fillText("Orquestrador", cx, cy + 14);

      t += 0.012;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="lp-flow-canvas"
      style={{ width: 400, height: 400 }}
    />
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
