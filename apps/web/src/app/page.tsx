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
          <p className="lp-eyebrow">Para administradoras de imóveis</p>
          <h1 className="lp-h1">
            Chega de digitar boleto.<br />
            O sistema faz por você.
          </h1>
          <p className="lp-hero-sub">
            Boletos lidos e lançados sozinhos. Cobranças enviadas no prazo.
            Pagamentos conferidos automaticamente. Extrato pronto e entregue
            ao proprietário sem você precisar abrir uma planilha.
          </p>
          <div className="lp-hero-actions">
            <a href="mailto:henrique@paymentsline.com?subject=Quero conhecer o Real Estate OS" className="lp-btn-primary">
              Quero conhecer
            </a>
            <Link href="/login" className="lp-btn-ghost">
              Já tenho conta
            </Link>
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
              <p className="lp-eyebrow">O dia a dia</p>
              <h2 className="lp-h2">
                Você ainda faz tudo isso na mão?
              </h2>
            </div>
            <div className="lp-split-right">
              <p className="lp-body">
                Abrir e-mail, ler boleto, digitar valor, montar cobrança,
                conferir quem pagou, calcular repasse, gerar extrato e enviar
                pro proprietário. Todo mês. Para cada imóvel. Um por um.
              </p>
              <p className="lp-body" style={{ marginTop: 16 }}>
                Isso gera atrasos, erros e proprietários cobrando explicações.
                Sua equipe perde horas com trabalho que o sistema pode resolver sozinho.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Solução — Fluxo de agentes ── */}
      <section className="lp-section lp-section-dark">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p className="lp-eyebrow">Como funciona</p>
            <h2 className="lp-h2" style={{ maxWidth: 620, margin: "0 auto" }}>
              Seis etapas. Todas automáticas.
            </h2>
          </div>
          <div className="lp-pipeline">
            <PipelineStep
              number="01"
              agent="Radar"
              title="Captura"
              desc="O boleto chega por e-mail e o sistema lê sozinho: valor, vencimento, código de barras e qual é o imóvel."
            />
            <PipelineArrow />
            <PipelineStep
              number="02"
              agent="Maestro"
              title="Composição"
              desc="Junta aluguel, condomínio, IPTU e taxas em uma cobrança só para cada inquilino."
            />
            <PipelineArrow />
            <PipelineStep
              number="03"
              agent="Cobrador"
              title="Cobrança"
              desc="Gera o boleto e envia por e-mail ao inquilino. Se não pagar, manda lembrete sozinho."
            />
            <PipelineArrow />
            <PipelineStep
              number="04"
              agent="Sentinela"
              title="Reconciliação"
              desc="Confere cada pagamento que entra e avisa se o valor está errado ou incompleto."
            />
            <PipelineArrow />
            <PipelineStep
              number="05"
              agent="Pagador"
              title="Repasse"
              desc="Paga as contas do imóvel e calcula quanto o proprietário tem pra receber."
            />
            <PipelineArrow />
            <PipelineStep
              number="06"
              agent="Contador"
              title="Prestação de contas"
              desc="Monta o extrato com tudo que entrou e saiu, e envia direto pro proprietário."
            />
          </div>
          <div className="lp-pipeline-orq">
            <div className="lp-orq-line" />
            <div className="lp-orq-badge">
              Tudo conectado: uma etapa termina e a próxima começa sozinha
            </div>
          </div>
        </div>
      </section>

      {/* ── Decisão por confiança ── */}
      <section className="lp-section">
        <div className="lp-container">
          <div className="lp-split">
            <div className="lp-split-left">
              <p className="lp-eyebrow">Segurança</p>
              <h2 className="lp-h2">
                Você continua no controle.
              </h2>
            </div>
            <div className="lp-split-right">
              <p className="lp-body">
                O sistema só age sozinho quando tem certeza. Se tiver dúvida,
                pede sua aprovação antes de continuar:
              </p>
              <div className="lp-confidence-grid">
                <ConfidenceCard
                  level="alta"
                  range="≥ 95%"
                  label="Faz sozinho"
                  desc="O sistema tem certeza e resolve sem precisar te incomodar."
                  color="var(--color-success)"
                  bg="var(--color-success-bg)"
                />
                <ConfidenceCard
                  level="média"
                  range="50% a 94%"
                  label="Faz e avisa você"
                  desc="Resolve mas deixa marcado pra você dar uma olhada depois."
                  color="var(--color-warning)"
                  bg="var(--color-warning-bg)"
                />
                <ConfidenceCard
                  level="baixa"
                  range="< 50%"
                  label="Pergunta antes"
                  desc="Não tem certeza? Para tudo e pede sua aprovação."
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
              <span className="lp-stat-label">Agentes de IA trabalhando por você</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">100%</span>
              <span className="lp-stat-label">Do fluxo financeiro automatizado</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">0</span>
              <span className="lp-stat-label">Planilhas necessárias</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">24/7</span>
              <span className="lp-stat-label">Operação contínua</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Benefícios ── */}
      <section className="lp-section">
        <div className="lp-container">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p className="lp-eyebrow">Por que usar</p>
            <h2 className="lp-h2">O que muda na sua administradora.</h2>
          </div>
          <div className="lp-tech-grid">
            {[
              { name: "Menos erros", desc: "O sistema não digita errado, não esquece e não atrasa" },
              { name: "Mais tempo livre", desc: "Sua equipe para de fazer trabalho repetitivo e foca no que importa" },
              { name: "Proprietário satisfeito", desc: "Extrato entregue no prazo, todo mês, sem você precisar lembrar" },
              { name: "Tudo registrado", desc: "Cada ação fica salva com data, hora e valor para consulta" },
              { name: "Funciona 24 horas", desc: "O sistema trabalha de madrugada, feriado e fim de semana" },
              { name: "Você no controle", desc: "Acompanhe tudo pelo painel e aprove o que precisar" },
            ].map((item) => (
              <div key={item.name} className="lp-tech-card">
                <strong>{item.name}</strong>
                <p className="muted-text" style={{ margin: "6px 0 0" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="lp-section lp-section-dark" style={{ textAlign: "center" }}>
        <div className="lp-container">
          <h2 className="lp-h2" style={{ maxWidth: 540, margin: "0 auto 24px" }}>
            Quer ver funcionando na sua administradora?
          </h2>
          <p className="lp-body" style={{ maxWidth: 480, margin: "0 auto 40px" }}>
            Mande um e-mail e a gente te mostra como o sistema funciona
            com os seus imóveis.
          </p>
          <div className="lp-hero-actions" style={{ justifyContent: "center" }}>
            <a href="mailto:henrique@paymentsline.com?subject=Quero conhecer o Real Estate OS" className="lp-btn-primary">
              Quero conhecer
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
              Desenvolvido por DME Technology
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

      // Draw lines from center to each agent
      for (const node of nodes) {
        ctx!.beginPath();
        ctx!.moveTo(cx, cy);
        ctx!.lineTo(node.x, node.y);
        ctx!.strokeStyle = "rgba(180, 120, 60, 0.12)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      // Animation: Orquestrador sends a pulse to one agent at a time
      // Each cycle: pulse goes OUT from center to agent, then next agent
      const totalAgents = nodes.length;
      const cycleLength = 1; // 1 unit per agent
      const totalCycle = totalAgents * cycleLength;
      const progress = t % totalCycle;
      const activeAgent = Math.floor(progress / cycleLength);
      const pulseFrac = (progress % cycleLength) / cycleLength;

      const targetNode = nodes[activeAgent];

      // Pulse position: from center to target agent
      const pulseX = cx + (targetNode.x - cx) * pulseFrac;
      const pulseY = cy + (targetNode.y - cy) * pulseFrac;

      // Glowing trail from center to pulse
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.lineTo(pulseX, pulseY);
      ctx!.strokeStyle = "rgba(217, 138, 83, 0.5)";
      ctx!.lineWidth = 2.5;
      ctx!.stroke();

      // Glowing pulse ball
      const pulseGrad = ctx!.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, 20);
      pulseGrad.addColorStop(0, "rgba(217, 138, 83, 0.8)");
      pulseGrad.addColorStop(1, "rgba(217, 138, 83, 0)");
      ctx!.beginPath();
      ctx!.arc(pulseX, pulseY, 20, 0, Math.PI * 2);
      ctx!.fillStyle = pulseGrad;
      ctx!.fill();

      // Impact glow on agent when pulse arrives (last 20% of travel)
      if (pulseFrac > 0.8) {
        const impactIntensity = (pulseFrac - 0.8) / 0.2;
        const impactGrad = ctx!.createRadialGradient(targetNode.x, targetNode.y, 0, targetNode.x, targetNode.y, nodeR + 20);
        impactGrad.addColorStop(0, `rgba(217, 138, 83, ${0.3 * impactIntensity})`);
        impactGrad.addColorStop(1, "rgba(217, 138, 83, 0)");
        ctx!.beginPath();
        ctx!.arc(targetNode.x, targetNode.y, nodeR + 20, 0, Math.PI * 2);
        ctx!.fillStyle = impactGrad;
        ctx!.fill();
      }

      // Draw agent nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isActive = i === activeAgent;

        // Node background
        ctx!.beginPath();
        ctx!.roundRect(node.x - nodeR, node.y - nodeR, nodeR * 2, nodeR * 2, 14);
        ctx!.fillStyle = isActive ? "rgba(30, 25, 20, 0.95)" : "rgba(25, 22, 18, 0.85)";
        ctx!.fill();
        ctx!.strokeStyle = isActive ? "rgba(217, 138, 83, 0.7)" : "rgba(100, 80, 50, 0.25)";
        ctx!.lineWidth = isActive ? 1.5 : 1;
        ctx!.stroke();

        // Letter
        ctx!.fillStyle = isActive ? "#d98a53" : "rgba(217, 138, 83, 0.5)";
        ctx!.font = "bold 16px system-ui, -apple-system, sans-serif";
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText(node.icon, node.x, node.y - 5);

        // Label
        ctx!.fillStyle = isActive ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)";
        ctx!.font = "500 9px system-ui, -apple-system, sans-serif";
        ctx!.fillText(node.name, node.x, node.y + 13);
      }

      // Draw center (Orquestrador) on top
      const centerR = 38;
      const centerGrad = ctx!.createLinearGradient(cx - centerR, cy - centerR, cx + centerR, cy + centerR);
      centerGrad.addColorStop(0, "#c87f4a");
      centerGrad.addColorStop(1, "#d98a53");
      ctx!.beginPath();
      ctx!.roundRect(cx - centerR, cy - centerR, centerR * 2, centerR * 2, 18);
      ctx!.fillStyle = centerGrad;
      ctx!.fill();

      // Center glow
      const glowGrad = ctx!.createRadialGradient(cx, cy, centerR * 0.5, cx, cy, centerR + 16);
      glowGrad.addColorStop(0, "rgba(217, 138, 83, 0.15)");
      glowGrad.addColorStop(1, "rgba(217, 138, 83, 0)");
      ctx!.beginPath();
      ctx!.arc(cx, cy, centerR + 16, 0, Math.PI * 2);
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

      t += 0.015;
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
