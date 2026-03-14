# Real Estate OS

[![API Node CI](https://github.com/henriquescastilho/realstateos/actions/workflows/api-node-ci.yml/badge.svg)](https://github.com/henriquescastilho/realstateos/actions/workflows/api-node-ci.yml)

Real Estate OS e uma plataforma de gestao operacional para imobiliarias e administradoras. O foco inicial e a operacao que comeca depois que um contrato de locacao ja esta assinado, transformando rotinas manuais e fragmentadas em um sistema estruturado, auditavel e operado por humanos e agentes de IA.

## Estado Atual da Arquitetura

- `apps/api-node` — **backend principal** Node.js + Express + TypeScript strict + Drizzle ORM (24 endpoints, 127 testes)
- `apps/api` — backend legado FastAPI (demo/hackathon)
- `apps/web` — frontend Next.js
- Orquestração de agentes via Paperclip configurada em `.agents/`

### Rodar localmente

```bash
make demo
```

Sobe toda a infra via Docker Compose, aguarda os serviços e popula o banco com dados de demo automaticamente.

## Tese do Produto

A plataforma nao e um portal de leads, um marketplace publico nem um CRM comercial. Ela e a espinha dorsal operacional da carteira de locacao.

O ponto de entrada do produto e um contrato de locacao assinado, junto com o minimo de dados do imovel e das partes para ativar a operacao. A partir disso, o sistema organiza cadastro do imovel, ciclo de cobranca, conciliacao de pagamentos, comunicacao com inquilino e proprietario, manutencao e inteligencia da carteira.

## Escopo Inicial

- onboarding de contratos de locacao assinados
- cadastro de imovel, proprietario e inquilino
- cobranca mensal e composicao de encargos
- acompanhamento de pagamentos e conciliacao
- comunicacao operacional automatizada
- manutencao e suporte
- orquestracao de agentes de IA com fallback humano
- relatorios operacionais e de carteira

## Fora de Escopo Nesta Fase

- captacao e qualificacao de leads
- CRM comercial
- agendamento de visitas
- negociacao de proposta
- fluxo de assinatura de contrato
- publicacao de anuncios em portais

## Por Que Isso Existe

A operacao de locacao no Brasil ainda roda em planilhas, caixas de e-mail, PDFs, telefonemas e fornecedores desconectados. Isso gera atraso operacional, pouca rastreabilidade, inadimplencia evitavel e dependencia excessiva de acompanhamento manual.

O Real Estate OS centraliza essas tarefas em um sistema capaz de:

- estruturar dados de contrato e de imovel
- calcular cobrancas recorrentes
- solicitar ou ingerir documentos externos
- emitir cobrancas
- conciliar pagamentos recebidos
- se comunicar automaticamente com inquilinos e proprietarios
- criar tarefas humanas quando a automacao tiver baixa confianca ou quando sistemas externos falharem

## Documentos do Produto

- [PRD](./docs/prd.md)
- [Arquitetura Inicial](./docs/architecture.md)

## Principios Operacionais

- fallback humano e obrigatorio para operacoes criticas ou de baixa confianca
- toda acao automatizada precisa deixar trilha de auditoria
- integracoes externas sao tratadas como nao confiaveis e precisam de retry, monitoramento e escalonamento
- o sistema precisa funcionar para imobiliarias com baixa maturidade digital e onboarding minimo

## Publico Inicial

- imobiliarias com carteira ativa de locacao residencial
- administradoras de imoveis com ciclo mensal de cobranca e repasse
- times de operacao responsaveis por cobranca, conciliacao e relacionamento com proprietario e inquilino

## Sinais de Sucesso do V1

- menor tempo entre recebimento do contrato e ativacao operacional
- maior percentual de cobrancas emitidas sem intervencao manual
- conciliacao mais rapida depois do pagamento
- menor esforco operacional por contrato ativo
- visibilidade clara das excecoes e dos escalonamentos humanos pendentes
