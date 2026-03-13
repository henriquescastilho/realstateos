# Railway Deployment Preparation

Este repositório está preparado para deploy futuro na Railway, sem executar nenhum comando de deploy agora.

Arquitetura que será criada depois:

- `api`: FastAPI monolith
- `worker`: worker simples do BillingAgent
- `web`: Next.js admin dashboard
- `Postgres`: provisionado pela Railway depois
- `Redis`: provisionado pela Railway depois

## Serviços e mapeamento

### 1. API

- diretório: `apps/api`
- build: `apps/api/Dockerfile`
- start: `sh scripts/start-api.sh`
- healthcheck: `GET /health`

### 2. Worker

- diretório: `apps/api`
- build: `apps/api/Dockerfile.worker`
- start: `sh scripts/start-worker-service.sh`
- healthcheck: `GET /health`

### 3. Web

- diretório: `apps/web`
- build: `apps/web/Dockerfile`
- start: `node server.js`
- env obrigatória: `NEXT_PUBLIC_API_URL`

## Variáveis de ambiente por serviço

### API

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `GOOGLE_ADK_MODEL`
- `CORS_ALLOWED_ORIGINS`
- `SANTANDER_SANDBOX_ENABLED`
- `SANTANDER_BASE_URL`
- `SANTANDER_CLIENT_ID`
- `SANTANDER_CLIENT_SECRET`
- `PAYMENT_MOCK_FALLBACK_ENABLED`
- `S3_ENDPOINT_URL`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`

### Worker

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `GOOGLE_ADK_MODEL`
- `WORKER_POLL_INTERVAL_SECONDS`
- `SANTANDER_SANDBOX_ENABLED`
- `SANTANDER_BASE_URL`
- `SANTANDER_CLIENT_ID`
- `SANTANDER_CLIENT_SECRET`
- `PAYMENT_MOCK_FALLBACK_ENABLED`

### Web

- `PORT`
- `NEXT_PUBLIC_API_URL`

## Arquivos relevantes para Railway

```text
.env.example
docker-compose.yml
README_DEPLOY_RAILWAY.md
apps/api/Dockerfile
apps/api/Dockerfile.worker
apps/api/.dockerignore
apps/api/app/main.py
apps/api/app/config.py
apps/api/app/workers/worker_service.py
apps/api/scripts/start-api.sh
apps/api/scripts/start-worker-service.sh
apps/api/pyproject.toml
apps/web/Dockerfile
apps/web/.dockerignore
apps/web/vercel.json
apps/web/src/lib/api.ts
```

## O que ainda faremos manualmente depois

Nada daqui cria recursos na Railway. Depois, manualmente:

- criar conta Railway
- criar projeto
- adicionar Postgres
- adicionar Redis
- criar serviço `api`
- criar serviço `worker`
- criar serviço `web`
- apontar cada serviço para o diretório correto do monorepo
- configurar variáveis de ambiente
- validar healthchecks
- conectar domínio, se necessário
- disparar deploy

## Future Railway Checklist

1. Criar conta na Railway
2. Criar um projeto novo
3. Provisionar PostgreSQL
4. Provisionar Redis
5. Criar serviço `api` usando `apps/api/Dockerfile`
6. Criar serviço `worker` usando `apps/api/Dockerfile.worker`
7. Criar serviço `web` usando `apps/web/Dockerfile`
8. Configurar todas as variáveis de ambiente
9. Definir `NEXT_PUBLIC_API_URL` com a URL pública da API terminando em `/api`
10. Validar `GET /health` na API
11. Validar `GET /health` no worker
12. Abrir o dashboard e executar o fluxo da demo

## Observações

- O deploy foi preparado com Dockerfiles separados para facilitar monorepo na Railway.
- O `docker-compose.yml` na raiz é apenas para desenvolvimento local.
- Nenhum comando Railway foi executado.
