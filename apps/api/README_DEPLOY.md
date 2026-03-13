# API Deploy Notes

Deploy alvo atual do MVP:

- API FastAPI na Railway
- worker simples na Railway usando `Dockerfile.worker`

## Variáveis de ambiente mínimas

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `WORKER_POLL_INTERVAL_SECONDS`
- `SANTANDER_SANDBOX_ENABLED`
- `PAYMENT_MOCK_FALLBACK_ENABLED`

## Startup command

API:

```bash
sh scripts/start-api.sh
```

Worker local em CLI:

```bash
sh scripts/start-worker.sh
```

Worker deployável na Railway:

```bash
sh scripts/start-worker-service.sh
```

## Build da API

```bash
docker build -t realestateos-api ./apps/api
```

## Build do worker

```bash
docker build -f ./apps/api/Dockerfile.worker -t realestateos-worker ./apps/api
```

## Railway

Serviços que serão criados depois:

- `api` usando `apps/api/Dockerfile`
- `worker` usando `apps/api/Dockerfile.worker`

O worker deployável sobe uma API mínima com `/health` e roda o loop de polling em background.

## Healthcheck

- API: `GET /health`
- Worker: `GET /health`

## Seed de demo

Para criar dados mínimos do hackathon:

```bash
./scripts/seed.sh
```

## Observação

Nenhum deploy foi executado. Este arquivo só documenta como o serviço já está preparado para a Railway.
