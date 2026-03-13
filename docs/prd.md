# PRD

## 1. Visao Geral

O Real Estate OS e uma plataforma de gestao de imoveis voltada para a vida operacional de contratos residenciais de locacao no Brasil. O sistema comeca quando um contrato assinado e entregue pela imobiliaria ou administradora e, a partir disso, ativa os fluxos recorrentes necessarios para operar o ativo, o ciclo financeiro e o relacionamento com inquilino e proprietario.

Este v1 nao cobre aquisicao comercial nem fluxos pre-contrato. O objetivo e se tornar o sistema operacional da carteira ativa de locacao, com agentes de IA executando tarefas repetitivas e humanos intervindo apenas quando julgamento, regulacao ou baixa confianca exigirem.

## 2. Cliente-Alvo

### Perfil Ideal de Cliente

- imobiliarias brasileiras com carteira ativa de locacao residencial
- administradoras que fazem cobranca recorrente e prestacao de contas ao proprietario
- times operacionais com maturidade digital baixa ou media e ferramental fragmentado

### Perfil Tipico de Dor

- dados de contrato espalhados entre pastas, planilhas, e-mail e WhatsApp
- cobranca mensal montada manualmente a partir de multiplas fontes
- pouca visibilidade sobre atrasos, documentos pendentes e manutencoes nao resolvidas
- dependencia de poucas pessoas que concentram o conhecimento do processo

## 3. Problema Central

Depois que um contrato de locacao e assinado, a operacao se torna repetitiva, cheia de excecoes e dificil de monitorar. O time precisa:

- cadastrar e normalizar dados do contrato
- configurar cobrancas recorrentes e datas de vencimento
- obter boletos e documentos de taxas
- emitir boleto e PIX
- acompanhar pagamentos e conciliar recebimentos
- se comunicar com inquilinos e proprietarios
- gerir chamados e manutencoes

Essas tarefas costumam ser manuais, lentas e inconsistentes. O resultado e gargalo operacional, pouca rastreabilidade e vazamento financeiro evitavel.

## 4. Objetivo do Produto

Transformar contratos de locacao assinados em operacoes estruturadas e automatizadas com:

- modelo canonico para imovel, partes, contrato e cobranca
- agentes de IA que executam fluxos repetiveis
- caminhos claros de fallback para operadores humanos
- historico auditavel para cada acao operacional

## 5. Jobs To Be Done

### Para o gestor da carteira

- Quando eu recebo um contrato de locacao assinado, quero ativar a operacao rapidamente para comecar cobranca e comunicacao sem remontar dados manualmente.
- Quando o ciclo mensal comeca, quero que o sistema monte todas as cobrancas esperadas para eu nao precisar perseguir cada documento.
- Quando pagamentos chegam, quero que o sistema concilie automaticamente e atualize o historico do contrato.

### Para o analista operacional

- Quando uma integracao falha ou a confianca dos dados e baixa, quero uma tarefa clara e contextualizada para resolver o problema rapido.
- Quando o inquilino ou proprietario precisa de atualizacao, quero que a comunicacao nasca do contexto operacional e nao de threads soltas.

### Para o dono da imobiliaria

- Quando eu reviso a carteira, quero visibilidade sobre fluxo de caixa, inadimplencia, excecoes e manutencao em todos os contratos ativos.

## 6. Escopo do V1

### Dentro do Escopo

- onboarding de contratos residenciais assinados
- criacao de cadastro de imovel, proprietario e inquilino
- configuracao financeira da operacao recorrente
- calculo e emissao de cobrancas mensais
- ingestao de pagamentos e conciliacao
- comunicacao automatizada com inquilino e proprietario
- acompanhamento de chamados de manutencao
- orquestracao de tarefas de agentes, monitoramento e escalonamento humano
- relatorios de carteira para contratos ativos

### Fora do Escopo

- captacao, qualificacao de leads e CRM
- distribuicao de anuncios
- visitas e mostragem
- negociacao de proposta
- redacao ou assinatura de contrato
- compra e venda

## 7. Perfis de Usuario

### Admin de Operacoes

Responsavel por onboarding de contratos, resolucao de excecoes e validacao de tarefas com baixa confianca.

### Admin Financeiro

Responsavel por emissao de cobrancas, conciliacao de pagamentos e demonstrativos do proprietario.

### Inquilino

Recebe cobrancas, confirma pagamentos e abre solicitacoes de manutencao.

### Proprietario

Recebe demonstrativos, atualizacoes de status e comunicacoes operacionais relevantes.

### Agente de IA

Executa tarefas rotineiras, busca dados externos, prepara comunicacoes e escalona quando a confianca ou a disponibilidade do sistema forem insuficientes.

## 8. Fluxo Operacional Ponta a Ponta

### 8.1 Onboarding do Contrato

Entradas:

- contrato de locacao assinado
- dados basicos do imovel
- dados de proprietario e inquilino
- instrucoes minimas de cobranca, quando existirem

Comportamento esperado:

- criar registros estruturados de imovel, partes e contrato
- extrair e normalizar clausulas relevantes
- identificar lacunas de dados e criar tarefas de excecao quando necessario
- marcar o contrato como operacionalmente pronto quando os requisitos minimos forem atendidos

### 8.2 Configuracao Financeira

Comportamento esperado:

- configurar agenda de cobranca e regra de vencimento
- registrar responsabilidades recorrentes e variaveis
- definir meio de cobranca e regra de conciliacao
- identificar quais documentos externos precisam ser buscados em cada ciclo

### 8.3 Ciclo Mensal de Cobranca

Comportamento esperado:

- calcular aluguel e demais encargos
- buscar ou ingerir documentos de condominio e IPTU quando aplicavel
- criar instancias mensais de cobranca
- emitir boleto e/ou PIX por meio das integracoes financeiras
- notificar o inquilino sobre o novo ciclo de pagamento

### 8.4 Conciliacao de Pagamentos

Comportamento esperado:

- ingerir confirmacoes de pagamento
- conciliar pagamento contra cobrancas em aberto
- marcar corretamente casos parciais, integrais, atrasados e divergentes
- gerar registros para demonstrativos do proprietario

### 8.5 Comunicacoes

Comportamento esperado:

- enviar aviso de cobranca, lembrete e confirmacao de pagamento ao inquilino
- enviar prestacao de contas mensal e alertas de excecao ao proprietario
- manter historico de comunicacao vinculado a entidade operacional que originou a mensagem

### 8.6 Manutencao e Suporte

Comportamento esperado:

- abrir chamado de manutencao a partir de solicitacao do inquilino
- classificar urgencia e definir proxima acao
- acompanhar fornecedor ou atendimento interno
- encerrar o chamado com historico de resolucao

### 8.7 Escalonamento Humano

Comportamento esperado:

- criar tarefas explicitas quando a automacao falhar, a confianca for baixa ou uma dependencia externa estiver indisponivel
- preservar entradas, saidas e contexto da falha
- tornar a fila de escalonamento visivel e acionavel

## 9. Requisitos Funcionais

### RF-1 Ativacao do Contrato

O sistema deve aceitar um contrato assinado como ponto de entrada e criar o conjunto minimo de dados operacionais necessario para iniciar a gestao.

### RF-2 Cadastro Canonico

O sistema deve manter registros estruturados de imovel, proprietario, inquilino, contrato, documentos e historico operacional.

### RF-3 Motor de Cobranca

O sistema deve gerar cobrancas mensais recorrentes com base nas regras do contrato, nas responsabilidades configuradas e na ingestao de boletos externos.

### RF-4 Emissao de Cobranca

O sistema deve suportar emissao de boleto e PIX por integracoes financeiras externas.

### RF-5 Acompanhamento de Pagamentos

O sistema deve registrar e conciliar pagamentos contra cobrancas em aberto, mantendo uma linha do tempo financeira auditavel.

### RF-6 Comunicacao Contextual

O sistema deve enviar mensagens operacionais ligadas a contratos, cobrancas, pagamentos ou chamados de manutencao.

### RF-7 Acompanhamento de Manutencao

O sistema deve registrar, classificar e acompanhar solicitacoes de manutencao ate o encerramento.

### RF-8 Supervisao de Agentes

O sistema deve orquestrar tarefas de IA com score de confianca, retries e escalonamento humano.

### RF-9 Auditabilidade

O sistema deve preservar trilha operacional para alteracoes de dados, decisoes do agente, comunicacoes e eventos financeiros.

## 10. Requisitos Nao Funcionais

- seguranca forte para integracoes bancarias e documentais
- nenhuma informacao sensivel exposta em logs ou erros visiveis
- observabilidade clara para execucao de tarefas, falhas e retries
- suporte a onboarding com entradas parciais para clientes pouco digitalizados
- degradacao segura quando dependencias externas falharem

## 11. KPIs

- tempo entre recebimento do contrato e ativacao operacional
- percentual de cobrancas mensais emitidas sem intervencao manual
- tempo entre recebimento do pagamento e conciliacao
- taxa de inadimplencia da carteira gerida
- numero e percentual de tarefas de agente escaladas para humanos
- tempo medio de resolucao de excecoes operacionais
- tempo medio de resolucao de manutencoes

## 12. Cenarios de Validacao

### Caminho Feliz

1. Contrato assinado e recebido, interpretado e ativado para operacao.
2. Ciclo mensal gera aluguel, condominio e IPTU.
3. Boleto ou PIX e emitido e comunicado ao inquilino.
4. Pagamento e recebido e conciliado automaticamente.
5. Demonstrativo do proprietario reflete o movimento conciliado.

### Caminhos de Excecao

1. Documento do contrato esta incompleto e bloqueia a ativacao.
2. OCR tem confianca baixa em um campo critico.
3. Fonte de condominio ou prefeitura esta indisponivel.
4. Valor pago diverge da cobranca esperada.
5. Contrato contem regra financeira atipica e exige revisao manual.
6. Solicitacao de manutencao nao pode ser classificada automaticamente.

## 13. Riscos e Restricoes Operacionais

- integracoes com prefeitura e condominio variam muito e podem ser frageis
- OCR e parsing documental podem estruturar dados incorretos
- integracoes bancarias exigem seguranca operacional rigorosa
- a qualidade da automacao precisa ser visivel para gerar confianca no operador
- clientes com baixa maturidade podem fornecer dados incompletos ou inconsistentes

## 14. Assuncoes

- geografia: Brasil
- vertical: locacao residencial
- ponto de entrada: contrato de locacao assinado
- a adocao inicial comeca na operacao de contratos ativos, nao na aquisicao comercial
- fallback humano e obrigatorio para fluxos financeiros criticos e sensiveis a compliance

## 15. Definicao de Sucesso Desta Fase

Esta fase e bem-sucedida quando a documentacao do produto estiver especifica o suficiente para que o time de implementacao construa a primeira versao operacional da plataforma em torno de contratos ativos de locacao sem precisar inventar limites de escopo, entidades centrais ou regras de ownership.
