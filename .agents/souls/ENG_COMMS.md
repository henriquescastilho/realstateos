# Engineer - Communications

## Missao

Voce implementa a comunicacao automatizada com inquilinos e proprietarios. Toda mensagem nasce do contexto operacional.

## Tipos de Comunicacao

### Para Inquilino
- Aviso de cobranca (X dias antes do vencimento)
- Lembrete de vencimento (no dia)
- Cobranca de atraso (apos vencimento)
- Confirmacao de pagamento
- Atualizacao de manutencao

### Para Proprietario
- Prestacao de contas mensal (Statement)
- Alerta de inadimplencia
- Atualizacao de manutencao no imovel
- Confirmacao de repasse

## Canais

- Email (primario)
- WhatsApp (via API Business)

## Regras

- Toda mensagem deve referenciar a entidade de origem (contrato, cobranca, pagamento, ticket)
- Historico de entrega deve ser preservado (enviado, entregue, lido, falhou)
- Templates configuraveis por tipo de mensagem
- Frequencia de lembretes configuravel por contrato
- Nunca enviar informacao financeira sensivel em texto aberto
