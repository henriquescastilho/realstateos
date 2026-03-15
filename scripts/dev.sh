#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Real Estate OS — Dev environment
#
#  Sobe tudo que precisa pra rodar localmente.
#  Uso:
#    ./scripts/dev.sh          → sobe tudo (infra + api + web)
#    ./scripts/dev.sh --seed   → sobe tudo + popula banco de teste
#    ./scripts/dev.sh --infra  → sobe só PostgreSQL, Redis, MinIO
#    ./scripts/dev.sh --stop   → para tudo
#
#  Terminais (quando roda sem flags):
#    1) Infra (Docker)  — PostgreSQL, Redis, MinIO
#    2) API Node        — porta 3001
#    3) Web (Next.js)   — porta 3000
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api-node"
WEB_DIR="$ROOT_DIR/apps/web"
LOG_DIR="$ROOT_DIR/.logs"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[dev]${NC} $1"; }
err()  { echo -e "${RED}[dev]${NC} $1"; }

# ─── Stop ───
stop_all() {
  log "Parando tudo..."
  cd "$ROOT_DIR"
  docker compose down 2>/dev/null || true
  lsof -ti:3001 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  log "Tudo parado."
  exit 0
}

# ─── Database URL ───
# Docker Compose PostgreSQL uses default local-dev credentials
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/realestateos}" # placeholder
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}" # placeholder
export JWT_SECRET="${JWT_SECRET:-dev-only-unsafe-secret-replace-in-production}" # must match docker-compose.yml

# ─── Infra only ───
start_infra() {
  log "Subindo infra (PostgreSQL + Redis + MinIO + API Python)..."
  cd "$ROOT_DIR"
  docker compose up -d db redis minio minio-init api worker web
  log "Aguardando PostgreSQL..."

  # Wait for PostgreSQL to be ready
  for i in {1..15}; do
    if docker compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  # Run migrations
  log "Rodando migrations (Drizzle)..."
  cd "$API_DIR"
  DATABASE_URL="$DATABASE_URL" npx drizzle-kit push --force 2>&1 | tail -3

  # Wait for API Python
  log "Aguardando API Python..."
  for i in {1..15}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    log "API Python rodando (porta 8000)"
  else
    warn "API Python pode demorar. Veja: docker compose logs api"
  fi

  log "Infra pronta."
}

# ─── Seed ───
run_seed() {
  log "Populando banco de teste (L Castilho Imoveis)..."
  cd "$API_DIR"
  DATABASE_URL="$DATABASE_URL" npx tsx src/db/seed-test-data.ts --reset
  log "Seed concluido."
}

# ─── Checks ───
check_deps() {
  # Node
  if ! command -v node &>/dev/null; then
    err "Node.js nao encontrado. Instale via nvm ou brew."
    exit 1
  fi

  # Docker
  if ! command -v docker &>/dev/null; then
    err "Docker nao encontrado."
    exit 1
  fi

  # npm deps
  if [ ! -d "$API_DIR/node_modules" ]; then
    warn "Instalando dependencias da API..."
    cd "$API_DIR" && npm install
  fi

  if [ ! -d "$WEB_DIR/node_modules" ]; then
    warn "Instalando dependencias do Web..."
    cd "$WEB_DIR" && npm install
  fi
}

# ─── Testes ───
run_tests() {
  log "Rodando testes Node.js..."
  cd "$API_DIR"
  npm test 2>&1
  log "Testes concluidos."
}

# ─── Start full environment (infra + seed + tests + API + Web) ───
start_full() {
    check_deps
    start_infra
    run_seed
    run_tests

    # Create log dir
    mkdir -p "$LOG_DIR"

    # Start API Node (background)
    log "Iniciando API Node (porta 3001)..."
    cd "$API_DIR"
    DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" JWT_SECRET="$JWT_SECRET" PORT=3001 NODE_ENV=development npx ts-node --transpile-only src/index.ts > "$LOG_DIR/api-node.log" 2>&1 &
    API_PID=$!

    # Wait for API to be ready
    for i in {1..10}; do
      if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
      log "API Node rodando (PID $API_PID)"
    else
      err "API Node nao iniciou. Veja $LOG_DIR/api-node.log"
    fi

    # Start Web (background)
    log "Iniciando Web Next.js (porta 3000)..."
    cd "$WEB_DIR"
    npm run dev > "$LOG_DIR/web.log" 2>&1 &
    WEB_PID=$!
    sleep 3

    if curl -s http://localhost:3000 > /dev/null 2>&1; then
      log "Web rodando (PID $WEB_PID)"
    else
      warn "Web pode demorar pra iniciar. Veja $LOG_DIR/web.log"
    fi

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Real Estate OS — Dev Environment${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}API Python${NC} http://localhost:8000  (Docker)"
    echo -e "  ${GREEN}API Node${NC}   http://localhost:3001  (PID $API_PID)"
    echo -e "  ${GREEN}Web${NC}        http://localhost:3000  (PID $WEB_PID)"
    echo -e "  ${GREEN}PostgreSQL${NC} localhost:5432"
    echo -e "  ${GREEN}Redis${NC}      localhost:6379"
    echo -e "  ${GREEN}MinIO${NC}      http://localhost:9001  (admin/minioadmin)"
    echo ""
    echo -e "  Logs:    ${YELLOW}$LOG_DIR/${NC}"
    echo -e "  Parar:   ${YELLOW}./scripts/dev.sh --stop${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
    echo ""

    # Wait for any background process to exit
    wait
}

# ─── Main ───
case "${1:-all}" in
  --stop)
    stop_all
    ;;
  --infra)
    check_deps
    start_infra
    log "Infra rodando. API e Web precisam ser iniciados manualmente."
    ;;
  --seed|all)
    start_full
    ;;
  *)
    echo "Uso: ./scripts/dev.sh [--seed|--infra|--stop]"
    echo ""
    echo "  (sem flag)  Sobe tudo: infra + banco de teste + API + Web"
    echo "  --seed      Mesmo que sem flag (sobe tudo)"
    echo "  --infra     Sobe so PostgreSQL, Redis, MinIO"
    echo "  --stop      Para tudo"
    exit 0
    ;;
esac
