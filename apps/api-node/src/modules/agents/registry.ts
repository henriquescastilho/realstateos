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
    description: "Lê boletos de condomínio, IPTU e taxas que chegam por e-mail ou WhatsApp e registra os valores automaticamente.",
    taskType: "radar_capture",
    schedule: "Automático — quando chega um documento",
    icon: "radar",
  },
  {
    id: "maestro",
    name: "Maestro",
    description: "Junta todas as despesas do imóvel e monta a cobrança mensal do inquilino com aluguel + encargos.",
    taskType: "maestro_compose",
    schedule: "Automático — após captura de despesas",
    icon: "compose",
  },
  {
    id: "cobrador",
    name: "Cobrador",
    description: "Gera o boleto do inquilino e envia lembretes de cobrança por e-mail e WhatsApp até o pagamento.",
    taskType: "cobrador_collect",
    schedule: "Automático — após composição da cobrança",
    icon: "payment",
  },
  {
    id: "sentinela",
    name: "Sentinela",
    description: "Confere os pagamentos recebidos no banco e marca automaticamente quais cobranças foram pagas.",
    taskType: "sentinela_watch",
    schedule: "A cada 4 horas",
    icon: "shield",
  },
  {
    id: "pagador",
    name: "Pagador",
    description: "Paga as contas do imóvel (condomínio, IPTU) e calcula o repasse líquido para o proprietário.",
    taskType: "pagador_payout",
    schedule: "Dias 5 e 15 de cada mês",
    icon: "wallet",
  },
  {
    id: "contador",
    name: "Contador",
    description: "Gera o extrato de repasse detalhado e envia ao proprietário com todos os lançamentos do mês.",
    taskType: "contador_statement",
    schedule: "Automático — após repasse concluído",
    icon: "receipt",
  },
  {
    id: "orquestrador",
    name: "Orquestrador",
    description: "Coordena todos os agentes acima, garantindo que cada etapa aconteça na ordem certa, do boleto ao repasse.",
    taskType: "orchestrator",
    schedule: "Sempre ativo",
    icon: "hub",
  },
];
