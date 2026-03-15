# Real Estate OS

**Plataforma de gestão imobiliária com orquestração autônoma de agentes de IA.**

O Real Estate OS automatiza o ciclo completo de administração de imóveis — da captura de boletos até o repasse ao proprietário — usando 7 agentes especializados que trabalham em cadeia, sem intervenção humana. Tudo em um sistema multi-tenant pronto para múltiplas imobiliárias.

---

## Links do Projeto

| Recurso | Link |
|---------|------|
| Vídeo de Pitch (3 min) | [YouTube](https://youtube.com) |
| Vídeo de Demonstração (2 min) | [YouTube](https://youtube.com) |
| Apresentação (12 slides) | [Canva / Google Slides](https://canva.com) |
| Repositório | [github.com/henriquescastilho/realstateos](https://github.com/henriquescastilho/realstateos) |

---

## Equipe

| Nome | Papel |
|------|-------|
| **Henrique Scheer de Castilho** | Fullstack & Arquitetura |
| **Pedro Afonso Malheiros Freitas** | Backend & Integrações |
| **Pedro Pongiluppi Thomaz** | Frontend & UX |
| **Leonardo Costa** | Infraestrutura & DevOps |

---

## O Problema

Administradoras de imóveis ainda operam com processos manuais e fragmentados:

- Boletos de condomínio e IPTU chegam por e-mail e WhatsApp, e alguém precisa abrir, ler, digitar e lançar cada um manualmente.
- Cobranças são compostas em planilhas, com risco constante de erro e atraso.
- Pagamentos recebidos precisam ser reconciliados um a um contra os boletos emitidos.
- O repasse ao proprietário exige calcular aluguel recebido menos despesas menos taxa de administração — tudo manual.
- Extratos são montados em Word ou Excel e enviados por e-mail individualmente.

O resultado: atrasos, erros financeiros, proprietários insatisfeitos e equipes sobrecarregadas com trabalho repetitivo.

## A Solução

O Real Estate OS substitui esse fluxo inteiro por uma **cadeia de 7 agentes de IA** que operam autonomamente. Cada agente tem uma responsabilidade clara e, ao concluir sua tarefa, dispara um evento que aciona o próximo agente — criando um pipeline contínuo e auditável.

---

## Como os Agentes Funcionam

O sistema opera com **7 agentes especializados** coordenados por um **Orquestrador** baseado em eventos de domínio. Cada agente executa uma etapa do ciclo imobiliário e, ao terminar, emite um evento que dispara automaticamente o próximo agente na cadeia.

### O Fluxo Completo

```
  Boleto chega           Cobranças              Boleto enviado         Pagamento
  (e-mail/WhatsApp)      compostas              ao locatário           recebido
       │                    │                       │                     │
       ▼                    ▼                       ▼                     ▼
   ┌────────┐  expense  ┌─────────┐  charges   ┌──────────┐ payment  ┌───────────┐
   │ Radar  │──captured─▶│ Maestro │──composed─▶│ Cobrador │─received▶│ Sentinela │
   └────────┘           └─────────┘            └──────────┘          └───────────┘
                                                                          │
                                          payout.completed                │ reconciliado
                                               │                         │
                                               ▼                         ▼
                                         ┌──────────┐  bills_paid  ┌─────────┐
                                         │ Contador │◀─────────────│ Pagador │
                                         └──────────┘              └─────────┘
                                               │
                                               ▼
                                        Extrato + NF
                                        enviados ao
                                        proprietário
```

### Os 7 Agentes em Detalhe

#### 1. Radar — Captura de Documentos
**Disparo:** Sob demanda (e-mail, WhatsApp ou upload manual)

O Radar recebe imagens ou PDFs de boletos e usa o **Gemini Vision** para extrair automaticamente: valor, data de vencimento, código de barras, linha digitável, tipo (condomínio, IPTU ou taxa), CNPJ do emissor e mês de referência.

Após a extração, o Radar cruza o CNPJ do emissor com os dados cadastrais dos imóveis para identificar a qual propriedade o boleto pertence. Se a confiança da extração for **≥ 85%**, o boleto é lançado automaticamente como despesa. Caso contrário, a tarefa é **escalada** para revisão humana.

**Evento emitido:** `expense.captured`

#### 2. Maestro — Composição de Cobranças
**Disparo:** Automático, ao receber `expense.captured`

O Maestro consolida todas as despesas capturadas do mês e compõe as cobranças para cada locatário. Ele calcula o valor total (aluguel + condomínio + IPTU + taxas), aplica multa e juros quando aplicável, e gera a cobrança consolidada.

**Evento emitido:** `charges.composed`

#### 3. Cobrador — Emissão e Cobrança
**Disparo:** Automático, ao receber `charges.composed`

O Cobrador gera boletos bancários (integração Santander) com código de barras e linha digitável, e envia ao locatário por e-mail e WhatsApp. Ele também agenda lembretes automáticos:
- 3 dias antes do vencimento
- 1 dia antes do vencimento
- 1 dia após o vencimento (aviso de atraso)
- 3 dias após (notificação de inadimplência)

**Evento emitido:** `payment.received` (quando o banco notifica pagamento)

#### 4. Sentinela — Reconciliação de Pagamentos
**Disparo:** Automático, ao receber `payment.received` + varredura a cada 4 horas

O Sentinela compara cada pagamento recebido com a cobrança original. Ele detecta três cenários:
- **Pagamento exato:** marca como reconciliado.
- **Pagamento parcial:** registra a divergência e escala para revisão.
- **Pagamento em excesso:** registra crédito e notifica.

Após reconciliar todos os pagamentos do período, o fluxo de repasse é liberado.

#### 5. Pagador — Pagamento de Contas e Repasse
**Disparo:** Dia 5 (pagamento de contas) e dia 15 (repasse) ou manual via upload de PDFs

No **dia 5**, o Pagador quita todas as despesas aprovadas do imóvel (condomínio, IPTU, taxas).

No **dia 15**, ele calcula o repasse de cada proprietário:
```
Repasse = Aluguel Recebido − Despesas Pagas − Taxa de Administração
```

O Pagador também aceita **upload manual de boletos**: o usuário arrasta PDFs para o painel, o sistema extrai os dados via IA, mostra uma tabela de conferência e, ao confirmar, deduz o valor do saldo simulado.

**Evento emitido:** `payout.bills_paid`, `payout.completed`

#### 6. Contador — Extrato e Nota Fiscal
**Disparo:** Automático, ao receber `payout.completed`

O Contador gera o extrato detalhado do proprietário com todas as receitas e deduções do mês, emite uma **NF simulada** e envia tudo por e-mail. O extrato inclui:
- Aluguéis recebidos por imóvel
- Despesas deduzidas (condomínio, IPTU, taxas)
- Taxa de administração
- Valor líquido do repasse
- Número da NF gerada

**Evento emitido:** `statement.ready`

#### 7. Orquestrador — Coordenação Central
**Disparo:** Sempre ativo, escutando todos os eventos

O Orquestrador é o cérebro do sistema. Ele não executa tarefas diretamente — sua função é **escutar eventos de domínio e criar tarefas para os agentes corretos**. O mapeamento é:

| Evento | Agente Acionado |
|--------|-----------------|
| `expense.captured` | Maestro |
| `charges.composed` | Cobrador |
| `payment.received` | Sentinela |
| `payout.completed` | Contador |

Cada tarefa criada pelo Orquestrador entra em uma fila BullMQ e é processada pelo executor de agentes, que roteia pela confiança:
- **Confiança ≥ 85%:** execução automática.
- **Confiança entre 50% e 85%:** execução com revisão posterior.
- **Confiança < 50%:** escalação para aprovação humana.

---

## Funcionalidades Principais

### Gestão Imobiliária
- Cadastro de imóveis com dados de administradora de condomínio e inscrição municipal
- Contratos de locação com regras de repasse personalizáveis
- Cadastro de proprietários e locatários com preferências de pagamento (PIX, conta bancária)

### Cobrança e Pagamentos
- Composição automática de cobranças consolidadas (aluguel + encargos)
- Geração de boletos bancários com integração Santander
- Reconciliação automática de pagamentos com detecção de divergências
- Cálculo de multa (2%) e juros (0,033%/dia) sobre atrasos

### Comunicações Multicanal
- Envio de e-mails com templates HTML para cobranças, atrasos, pagamentos e extratos
- Integração WhatsApp via Evolution API
- Inbox unificado com threads por contato
- Lembretes automáticos antes e depois do vencimento

### Painel de Agentes
- Dashboard com 7 cards mostrando o status "vivo" de cada agente (dot pulsante verde/cinza)
- Modal de detalhes com histórico de tarefas, próxima execução e schedule
- Visualização do Orquestrador com mapeamento de eventos em tempo real
- Seção de pagamento manual no Pagador com drop zone para PDFs

### Relatórios e Analytics
- KPIs do portfólio: taxa de adimplência, inadimplência, ocupação
- Métricas dos agentes: taxa de automação, escalações, falhas
- Extratos de repasse por proprietário com detalhamento

### Widget de Saldo
- Saldo simulado (R$ 54.000,00) exibido no header
- Atualiza em tempo real ao confirmar pagamentos no Pagador
- Persistido em localStorage

### Assistente com IA (RAG)
- Chatbot contextual alimentado por documentos indexados via pgvector
- Respostas baseadas em contratos, regulamentos e histórico do imóvel

---

## Tecnologias Utilizadas

### Backend
| Tecnologia | Função |
|------------|--------|
| **Node.js + TypeScript** | API REST principal |
| **Express.js** | Framework HTTP |
| **PostgreSQL 16 + pgvector** | Banco de dados relacional + busca vetorial |
| **Drizzle ORM** | ORM type-safe com migrações |
| **BullMQ + Redis** | Fila de tarefas e agendamento de agentes |
| **Gemini 2.0 Flash** | Extração de dados de boletos via visão computacional |
| **Nodemailer** | Envio de e-mails transacionais |
| **Zod** | Validação de schemas |
| **JWT** | Autenticação e autorização |

### Frontend
| Tecnologia | Função |
|------------|--------|
| **Next.js 16** | Framework React com App Router |
| **React 19** | Biblioteca de UI |
| **TypeScript** | Tipagem estática |
| **CSS puro** | Design system customizado (sem Tailwind) |

### Infraestrutura
| Tecnologia | Função |
|------------|--------|
| **Docker + Docker Compose** | Containerização e orquestração local |
| **Nginx** | API Gateway com rate limiting |
| **MinIO** | Object storage S3-compatível |
| **Prometheus + Grafana** | Monitoramento e dashboards |
| **Loki + Promtail** | Agregação de logs |
| **Railway** | Deploy em produção |

---

## Estrutura do Projeto

```
realstateos/
├── apps/
│   ├── api-node/                  # Backend Node.js
│   │   ├── src/
│   │   │   ├── db/                # Schema Drizzle + migrações
│   │   │   ├── lib/               # Queue, events, errors, response
│   │   │   ├── modules/
│   │   │   │   ├── agents/        # Orquestração de agentes
│   │   │   │   │   ├── handlers/  # 6 handlers (radar, maestro, cobrador, sentinela, pagador, contador)
│   │   │   │   │   ├── orchestrator.ts
│   │   │   │   │   ├── registry.ts
│   │   │   │   │   ├── executor.ts
│   │   │   │   │   ├── router.ts
│   │   │   │   │   └── service.ts
│   │   │   │   ├── auth/          # Autenticação JWT
│   │   │   │   ├── billing/       # Composição de cobranças
│   │   │   │   ├── payments/      # Reconciliação e extratos
│   │   │   │   ├── communications/# Templates e envio multicanal
│   │   │   │   ├── properties/    # Cadastro de imóveis
│   │   │   │   ├── contracts/     # Contratos de locação
│   │   │   │   ├── reports/       # Relatórios e KPIs
│   │   │   │   ├── ai-assistant/  # Chatbot RAG
│   │   │   │   ├── inbox/         # Inbox multicanal
│   │   │   │   └── events/        # Event bus + webhooks
│   │   │   ├── worker/            # Scheduler BullMQ
│   │   │   └── index.ts           # Entrypoint Express
│   │   ├── drizzle/               # Arquivos de migração SQL
│   │   └── Dockerfile
│   └── web/                       # Frontend Next.js
│       └── src/
│           ├── app/               # Páginas (App Router)
│           │   ├── agents/        # Painel de agentes
│           │   ├── dashboard/     # KPIs e métricas
│           │   ├── billing/       # Faturas e cobranças
│           │   ├── payments/      # Pagamentos
│           │   ├── properties/    # Imóveis
│           │   ├── contracts/     # Contratos
│           │   ├── owners/        # Proprietários
│           │   ├── reports/       # Relatórios
│           │   └── ...
│           ├── components/        # Componentes reutilizáveis
│           │   ├── layout/        # AppShell, BalanceWidget, NotificationBell
│           │   └── ui/            # Modal, Icon, Badge
│           └── lib/               # Auth, API client, Balance store, Types
├── docs/                          # Documentação
│   ├── architecture.md
│   ├── prd.md
│   ├── DEVELOPMENT.md
│   ├── api/                       # Referência da API
│   ├── adr/                       # Architecture Decision Records
│   └── runbook/                   # Guias operacionais
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## Configuração e Execução

### Pré-requisitos

- **Node.js** 20+
- **Docker** e **Docker Compose**
- **pnpm** ou **npm**

### 1. Clonar o repositório

```bash
git clone https://github.com/henriquescastilho/realstateos.git
cd realstateos
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Editar o `.env` com suas credenciais:

```env
DATABASE_URL=<sua-url-postgres>          # placeholder - ver .env.example
REDIS_URL=<sua-url-redis>               # placeholder - ver .env.example
JWT_SECRET=<sua-chave-secreta>
GEMINI_API_KEY=<sua-chave-gemini>        # Para extração de boletos via IA
```

### 3. Subir os serviços de infraestrutura

```bash
docker compose up -d db redis
```

### 4. Instalar dependências e rodar migrações

```bash
# Backend
cd apps/api-node
npm install
npm run db:migrate

# Frontend
cd ../web
npm install
```

### 5. Popular dados de demonstração

```bash
cd apps/api-node
npm run db:seed
```

### 6. Iniciar a aplicação

```bash
# Terminal 1 — Backend API
cd apps/api-node
npm run dev

# Terminal 2 — Worker (agentes + filas)
cd apps/api-node
npm run worker

# Terminal 3 — Frontend
cd apps/web
npm run dev
```

### 7. Acessar

- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001/api/v1
- **Health check:** http://localhost:3001/health

### Atalho com Make

```bash
make demo    # Sobe tudo + seed + abre navegador
make logs    # Acompanha logs da API
make reset   # Reinicia com dados limpos
```

---

## Uso

### Login de demonstração

Após rodar o seed, use as credenciais criadas automaticamente para acessar o sistema. O seed cria uma organização com imóveis, contratos, proprietários e locatários de exemplo.

### Fluxo típico

1. **Dashboard** — Visão geral com KPIs do portfólio
2. **Agentes** — Painel com os 7 agentes e seus status em tempo real
3. **Cobranças** — Visualizar cobranças compostas pelo Maestro
4. **Pagamentos** — Acompanhar reconciliação feita pelo Sentinela
5. **Agentes → Pagador** — Arrastar PDFs de boletos para pagamento manual
6. **Proprietários** — Consultar extratos gerados pelo Contador

---

## Roadmap

- [ ] Integração real com API bancária Santander (produção)
- [ ] Emissão de NF-e real via API de nota fiscal
- [ ] App mobile para proprietários e locatários
- [ ] Módulo de vistorias com fotos e checklist
- [ ] Dashboard de inadimplência com scoring de risco
- [ ] Integração com marketplaces imobiliários (ZAP, OLX)
- [ ] Multi-idioma (inglês, espanhol)

---

## Licença

Este projeto é distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<p align="center">
  Feito com TypeScript, Next.js, PostgreSQL e agentes de IA autônomos.
</p>
