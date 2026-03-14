## Contexto

Real Estate OS — sistema multi-tenant de gestão imobiliária.
Backend Node.js (Express + Drizzle + PostgreSQL) com 142 testes passando.
Integração Santander sandbox funcionando com mTLS (boleto confirmado).
Banco populado com dados de teste da L Castilho Imóveis (20 contratos ativos).
Dev environment: `./scripts/dev.sh` sobe tudo em um comando.

## O que já funciona

- Onboarding de contratos (imóvel + proprietário + inquilino + contrato)
- Billing (schedules, geração de cobranças, emissão com boleto automático)
- **Boleto automático**: `PATCH /charges/:id/issue` gera boleto Santander automaticamente, salva boletoId/barcode/digitableLine na charge. Se falhar, emite com boletoStatus=failed.
- **Webhook Santander**: `POST /webhooks/santander` (público, sem auth) recebe callback de pagamento, match por boletoId/barcode, reconciliação automática.
- Pagamentos (webhook, reconciliação automática, extrato do proprietário)
- Comunicações (email, WhatsApp — stubs)
- Manutenção (tickets)
- Santander (registro de credenciais por org, health check, geração de boleto via API real)

## Próximas features (por prioridade)

1. ~~**Billing → Boleto automático**~~ DONE
2. ~~**Webhook Santander → Reconciliação**~~ DONE

3. **Frontend (Next.js)**: dashboard com visão de contratos, cobranças do mês (pagas/abertas/atrasadas), e ação de emitir cobrança. O shell Next.js existe em `apps/web/` mas não tem páginas.

4. **Segunda via de boleto**: endpoint público (com token temporário) para inquilino gerar 2a via sem precisar de login.

## Prompt para colar

```
Continuando o Real Estate OS. Lê o NEXT_SESSION.md na raiz do projeto e a memória. Quero atacar a feature #3: frontend Next.js com dashboard mostrando contratos, cobranças do mês (pagas/abertas/atrasadas), e botão para emitir cobrança que chama o PATCH /charges/:id/issue.
```
