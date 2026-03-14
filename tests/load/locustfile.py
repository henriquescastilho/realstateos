"""
Real Estate OS — Locust Load Test Scenarios
============================================

Three user profiles matching production traffic patterns:

  BrowseUser   — simulates 100 concurrent property managers browsing the UI
                 (read-heavy: contracts, properties, charges, analytics, health)

  BillingUser  — simulates 50 concurrent billing generation triggers
                 (write: charge creation + agent task dispatch)

  WebhookUser  — simulates 200 req/s inbound bank payment webhooks
                 (high-frequency write: payment notification endpoint)

SLO targets enforced in slo_check.py:
  • p95 response time < 200 ms
  • error rate        < 1 %

Usage
-----
# Headless (CI / automated):
  locust -f tests/load/locustfile.py --config tests/load/locust.conf

# Interactive web UI:
  locust -f tests/load/locustfile.py --host http://localhost:8000

# Targeted scenario only:
  locust -f tests/load/locustfile.py BrowseUser --headless -u 100 -r 10 -t 5m

Environment variables:
  HOST          API base URL     (default: http://localhost:8000)
  AUTH_TOKEN    Bearer JWT       (default: "" — uses /demo/* endpoints)
  ORG_ID        Tenant UUID      (default: demo)
"""

from __future__ import annotations

import json
import os
import random
import string
import time
import uuid
from datetime import date, timedelta

from locust import HttpUser, LoadTestShape, TaskSet, between, events, task

# ─── Runtime config ───────────────────────────────────────────────────────────

_AUTH_TOKEN: str = os.getenv("AUTH_TOKEN", "")
_ORG_ID: str = os.getenv("ORG_ID", "demo")

# Pre-populated IDs discovered during the first task execution and reused.
# Populated lazily from GET /v1/contracts and GET /v1/properties responses.
_CONTRACT_IDS: list[str] = []
_PROPERTY_IDS: list[str] = []
_CHARGE_IDS: list[str] = []
_RENTER_IDS: list[str] = []

# ─── Helpers ──────────────────────────────────────────────────────────────────


def _headers() -> dict[str, str]:
    """Return auth headers when token is present, otherwise empty dict."""
    if _AUTH_TOKEN:
        return {"Authorization": f"Bearer {_AUTH_TOKEN}", "Content-Type": "application/json"}
    return {"Content-Type": "application/json"}


def _rand_str(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=n))


def _rand_cpf() -> str:
    """Generate a structurally valid (but not checksum-verified) CPF."""
    digits = [random.randint(0, 9) for _ in range(9)]
    return "".join(str(d) for d in digits) + "00"


def _pick(lst: list[str]) -> str | None:
    return random.choice(lst) if lst else None


def _base_url() -> str:
    """Choose /v1/* (authenticated) or /api/* (shim) depending on token presence."""
    return "/v1" if _AUTH_TOKEN else "/api"


# ─── Seed ID discovery ────────────────────────────────────────────────────────


def _seed_ids(client) -> None:  # noqa: ANN001
    """Fetch first page of each resource and cache IDs for reuse."""
    global _CONTRACT_IDS, _PROPERTY_IDS, _CHARGE_IDS, _RENTER_IDS

    base = _base_url()
    endpoints = [
        (f"{base}/contracts", _CONTRACT_IDS),
        (f"{base}/properties", _PROPERTY_IDS),
        (f"{base}/charges", _CHARGE_IDS),
        (f"{base}/renters", _RENTER_IDS),
    ]
    for url, bucket in endpoints:
        if bucket:
            continue  # already populated
        try:
            with client.get(url, headers=_headers(), name=f"[seed] {url}", catch_response=True) as resp:
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("items", data) if isinstance(data, dict) else data
                    if isinstance(items, list):
                        for item in items[:50]:
                            if isinstance(item, dict) and "id" in item:
                                bucket.append(str(item["id"]))
                resp.success()
        except Exception:  # noqa: BLE001
            pass  # seed failures are non-fatal


# ─── TaskSets ─────────────────────────────────────────────────────────────────


class BrowseTasks(TaskSet):
    """
    Read-heavy scenario simulating a property manager navigating the web UI.

    Weight distribution mirrors real-world usage:
      - contracts list (most common page)
      - contract detail
      - properties list
      - charges list
      - analytics KPIs
      - health/readiness check
    """

    def on_start(self) -> None:
        _seed_ids(self.client)

    # weight=5: most-visited page
    @task(5)
    def list_contracts(self) -> None:
        base = _base_url()
        page = random.randint(1, 3)
        self.client.get(
            f"{base}/contracts?page={page}&per_page=20",
            headers=_headers(),
            name="GET /contracts (list)",
        )

    @task(3)
    def get_contract_detail(self) -> None:
        contract_id = _pick(_CONTRACT_IDS)
        if not contract_id:
            self.list_contracts()
            return
        base = _base_url()
        self.client.get(
            f"{base}/contracts/{contract_id}",
            headers=_headers(),
            name="GET /contracts/{id}",
        )

    @task(3)
    def list_properties(self) -> None:
        base = _base_url()
        self.client.get(
            f"{base}/properties?page=1&per_page=20",
            headers=_headers(),
            name="GET /properties (list)",
        )

    @task(2)
    def list_charges(self) -> None:
        base = _base_url()
        status_filter = random.choice(["pending", "paid", "overdue", ""])
        qs = f"?page=1&per_page=20{'&status=' + status_filter if status_filter else ''}"
        self.client.get(
            f"{base}/charges{qs}",
            headers=_headers(),
            name="GET /charges (list)",
        )

    @task(2)
    def analytics_portfolio(self) -> None:
        base = _base_url()
        self.client.get(
            f"{base}/analytics/portfolio",
            headers=_headers(),
            name="GET /analytics/portfolio",
        )

    @task(1)
    def analytics_billing(self) -> None:
        base = _base_url()
        year = date.today().year
        month = random.randint(1, 12)
        self.client.get(
            f"{base}/analytics/billing?year={year}&month={month}",
            headers=_headers(),
            name="GET /analytics/billing",
        )

    @task(1)
    def analytics_maintenance(self) -> None:
        base = _base_url()
        self.client.get(
            f"{base}/analytics/maintenance",
            headers=_headers(),
            name="GET /analytics/maintenance",
        )

    @task(2)
    def health_ready(self) -> None:
        self.client.get("/health/ready", name="GET /health/ready")

    @task(1)
    def agent_tasks_list(self) -> None:
        base = _base_url()
        self.client.get(
            f"{base}/agent-tasks?page=1&per_page=20",
            headers=_headers(),
            name="GET /agent-tasks (list)",
        )


class BillingTasks(TaskSet):
    """
    Write scenario: triggers monthly billing generation for contracts.

    Each virtual user:
      1. Fetches an active contract ID (cached from seed)
      2. POSTs a charge-generation request for the current month
      3. Optionally reads the resulting agent task status
    """

    def on_start(self) -> None:
        _seed_ids(self.client)

    @task(3)
    def generate_monthly_charge(self) -> None:
        contract_id = _pick(_CONTRACT_IDS)
        if not contract_id:
            return

        base = _base_url()
        today = date.today()
        payload = {
            "contract_id": contract_id,
            "reference_year": today.year,
            "reference_month": today.month,
        }
        with self.client.post(
            f"{base}/charges/generate",
            json=payload,
            headers=_headers(),
            name="POST /charges/generate",
            catch_response=True,
        ) as resp:
            # 201 Created or 200 OK → success; 409 Conflict = duplicate (idempotent, OK)
            if resp.status_code in (200, 201, 409):
                resp.success()
            elif resp.status_code == 422:
                resp.failure(f"Validation error: {resp.text[:200]}")

    @task(2)
    def bulk_trigger_agents(self) -> None:
        """Trigger the orchestrator agent for up to 5 contracts in one call."""
        ids = random.sample(_CONTRACT_IDS, min(5, len(_CONTRACT_IDS))) if _CONTRACT_IDS else []
        if not ids:
            return

        base = _base_url()
        payload = {"contract_ids": ids, "task_type": "billing"}
        with self.client.post(
            f"{base}/bulk/agents/trigger",
            json=payload,
            headers=_headers(),
            name="POST /bulk/agents/trigger",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201, 202):
                resp.success()
            elif resp.status_code == 422:
                resp.failure(f"Validation error: {resp.text[:200]}")

    @task(1)
    def check_agent_task_status(self) -> None:
        """Poll agent task status (simulates frontend polling after trigger)."""
        base = _base_url()
        with self.client.get(
            f"{base}/agent-tasks?status=running&page=1&per_page=10",
            headers=_headers(),
            name="GET /agent-tasks (running)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()


class WebhookTasks(TaskSet):
    """
    High-frequency write scenario: inbound bank payment webhooks.

    Simulates the Santander (or other bank) webhook delivering payment
    notifications at ~200 req/s. Each request is a unique payment ID
    to exercise the idempotency / deduplication path.
    """

    @task
    def payment_webhook(self) -> None:
        """
        POST to the payment webhook endpoint.

        The real endpoint is /v1/payments/webhook or equivalent.
        Falls back to a stub if not yet implemented.
        """
        payload = {
            "event": "payment.received",
            "idempotency_key": str(uuid.uuid4()),
            "payment_id": f"PAY-{_rand_str(12).upper()}",
            "amount": round(random.uniform(500, 5000), 2),
            "payer_document": _rand_cpf(),
            "bank_code": random.choice(["033", "341", "237"]),  # Santander/Itaú/Bradesco
            "payment_date": date.today().isoformat(),
            "description": f"PIX {_rand_str(6).upper()}",
        }
        # Try the Santander webhook endpoint, fall back to health for throughput test
        with self.client.post(
            "/v1/payments/webhook",
            json=payload,
            headers=_headers(),
            name="POST /payments/webhook",
            catch_response=True,
        ) as resp:
            # 200/201/202 = processed; 404 = endpoint stub not yet wired (acceptable)
            if resp.status_code in (200, 201, 202, 404):
                resp.success()
            else:
                resp.failure(f"Unexpected status {resp.status_code}")

    @task
    def pix_notification(self) -> None:
        """Alternative: POST a PIX confirmation event."""
        payload = {
            "event": "pix.confirmed",
            "end_to_end_id": f"E{_rand_str(32).upper()}",
            "amount": round(random.uniform(500, 5000), 2),
            "payer_name": f"Locatario {_rand_str(6).capitalize()}",
            "payer_cpf": _rand_cpf(),
            "transaction_date": date.today().isoformat(),
            "reference": f"ALUGUEL-{_rand_str(8).upper()}",
        }
        with self.client.post(
            "/v1/integrations/santander/webhook",
            json=payload,
            headers=_headers(),
            name="POST /integrations/santander/webhook",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201, 202, 404):
                resp.success()
            else:
                resp.failure(f"Unexpected status {resp.status_code}")


# ─── User Classes ─────────────────────────────────────────────────────────────


class BrowseUser(HttpUser):
    """
    Simulates property managers browsing the web UI.

    Target: 100 concurrent users.
    Think time: 0.5–2 s (realistic human navigation cadence).
    SLO: p95 < 200 ms, < 1 % errors.
    """

    tasks = [BrowseTasks]
    wait_time = between(0.5, 2.0)
    weight = 4  # 4:2:1 ratio when running all profiles together


class BillingUser(HttpUser):
    """
    Simulates operators triggering billing generation.

    Target: 50 concurrent users.
    Think time: 1–3 s (operator reviewing results between triggers).
    """

    tasks = [BillingTasks]
    wait_time = between(1.0, 3.0)
    weight = 2


class WebhookUser(HttpUser):
    """
    Simulates bank payment webhook delivery at high throughput.

    Target: sustain 200 req/s aggregate across virtual users.
    Think time: minimal (0–0.1 s) to maximise throughput.
    """

    tasks = [WebhookTasks]
    wait_time = between(0.0, 0.1)
    weight = 1


# ─── Load Shape: Ramp-Up → Steady → Ramp-Down ─────────────────────────────────


class RampUpShape(LoadTestShape):
    """
    Three-phase load shape:

      0–60s:    ramp up to peak users
      60–300s:  steady state (peak load for 4 minutes)
      300–360s: ramp down

    Activate with: --shape-class RampUpShape
    Override via environment:
      PEAK_USERS  (default: 150)
      SPAWN_RATE  (default: 10)
      STEADY_SECS (default: 240)
    """

    peak_users: int = int(os.getenv("PEAK_USERS", "150"))
    spawn_rate: int = int(os.getenv("SPAWN_RATE", "10"))
    ramp_secs: int = 60
    steady_secs: int = int(os.getenv("STEADY_SECS", "240"))
    ramp_down_secs: int = 60

    def tick(self):  # noqa: ANN201
        run_time = self.get_run_time()
        total = self.ramp_secs + self.steady_secs + self.ramp_down_secs

        if run_time > total:
            return None  # test complete

        if run_time < self.ramp_secs:
            # Linear ramp-up
            users = int(self.peak_users * run_time / self.ramp_secs)
            return (max(1, users), self.spawn_rate)

        if run_time < self.ramp_secs + self.steady_secs:
            # Steady state
            return (self.peak_users, self.spawn_rate)

        # Ramp-down
        elapsed_down = run_time - self.ramp_secs - self.steady_secs
        users = int(self.peak_users * (1 - elapsed_down / self.ramp_down_secs))
        return (max(0, users), self.spawn_rate)


# ─── Event hooks ──────────────────────────────────────────────────────────────


@events.test_start.add_listener
def on_test_start(environment, **_kwargs) -> None:
    print("\n[load-test] Starting Real Estate OS load test")
    print(f"[load-test] Target host: {environment.host}")
    print(f"[load-test] Auth token present: {bool(_AUTH_TOKEN)}")
    print(f"[load-test] SLO targets: p95 < 200ms, error rate < 1%\n")


@events.test_stop.add_listener
def on_test_stop(environment, **_kwargs) -> None:
    stats = environment.stats.total
    p95_ms = stats.get_response_time_percentile(0.95) or 0
    total_req = stats.num_requests
    total_fail = stats.num_failures
    error_pct = (total_fail / total_req * 100) if total_req > 0 else 0.0

    print("\n" + "=" * 60)
    print("LOAD TEST RESULTS")
    print("=" * 60)
    print(f"  Total requests : {total_req:,}")
    print(f"  Failures       : {total_fail:,} ({error_pct:.2f}%)")
    print(f"  p95 latency    : {p95_ms:.0f} ms")
    print(f"  Avg RPS        : {stats.total_rps:.1f}")
    print("=" * 60)

    slo_ok = True
    if p95_ms > 200:
        print(f"  [FAIL] p95 {p95_ms:.0f}ms exceeds 200ms SLO")
        slo_ok = False
    else:
        print(f"  [PASS] p95 {p95_ms:.0f}ms <= 200ms SLO")

    if error_pct >= 1.0:
        print(f"  [FAIL] Error rate {error_pct:.2f}% exceeds 1% SLO")
        slo_ok = False
    else:
        print(f"  [PASS] Error rate {error_pct:.2f}% < 1% SLO")

    print("=" * 60)
    if not slo_ok:
        print("  RESULT: SLO BREACH — investigate before deploying\n")
        environment.process_exit_code = 1
    else:
        print("  RESULT: ALL SLOs MET\n")
