# Developer Onboarding Guide

Get a fully working local development environment in under 15 minutes.

---

## Prerequisites

Install these before starting:

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | 4.x+ | [docker.com](https://docs.docker.com/desktop/) |
| Python | 3.10+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Git | any | [git-scm.com](https://git-scm.com/) |

Verify:

```bash
docker --version   # Docker version 25.x.x
python3 --version  # Python 3.10+
node --version     # v18+
git --version      # git version 2.x
```

---

## 1. Clone the Repository

```bash
git clone https://github.com/realstateos/realstateos-enterprise.git
cd realstateos-enterprise
```

---

## 2. Environment Variables

Copy the example env file:

```bash
cp apps/api/.env.example apps/api/.env
```

The defaults work for local development out of the box. Key variables:

```bash
# apps/api/.env

# Database (matches docker-compose.yml defaults)
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/realestateos

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT (change in production)
JWT_SECRET=dev-secret-change-in-production-must-be-long
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# MinIO (local object storage)
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=realestateos
S3_REGION=us-east-1

# OpenAI (required for embeddings and agents)
OPENAI_API_KEY=sk-...
```

For the Node.js backend:

```bash
cp apps/api-node/.env.example apps/api-node/.env
```

Key Node.js variables:

```bash
# apps/api-node/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/realestateos
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=dev-secret-change-in-production-must-be-long
PORT=8001
```

> **Note:** `OPENAI_API_KEY` is required to run agents and the NL query endpoint. Without it, those features return errors. All other features work without it.

---

## 3. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** (with pgvector) on port 5432
- **Redis 7** on port 6379
- **MinIO** on port 9000 (console: 9001)

Wait for all services to be healthy:

```bash
docker compose ps
# All should show "healthy" or "running"
```

---

## 4. Python Backend Setup

```bash
cd apps/api

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Run database migrations
alembic upgrade head

# Seed demo data
python scripts/seed.py
```

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Verify:

```bash
curl http://localhost:8000/health/live
# {"status":"ok"}

curl http://localhost:8000/docs
# Opens Swagger UI in browser
```

---

## 5. Node.js Backend Setup

```bash
cd apps/api-node

# Install dependencies
npm install

# Generate Prisma client (if using Drizzle, run migrations)
npm run db:push

# Start development server
npm run dev
```

The Node.js server runs on port 8001 by default.

---

## 6. Frontend Setup

```bash
cd apps/web

# Install dependencies
npm install

# Start Next.js dev server
npm run dev
```

The web UI is available at http://localhost:3000.

---

## 7. Your First API Call

Get a token and list contracts:

```bash
# Issue a token for the demo tenant
TOKEN=$(curl -s -X POST http://localhost:8000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "demo", "email": "demo@realstateos.io"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

# List contracts (demo tenant has seeded data)
curl http://localhost:8000/v1/contracts \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
```

You should see a paginated list of demo contracts.

---

## 8. Running Tests

### Python

```bash
cd apps/api

# Unit tests
pytest tests/ -v --ignore=tests/integration --ignore=tests/security

# With coverage
pytest tests/ --cov=app --cov-report=term-missing

# Integration tests (requires running Docker services)
pytest tests/integration/ -v

# Property-based tests
pytest tests/test_billing_properties.py -v

# Security penetration tests
pytest tests/security/ -v
```

### Node.js

```bash
cd apps/api-node

# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## 9. Database Migrations

### Create a new migration

```bash
cd apps/api
alembic revision --autogenerate -m "add payment_method column to payments"
```

### Apply migrations

```bash
alembic upgrade head
```

### Rollback one step

```bash
alembic downgrade -1
```

### View migration history

```bash
alembic history --verbose
```

---

## 10. Code Quality

Before pushing, run:

```bash
# Python
cd apps/api
ruff check . --fix
ruff format .
mypy app/

# Node.js
cd apps/api-node
npm run lint
npm run typecheck
```

CI runs these automatically and will reject PRs that fail.

---

## Project Structure

```
realstateos-enterprise/
├── apps/
│   ├── api/                    # Python FastAPI backend
│   │   ├── app/
│   │   │   ├── agents/         # AI agents (ADK)
│   │   │   ├── api/            # Auth + deps
│   │   │   ├── middleware/     # Tenant isolation
│   │   │   ├── models/         # SQLAlchemy models
│   │   │   ├── routes/         # FastAPI routers
│   │   │   ├── schemas/        # Pydantic schemas
│   │   │   └── services/       # Business logic
│   │   ├── tests/              # pytest tests
│   │   └── alembic/            # DB migrations
│   ├── api-node/               # Node.js TypeScript backend
│   │   └── src/
│   │       ├── middleware/     # Auth, rate limiting
│   │       ├── modules/        # Feature modules
│   │       ├── routes/         # Express routers
│   │       ├── services/       # Business logic
│   │       └── ws/             # WebSocket server
│   └── web/                    # Next.js frontend
│       └── src/app/            # App Router pages
├── docs/
│   ├── api/                    # API documentation (mkdocs)
│   ├── adr/                    # Architecture Decision Records
│   ├── runbook/                # Operations runbooks
│   └── DEVELOPMENT.md          # This file
├── nginx/                      # API gateway config
├── docker-compose.yml          # Local infrastructure
└── .github/workflows/          # CI/CD pipelines
```

---

## Common Issues

### `DATABASE_URL` connection refused

Docker services aren't running yet. Run `docker compose up -d` and wait 10–15 seconds for Postgres to initialize.

### `OPENAI_API_KEY` errors

Agents and NL search require an OpenAI key. Set it in `.env`. Other features (billing, contracts, payments) work without it.

### `alembic upgrade head` fails with "table already exists"

The database has data from a previous run. Either:
- Drop and recreate: `docker compose down -v && docker compose up -d`
- Or mark as current: `alembic stamp head`

### Port already in use

If port 8000 is taken:
```bash
uvicorn app.main:app --reload --port 8080
```

Update `apps/web/.env.local` to point to the new port:
```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Node.js `npm install` errors on Windows

Use Git Bash or WSL2. Some native dependencies don't compile on PowerShell.

### MinIO bucket not found

The `minio-init` container creates the bucket automatically on first start. If it failed:
```bash
docker compose restart minio-init
```

---

## Useful Dev Commands

```bash
# Watch API logs
docker compose logs -f db redis

# Reset database (drops all data)
docker compose down -v && docker compose up -d

# Generate a test JWT
cd apps/api && python3 -c "
from app.api.auth import _create_access_token
print(_create_access_token({'sub':'dev','tenant_id':'demo','role':'admin','email':'dev@test.com'}))
"

# Inspect Redis
docker compose exec redis redis-cli KEYS '*'

# Connect to PostgreSQL
docker compose exec db psql -U postgres realestateos
```

---

## Getting Help

- **Slack**: `#eng-realstateos`
- **Issues**: GitHub Issues
- **API docs**: http://localhost:8000/docs (Swagger UI)
- **Architecture**: `docs/adr/` for decision records, `docs/architecture.md` for domain overview
