#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Real Estate OS — Dev environment
#
#  Sobe tudo que precisa pra rodar localmente.
#  Uso:
#    ./scripts/dev.sh          → sobe tudo (infra + seed + api + web)
#    ./scripts/dev.sh --infra  → sobe só PostgreSQL, Redis, MinIO
#    ./scripts/dev.sh --stop   → para tudo
#    ./scripts/dev.sh --reset  → para tudo, limpa volumes, recria do zero
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
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[dev]${NC} $1"; }
warn() { echo -e "${YELLOW}[dev]${NC} $1"; }
err()  { echo -e "${RED}[dev]${NC} $1"; }
step() { echo -e "${CYAN}[dev]${NC} ${BOLD}$1${NC}"; }

# ─── Stop ───
stop_all() {
  log "Parando tudo..."
  cd "$ROOT_DIR"
  docker compose down 2>/dev/null || true
  lsof -ti:3001 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  log "Tudo parado."
}

# ─── Database URL ───
# Local dev placeholder credentials (not used in production)
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/realestateos}" # example placeholder
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}" # example placeholder
export JWT_SECRET="${JWT_SECRET:-dev-only-unsafe-secret-replace-in-production}" # example placeholder

# ─── Checks ───
check_deps() {
  if ! command -v node &>/dev/null; then
    err "Node.js nao encontrado. Instale via nvm ou brew."
    exit 1
  fi

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

# ─── Infra ───
start_infra() {
  step "1/6  Subindo infra (PostgreSQL + Redis + MinIO)..."
  cd "$ROOT_DIR"
  docker compose up -d db redis minio minio-init api worker web

  log "Aguardando PostgreSQL..."
  for i in {1..20}; do
    if docker compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! docker compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then
    err "PostgreSQL nao iniciou em 20s. Veja: docker compose logs db"
    exit 1
  fi
  log "PostgreSQL pronto."
}

# ─── Migrations ───
run_migrations() {
  step "2/6  Rodando migrations (Drizzle push + SQL)..."
  cd "$API_DIR"

  # Drizzle push — sincroniza schema.ts com o banco
  DATABASE_URL="$DATABASE_URL" npx drizzle-kit push --force 2>&1 | tail -5

  # Migrations SQL manuais (idempotentes)
  for sql_file in "$API_DIR"/drizzle/0008_*.sql; do
    if [ -f "$sql_file" ]; then
      log "Aplicando $(basename "$sql_file")..."
      docker compose exec -T db psql -U postgres -d realestateos -f - < "$sql_file" 2>&1 || warn "Migration pode já ter sido aplicada: $(basename "$sql_file")"
    fi
  done

  log "Migrations concluidas."
}

# ─── Seed ───
run_seed() {
  step "3/6  Populando banco de teste (L Castilho Imoveis)..."
  cd "$API_DIR"
  DATABASE_URL="$DATABASE_URL" npx tsx src/db/seed-test-data.ts --reset
  log "Seed concluido."
}

# ─── Tests ───
run_tests() {
  step "4/6  Rodando testes..."
  cd "$API_DIR"
  if npm test 2>&1; then
    log "Testes passaram."
  else
    warn "Alguns testes falharam. Continuando..."
  fi
}

# ─── API Node ───
start_api() {
  step "5/6  Iniciando API Node (porta 3001)..."
  mkdir -p "$LOG_DIR"
  cd "$API_DIR"

  # Carregar .env se existir
  if [ -f "$API_DIR/.env" ]; then
    set -a
    source "$API_DIR/.env"
    set +a
  fi

  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  JWT_SECRET="$JWT_SECRET" \
  PORT=3001 \
  NODE_ENV=development \
    npx ts-node --transpile-only src/index.ts > "$LOG_DIR/api-node.log" 2>&1 &
  API_PID=$!

  for i in {1..15}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    log "API Node rodando (PID $API_PID)"
  else
    err "API Node nao iniciou. Veja $LOG_DIR/api-node.log"
    tail -20 "$LOG_DIR/api-node.log" 2>/dev/null || true
  fi
}

# ─── Web ───
start_web() {
  step "6/6  Iniciando Web Next.js (porta 3000)..."
  cd "$WEB_DIR"
  npm run dev > "$LOG_DIR/web.log" 2>&1 &
  WEB_PID=$!
  sleep 3

  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    log "Web rodando (PID $WEB_PID)"
  else
    warn "Web pode demorar. Veja $LOG_DIR/web.log"
  fi
}

# ─── Full start ───
start_full() {
  check_deps
  start_infra
  run_migrations
  run_seed
  run_tests
  start_api
  start_web

  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  Real Estate OS — Dev Environment                        ${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}Web${NC}          http://localhost:3000"
  echo -e "  ${GREEN}API Node${NC}     http://localhost:3001"
  echo -e "  ${GREEN}PostgreSQL${NC}   localhost:5432"
  echo -e "  ${GREEN}Redis${NC}        localhost:6379"
  echo -e "  ${GREEN}MinIO${NC}        http://localhost:9001  (admin/minioadmin)"
  echo ""
  echo -e "  ${BOLD}Funcionalidades ativas:${NC}"
  echo -e "    PIX Copia e Cola   — gerado junto com boleto"
  echo -e "    Simular Fluxo      — 3 emails: boleto, extrato, relatorio"
  echo -e "    Inadimplentes      — filtra apenas vencidos"
  echo ""
  echo -e "  Logs:    ${YELLOW}tail -f $LOG_DIR/api-node.log${NC}"
  echo -e "  Parar:   ${YELLOW}./scripts/dev.sh --stop${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo ""

  wait
}

# ─── Main ───
case "${1:-all}" in
  --stop)
    stop_all
    exit 0
    ;;
  --reset)
    stop_all
    log "Limpando volumes Docker..."
    cd "$ROOT_DIR"
    docker compose down -v 2>/dev/null || true
    log "Volumes removidos. Recriando do zero..."
    start_full
    ;;
  --infra)
    check_deps
    start_infra
    run_migrations
    log "Infra rodando. API e Web precisam ser iniciados manualmente."
    ;;
  --seed)
    run_seed
    ;;
  all|"")
    start_full
    ;;
  *)
    echo "Uso: ./scripts/dev.sh [--infra|--stop|--reset|--seed]"
    echo ""
    echo "  (sem flag)  Sobe tudo: infra + migrations + seed + testes + API + Web"
    echo "  --infra     Sobe so PostgreSQL, Redis, MinIO + migrations"
    echo "  --seed      Roda apenas o seed (banco precisa estar rodando)"
    echo "  --stop      Para tudo"
    echo "  --reset     Para tudo, limpa volumes, recria do zero"
    exit 0
    ;;
esac
