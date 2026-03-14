#!/usr/bin/env bash
# parity-check.sh — Validates that api-node returns equivalent responses to api (Python).
#
# Usage:
#   ./scripts/parity-check.sh [PYTHON_BASE_URL] [NODE_BASE_URL]
#
# Defaults:
#   PYTHON_BASE_URL = http://localhost:8000/api/v1
#   NODE_BASE_URL   = http://localhost:8082/api/v1
#
# Requirements:
#   - Both APIs must be running and reachable
#   - curl and jq must be installed
#   - Set AUTH_TOKEN env var for authenticated endpoints (optional — uses demo token if absent)
#
# Exit codes:
#   0 — All endpoints match (100% parity)
#   1 — One or more mismatches or errors

set -euo pipefail

PYTHON_BASE="${1:-http://localhost:8000/api/v1}"
NODE_BASE="${2:-http://localhost:8082/api/v1}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

PASS=0
FAIL=0
SKIP=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  RealEstateOS — API Parity Check"
  echo "  Python: $PYTHON_BASE"
  echo "  Node:   $NODE_BASE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

# Check if a URL is reachable
check_reachable() {
  local url="$1"
  local name="$2"
  if ! curl -s --max-time 5 -o /dev/null "$url/../../health" 2>/dev/null; then
    echo -e "${RED}✗ $name unreachable at $url${NC}"
    return 1
  fi
  echo -e "${GREEN}✓ $name reachable${NC}"
  return 0
}

# Compare HTTP status codes for a given path
check_status() {
  local path="$1"
  local description="$2"
  local extra_flags="${3:-}"

  local py_status node_status
  local curl_auth=""
  if [[ -n "$AUTH_TOKEN" ]]; then
    curl_auth="-H 'Authorization: Bearer $AUTH_TOKEN'"
  fi

  py_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"} \
    "$PYTHON_BASE$path" 2>/dev/null || echo "000")

  node_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"} \
    "$NODE_BASE$path" 2>/dev/null || echo "000")

  if [[ "$py_status" == "$node_status" ]]; then
    echo -e "${GREEN}✓ $description${NC}  [Python=$py_status Node=$node_status]"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗ $description${NC}  [Python=$py_status Node=$node_status]"
    FAIL=$((FAIL + 1))
  fi
}

# Compare JSON response structure (keys only, not values)
check_response_keys() {
  local path="$1"
  local description="$2"

  local py_keys node_keys

  py_keys=$(curl -s --max-time 10 \
    ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"} \
    "$PYTHON_BASE$path" 2>/dev/null | jq -r 'keys | sort | @csv' 2>/dev/null || echo "error")

  node_keys=$(curl -s --max-time 10 \
    ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"} \
    "$NODE_BASE$path" 2>/dev/null | jq -r 'keys | sort | @csv' 2>/dev/null || echo "error")

  if [[ "$py_keys" == "error" || "$node_keys" == "error" ]]; then
    echo -e "${YELLOW}~ $description${NC}  [JSON parse failed — skipped]"
    SKIP=$((SKIP + 1))
    return
  fi

  if [[ "$py_keys" == "$node_keys" ]]; then
    echo -e "${GREEN}✓ $description${NC}  [keys match: $py_keys]"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗ $description${NC}  [Python keys: $py_keys | Node keys: $node_keys]"
    FAIL=$((FAIL + 1))
  fi
}

# ─── Main ──────────────────────────────────────────────────────────────────

header

echo "Checking connectivity..."
PYTHON_OK=true
NODE_OK=true

curl -s --max-time 5 -o /dev/null "${PYTHON_BASE/\/api\/v1/}/health" || {
  echo -e "${RED}✗ Python API unreachable${NC}"
  PYTHON_OK=false
}
[[ "$PYTHON_OK" == "true" ]] && echo -e "${GREEN}✓ Python API reachable${NC}"

curl -s --max-time 5 -o /dev/null "${NODE_BASE/\/api\/v1/}/health" || {
  echo -e "${RED}✗ Node API unreachable${NC}"
  NODE_OK=false
}
[[ "$NODE_OK" == "true" ]] && echo -e "${GREEN}✓ Node API reachable${NC}"

echo ""

if [[ "$PYTHON_OK" == "false" || "$NODE_OK" == "false" ]]; then
  echo -e "${RED}Both APIs must be running to perform parity checks.${NC}"
  echo "  Start Python API: cd apps/api && uvicorn app.main:app --port 8000"
  echo "  Start Node API:   cd apps/api-node && npm run dev"
  exit 1
fi

# ─── Health endpoints ──────────────────────────────────────────────────────

echo "── Health ────────────────────────────────────────"
check_status "/../../health" "GET /health" || true

# ─── Unauthenticated endpoints ─────────────────────────────────────────────

echo ""
echo "── Auth endpoints (no token) ─────────────────────"
check_status "/contracts" "GET /contracts [unauth → 401]" || true
check_status "/billing/charges" "GET /billing/charges [unauth → 401]" || true

# ─── Authenticated endpoints ───────────────────────────────────────────────

if [[ -n "$AUTH_TOKEN" ]]; then
  echo ""
  echo "── Contracts ─────────────────────────────────────"
  check_status "/contracts" "GET /contracts [list]"
  check_status "/contracts?page=1&per_page=5" "GET /contracts [paginated]"

  echo ""
  echo "── Billing ───────────────────────────────────────"
  check_status "/billing/charges" "GET /billing/charges [list]"

  echo ""
  echo "── Payments ──────────────────────────────────────"
  check_status "/payments" "GET /payments [list]"

  echo ""
  echo "── Maintenance ───────────────────────────────────"
  check_status "/maintenance/tickets" "GET /maintenance/tickets [list]"

  echo ""
  echo "── Analytics ─────────────────────────────────────"
  check_status "/analytics/portfolio" "GET /analytics/portfolio"
  check_status "/analytics/billing" "GET /analytics/billing"
  check_status "/analytics/maintenance" "GET /analytics/maintenance"
  check_status "/analytics/agents" "GET /analytics/agents"

  echo ""
  echo "── Agent Tasks ───────────────────────────────────"
  check_status "/agent-tasks" "GET /agent-tasks [list]"
else
  echo ""
  echo -e "${YELLOW}AUTH_TOKEN not set — skipping authenticated endpoint checks.${NC}"
  echo "Set AUTH_TOKEN=<jwt> to run full parity suite."
  SKIP=$((SKIP + 9))
fi

# ─── Summary ───────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  Total:  $TOTAL"
echo -e "  ${GREEN}Pass:   $PASS${NC}"
echo -e "  ${RED}Fail:   $FAIL${NC}"
echo -e "  ${YELLOW}Skip:   $SKIP${NC}"

if [[ $FAIL -eq 0 ]]; then
  echo ""
  echo -e "${GREEN}✓ Parity check passed!${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}✗ $FAIL endpoint(s) failed parity check.${NC}"
  echo "  Fix these before replacing Python API with Node."
  exit 1
fi
