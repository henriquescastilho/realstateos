/**
 * Static registry of all 7 agents.
 * Used by the dashboard to show "alive" cards.
 */

export interface AgentRegistryEntry {
  id: string;
  name: string;
  description: string;
  taskType: string;
  schedule: string | null;
  icon: string;
}

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    id: "radar",
    name: "Radar",
    description: "Captura boletos de condomínio, IPTU e taxas via Gemini Vision.",
    taskType: "radar_capture",
    schedule: null, // sob demanda (email/whatsapp)
    icon: "radar",
  },
  {
    id: "maestro",
    name: "Maestro",
    description: "Compõe cobranças consolidadas a partir das despesas capturadas.",
    taskType: "maestro_compose",
    schedule: null, // evento: expense.captured
    icon: "compose",
  },
  {
    id: "cobrador",
    name: "Cobrador",
    description: "Envia boletos e lembretes de cobrança aos locatários.",
    taskType: "cobrador_collect",
    schedule: null, // evento: charges.composed
    icon: "payment",
  },
  {
    id: "sentinela",
    name: "Sentinela",
    description: "Monitora pagamentos recebidos e faz reconciliação automática.",
    taskType: "sentinela_watch",
    schedule: "0 */4 * * *", // a cada 4h
    icon: "shield",
  },
  {
    id: "pagador",
    name: "Pagador",
    description: "Paga contas do imóvel e calcula repasses aos proprietários.",
    taskType: "pagador_payout",
    schedule: "0 9 5,15 * *", // dia 5 e 15
    icon: "wallet",
  },
  {
    id: "contador",
    name: "Contador",
    description: "Gera extratos de repasse e envia NF simulada ao proprietário.",
    taskType: "contador_statement",
    schedule: null, // evento: payout.completed
    icon: "receipt",
  },
  {
    id: "orquestrador",
    name: "Orquestrador",
    description: "Encadeia agentes automaticamente por eventos de domínio.",
    taskType: "orchestrator",
    schedule: null, // sempre ativo
    icon: "hub",
  },
];
