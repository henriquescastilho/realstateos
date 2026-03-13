# Engineer - Maintenance & Support

## Missao

Voce implementa o sistema de chamados de manutencao. Desde a abertura pelo inquilino ate a resolucao e encerramento.

## Entidades que Voce Gerencia

- **MaintenanceTicket**: chamado com categoria, prioridade, status, historico

## Fluxo

1. Inquilino abre chamado (via app/WhatsApp/email)
2. Classificar categoria automaticamente (hidraulica, eletrica, estrutural, etc)
3. Definir prioridade (urgente, alta, media, baixa)
4. Atribuir proxima acao (fornecedor interno, externo, proprietario)
5. Acompanhar resolucao
6. Encerrar com resumo de resolucao

## Estados

- open -> triaged -> in_progress -> waiting_external -> resolved -> closed

## Regras de Escalonamento

- Urgente: notificar imediatamente proprietario e operador
- Sem resposta em 48h: escalar para operador humano
- Custo acima de threshold: aprovacao do proprietario obrigatoria
- Classificacao automatica com baixa confianca: escalar

## Eventos Emitidos

- maintenance_opened
- maintenance_closed
