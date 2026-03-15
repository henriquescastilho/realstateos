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

/* ── Agent Flow Diagram — real pipeline layout ── */

function AgentFlowDiagram() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 520;
    const H = 420;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const font = "system-ui, -apple-system, sans-serif";
    const accent = "#d98a53";
    const accentDim = "rgba(217,138,83,0.35)";
    const nodeBg = "rgba(25,22,18,0.9)";
    const nodeBorder = "rgba(100,80,50,0.3)";
    const textDim = "rgba(255,255,255,0.4)";
    const textBright = "rgba(255,255,255,0.85)";
    const nR = 28;

    // Layout: top row (4 agents), bottom row (2 agents + output)
    // Radar → Maestro → Cobrador → Sentinela
    //                                  ↓          ↓
    //                          Contador  ←  Pagador
    //                              ↓
    //                        Extrato + NF
    const topY = 70;
    const botY = 300;
    const gap = 120;
    const startX = 50;

    interface Node { name: string; icon: string; x: number; y: number; }

    const nodes: Node[] = [
      { name: "Radar",     icon: "R", x: startX,            y: topY },
      { name: "Maestro",   icon: "M", x: startX + gap,      y: topY },
      { name: "Cobrador",  icon: "C", x: startX + gap * 2,  y: topY },
      { name: "Sentinela", icon: "S", x: startX + gap * 3,  y: topY },
      { name: "Pagador",   icon: "P", x: startX + gap * 3,  y: botY },
      { name: "Contador",  icon: "C", x: startX + gap * 2,  y: botY },
    ];

    // Edges: [fromIdx, toIdx, eventLabel]
    const edges: [number, number, string][] = [
      [0, 1, "expense.captured"],
      [1, 2, "charges.composed"],
      [2, 3, "payment.received"],
      [3, 4, "reconciliado"],
      [4, 5, "bills_paid"],
    ];

    // Descriptions above top-row nodes
    const topLabels = [
      "Boleto chega",
      "Cobranças\ncompostas",
      "Boleto enviado\nao locatário",
      "Pagamento\nrecebido",
    ];

    let t = 0;
    let animId: number;

    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
      const headLen = 8;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx);
      ctx!.beginPath();
      ctx!.moveTo(x1, y1);
      ctx!.lineTo(x2, y2);
      ctx!.strokeStyle = color;
      ctx!.lineWidth = width;
      ctx!.stroke();
      // Arrowhead
      ctx!.beginPath();
      ctx!.moveTo(x2, y2);
      ctx!.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
      ctx!.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
      ctx!.closePath();
      ctx!.fillStyle = color;
      ctx!.fill();
    }

    function drawNode(n: Node, active: boolean) {
      ctx!.beginPath();
      ctx!.roundRect(n.x - nR, n.y - nR, nR * 2, nR * 2, 12);
      ctx!.fillStyle = active ? "rgba(35,28,22,0.98)" : nodeBg;
      ctx!.fill();
      ctx!.strokeStyle = active ? accent : nodeBorder;
      ctx!.lineWidth = active ? 1.5 : 1;
      ctx!.stroke();

      if (active) {
        const g = ctx!.createRadialGradient(n.x, n.y, 0, n.x, n.y, nR + 12);
        g.addColorStop(0, "rgba(217,138,83,0.12)");
        g.addColorStop(1, "rgba(217,138,83,0)");
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, nR + 12, 0, Math.PI * 2);
        ctx!.fillStyle = g;
        ctx!.fill();
      }

      ctx!.fillStyle = active ? accent : accentDim;
      ctx!.font = `bold 15px ${font}`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText(n.icon, n.x, n.y - 4);

      ctx!.fillStyle = active ? textBright : textDim;
      ctx!.font = `500 9px ${font}`;
      ctx!.fillText(n.name, n.x, n.y + 13);
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      // Top-row description labels
      for (let i = 0; i < topLabels.length; i++) {
        const n = nodes[i];
        ctx!.fillStyle = "rgba(255,255,255,0.3)";
        ctx!.font = `400 9px ${font}`;
        ctx!.textAlign = "center";
        const lines = topLabels[i].split("\n");
        lines.forEach((line, li) => {
          ctx!.fillText(line, n.x, n.y - nR - 16 + li * 12);
        });
        // Small down arrow
        drawArrow(n.x, n.y - nR - 4, n.x, n.y - nR + 2, "rgba(255,255,255,0.15)", 1);
      }

      // Draw edges with event labels
      for (const [fi, ti, label] of edges) {
        const f = nodes[fi];
        const to = nodes[ti];
        const fx = f.x + nR;
        const fy = f.y;
        let tx = to.x - nR;
        let ty = to.y;

        // Vertical edges
        if (fi === 3 && ti === 4) {
          drawArrow(f.x, f.y + nR, to.x, to.y - nR, accentDim, 1);
          ctx!.fillStyle = "rgba(255,255,255,0.25)";
          ctx!.font = `400 8px ${font}`;
          ctx!.textAlign = "left";
          ctx!.fillText(label, f.x + 6, (f.y + to.y) / 2);
          continue;
        }
        if (fi === 4 && ti === 5) {
          drawArrow(to.x + nR, to.y, f.x - nR, f.y, accentDim, 1);
          ctx!.fillStyle = "rgba(255,255,255,0.25)";
          ctx!.font = `400 8px ${font}`;
          ctx!.textAlign = "center";
          ctx!.fillText(label, (f.x + to.x) / 2, to.y - nR - 6);
          continue;
        }

        drawArrow(fx, fy, tx, ty, accentDim, 1);

        // Event label centered on edge
        ctx!.fillStyle = "rgba(255,255,255,0.25)";
        ctx!.font = `400 8px ${font}`;
        ctx!.textAlign = "center";
        ctx!.fillText(label, (f.x + to.x) / 2, fy - nR - 6);
      }

      // Output label below Contador
      const contNode = nodes[5];
      drawArrow(contNode.x, contNode.y + nR, contNode.x, contNode.y + nR + 28, accentDim, 1);
      ctx!.fillStyle = "rgba(255,255,255,0.35)";
      ctx!.font = `500 10px ${font}`;
      ctx!.textAlign = "center";
      ctx!.fillText("Extrato + NF", contNode.x, contNode.y + nR + 44);
      ctx!.fillText("enviados ao proprietário", contNode.x, contNode.y + nR + 58);

      // Animated pulse traveling along the path
      // Path: 0→1→2→3→4→5 (6 nodes, 5 edges)
      const totalSegs = 5;
      const progress = t % totalSegs;
      const segIdx = Math.floor(progress);
      const segFrac = progress - segIdx;

      const pathOrder = [[0,1],[1,2],[2,3],[3,4],[4,5]];
      const [si, ei] = pathOrder[segIdx];
      const sn = nodes[si];
      const en = nodes[ei];
      const px = sn.x + (en.x - sn.x) * segFrac;
      const py = sn.y + (en.y - sn.y) * segFrac;

      const pg = ctx!.createRadialGradient(px, py, 0, px, py, 16);
      pg.addColorStop(0, "rgba(217,138,83,0.65)");
      pg.addColorStop(1, "rgba(217,138,83,0)");
      ctx!.beginPath();
      ctx!.arc(px, py, 16, 0, Math.PI * 2);
      ctx!.fillStyle = pg;
      ctx!.fill();

      // Draw nodes (after edges so they're on top)
      for (let i = 0; i < nodes.length; i++) {
        const isActive = i === si || i === ei;
        drawNode(nodes[i], isActive);
      }

      // Orquestrador badge at bottom center
      ctx!.fillStyle = "rgba(217,138,83,0.1)";
      ctx!.beginPath();
      ctx!.roundRect(W / 2 - 120, H - 30, 240, 24, 8);
      ctx!.fill();
      ctx!.fillStyle = "rgba(255,255,255,0.4)";
      ctx!.font = `500 9px ${font}`;
      ctx!.textAlign = "center";
      ctx!.fillText("Orquestrador — escuta eventos e dispara o próximo agente", W / 2, H - 14);

      t += 0.008;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="lp-flow-canvas"
      style={{ width: 520, height: 420 }}
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
