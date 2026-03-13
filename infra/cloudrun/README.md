# Cloud Run Deployment

Este diretório deixa o MVP do hackathon pronto para uma demo ao vivo com:

- API FastAPI em Cloud Run
- worker do BillingAgent como Cloud Run Job
- migração via Cloud Run Job
- frontend em Vercel ou em Cloud Run

## Estrutura de deploy

- `deploy-api.sh`: publica a API HTTP
- `deploy-worker-job.sh`: publica o worker que processa uma task pendente por execução
- `run-migrations-job.sh`: executa `alembic upgrade head`
- `deploy-web-cloudrun.sh`: opção de deploy do Next.js em Cloud Run

## Variáveis obrigatórias

Defina estas variáveis antes de rodar os scripts:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `API_IMAGE`
- `WEB_IMAGE` para deploy do frontend em Cloud Run
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `NEXT_PUBLIC_API_URL`

Use placeholders seguros. Não commite credenciais reais.

## Sequência recomendada

1. Build e push da imagem da API
2. Executar `run-migrations-job.sh`
3. Executar `deploy-api.sh`
4. Executar `deploy-worker-job.sh`
5. Subir o frontend em Vercel ou rodar `deploy-web-cloudrun.sh`

## Vercel

Para usar Vercel no frontend:

- diretório raiz do projeto: `apps/web`
- variável obrigatória: `NEXT_PUBLIC_API_URL`
- valor esperado: URL pública da API terminando em `/api`

## Worker

O worker foi desenhado como um job curto para hackathon:

- lê uma task `PENDING`
- chama o `BillingAgent`
- persiste `DONE` ou `FAILED`

Para manter o painel atualizado na demo, acione o job sempre que quiser processar a próxima task pendente. Se quiser automatizar, conecte o job a um scheduler externo depois.
