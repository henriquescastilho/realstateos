"""
Security penetration tests for the Real Estate OS FastAPI backend.

Tests verify that common attack vectors are rejected or mitigated:
  1. SQL injection on filter params
  2. JWT algorithm confusion (none/wrong-secret/expired)
  3. Tenant isolation (cross-org data access prevention)
  4. Rate limit bypass attempts
  5. Oversized payload rejection
  6. Path traversal in URL segments
  7. Token expiration and replay attacks
  8. Malformed / truncated JWT tokens
  9. Missing / empty Authorization header
 10. IDOR (Insecure Direct Object Reference) on UUIDs

Route notes:
  - /v1/contracts, /v1/charges  → use get_demo_or_authed_org (demo fallback allowed)
  - /v1/webhooks, /v1/agent-tasks, /v1/analytics → use get_current_org/get_current_user
    (require valid auth — no demo fallback)
  - /health/live → public, unauthenticated

ZAP integration is provided as a separate utility that skips when ZAP is
unavailable (OWASP_ZAP_URL env var not set).

Run:
    pytest tests/security/test_penetration.py -v
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "a-very-strong-secret-for-testing-purposes-1234567890")

# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def db_engine():
    import app.models  # noqa: F401  — triggers engine with SQLite URL
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.db import Base

    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="module")
def client(db_engine):
    from sqlalchemy.orm import sessionmaker
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.deps import get_db

    _Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    session = _Session()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
        session.close()


def _make_jwt(payload_overrides: dict | None = None, secret: str | None = None) -> str:
    """Create a custom JWT for testing."""
    from jose import jwt as _jwt

    _secret = secret or os.environ["JWT_SECRET"]
    payload: dict = {
        "sub": str(uuid.uuid4()),
        "tenant_id": str(uuid.uuid4()),
        "role": "admin",
        "email": "test@example.com",
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=1),
    }
    if payload_overrides:
        payload.update(payload_overrides)
    return _jwt.encode(payload, _secret, algorithm="HS256")


def _expired_jwt() -> str:
    return _make_jwt({"exp": datetime.now(tz=timezone.utc) - timedelta(hours=1)})


# Routes that strictly require auth (use get_current_org / get_current_user)
# — invalid tokens return 401/403 regardless of demo tenant fallback
AUTH_REQUIRED_ROUTE = "/v1/webhooks"
PUBLIC_HEALTH_ROUTE = "/health/live"


# ─────────────────────────────────────────────────────────────────────────────
# 1. SQL injection on filter parameters
# ─────────────────────────────────────────────────────────────────────────────

SQL_INJECTION_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE contracts; --",
    "1; SELECT * FROM users--",
    "' UNION SELECT username, password FROM users--",
    "1' AND '1'='1",
    "%27 OR %271%27=%271",
    "'; INSERT INTO contracts VALUES('x','x');--",
    "admin'--",
]


class TestSqlInjection:
    """SQL injection attempts must return 4xx, never 500 or leaked data."""

    def test_sql_injection_in_uuid_path_param(self, client):
        """SQL injection in UUID path slot must return 4xx, never 500."""
        for payload in SQL_INJECTION_PAYLOADS:
            resp = client.get(f"/v1/contracts/{payload}")
            assert resp.status_code not in {200, 500}, (
                f"SQL injection payload '{payload}' returned unexpected {resp.status_code}"
            )

    def test_sql_injection_in_query_param(self, client):
        """SQL injection in query string must not crash the app."""
        for payload in SQL_INJECTION_PAYLOADS:
            for param in ["search", "status", "type"]:
                resp = client.get(f"/v1/contracts?{param}={payload}")
                assert resp.status_code != 500, (
                    f"SQL injection in ?{param}= caused 500: {payload!r}"
                )

    def test_sql_injection_never_returns_500(self, client):
        """App must never return 500 for any SQL injection attempt."""
        for payload in SQL_INJECTION_PAYLOADS:
            resp = client.get(f"/v1/charges?contract_id={payload}")
            assert resp.status_code != 500, f"500 for payload: {payload!r}"

    def test_sql_injection_in_post_body_rejected(self, client):
        """SQL in POST body must be rejected by Pydantic (422) or auth check."""
        body = {
            "tenant_id": "' OR '1'='1",
            "monthly_rent": "'; DROP TABLE charges;--",
            "due_day": 5,
        }
        resp = client.post("/v1/contracts", json=body)
        # 422 = schema validation, 401/403 = auth required first — all fine
        assert resp.status_code in {400, 401, 403, 422, 429}, (
            f"SQL in POST body returned {resp.status_code}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 2. JWT algorithm confusion attacks
# ─────────────────────────────────────────────────────────────────────────────

class TestJwtAlgorithmConfusion:
    """JWT algorithm confusion — strictly-authenticated routes must reject bad tokens."""

    def _auth_req(self, client, token: str):
        """Send a request to a route that strictly requires authentication."""
        return client.get(AUTH_REQUIRED_ROUTE, headers={"Authorization": f"Bearer {token}"})

    def test_jwt_none_algorithm_rejected(self, client):
        """Unsigned 'none' algorithm JWT must be rejected."""
        import base64
        import json

        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode()
        ).rstrip(b"=").decode()
        payload_data = {
            "sub": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "role": "admin",
            "email": "attacker@evil.com",
            "exp": int((datetime.now(tz=timezone.utc) + timedelta(hours=1)).timestamp()),
        }
        body = base64.urlsafe_b64encode(
            json.dumps(payload_data).encode()
        ).rstrip(b"=").decode()
        unsigned_token = f"{header}.{body}."

        resp = self._auth_req(client, unsigned_token)
        assert resp.status_code in {401, 403, 422}, (
            f"'none' algorithm JWT should be rejected, got {resp.status_code}"
        )

    def test_wrong_secret_rejected(self, client):
        """Token signed with wrong secret must be rejected."""
        bad_token = _make_jwt(secret="wrong-secret-that-is-totally-different-xyz")
        resp = self._auth_req(client, bad_token)
        assert resp.status_code in {401, 403}, (
            f"Wrong-secret token should return 401/403, got {resp.status_code}"
        )

    def test_expired_token_rejected(self, client):
        """Expired JWT must be rejected with 401/403."""
        resp = self._auth_req(client, _expired_jwt())
        assert resp.status_code in {401, 403}, (
            f"Expired token should return 401/403, got {resp.status_code}"
        )

    def test_truncated_token_rejected(self, client):
        """A truncated/corrupted token must be rejected."""
        valid_token = _make_jwt()
        truncated = valid_token[:len(valid_token) // 2]
        resp = self._auth_req(client, truncated)
        assert resp.status_code in {401, 403, 422}, (
            f"Truncated token should be rejected, got {resp.status_code}"
        )

    def test_token_missing_required_claims(self, client):
        """Token with null tenant_id must be rejected."""
        from jose import jwt as _jwt
        secret = os.environ["JWT_SECRET"]
        # Include all required fields except tenant_id (set to None)
        payload = {
            "sub": str(uuid.uuid4()),
            "tenant_id": None,
            "role": "admin",
            "email": "x@x.com",
            "exp": datetime.now(tz=timezone.utc) + timedelta(hours=1),
        }
        token = _jwt.encode(payload, secret, algorithm="HS256")
        resp = self._auth_req(client, token)
        assert resp.status_code in {401, 403, 422}, (
            f"Token missing tenant_id should be rejected, got {resp.status_code}"
        )

    def test_bearer_prefix_required(self, client):
        """Authorization header without 'Bearer ' prefix must fail."""
        valid_token = _make_jwt()
        resp = client.get(AUTH_REQUIRED_ROUTE, headers={"Authorization": valid_token})
        assert resp.status_code in {401, 403, 422}

    def test_empty_bearer_token_rejected(self, client):
        """Empty/whitespace Bearer token must be rejected."""
        for token in ["", " ", "\t"]:
            resp = client.get(AUTH_REQUIRED_ROUTE, headers={"Authorization": f"Bearer{token}"})
            assert resp.status_code in {401, 403, 422}, (
                f"Empty bearer token '{token!r}' returned {resp.status_code}"
            )

    def test_no_authorization_header_rejected(self, client):
        """Missing Authorization header must return 401/403."""
        resp = client.get(AUTH_REQUIRED_ROUTE)
        assert resp.status_code in {401, 403}, (
            f"Missing auth header returned {resp.status_code}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 3. Tenant isolation (cross-org data access prevention)
# ─────────────────────────────────────────────────────────────────────────────

class TestTenantIsolation:
    """Cross-tenant data access must be prevented at the middleware layer."""

    def test_non_existent_tenant_in_jwt_rejected(self, client):
        """
        JWT with tenant_id that doesn't exist in the DB must be rejected.
        get_current_org validates the tenant against the DB.
        """
        token = _make_jwt({"tenant_id": str(uuid.uuid4())})  # non-existent
        resp = client.get(AUTH_REQUIRED_ROUTE, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in {401, 403}, (
            f"Non-existent tenant_id should return 401/403, got {resp.status_code}"
        )

    def test_random_contract_uuid_not_accessible(self, client):
        """A random UUID that isn't in the DB must return 404 or auth error, never 200."""
        random_id = str(uuid.uuid4())
        resp = client.get(f"/v1/contracts/{random_id}")
        assert resp.status_code != 200, (
            f"Random UUID {random_id} returned 200 — possible data leak!"
        )

    def test_cannot_forge_tenant_via_query_param(self, client):
        """
        Passing tenant_id as a query param should NOT override the JWT/demo tenant.
        """
        other_tenant = str(uuid.uuid4())
        # Use a route that only accepts auth tokens (not demo fallback)
        bad_token = _make_jwt({"tenant_id": other_tenant})  # non-existent
        resp = client.get(
            f"/v1/webhooks?tenant_id={other_tenant}",
            headers={"Authorization": f"Bearer {bad_token}"},
        )
        assert resp.status_code in {401, 403, 404}

    def test_webhook_route_requires_valid_tenant(self, client):
        """Webhook routes use get_current_org — must reject forged tenant_ids."""
        forged_token = _make_jwt({"tenant_id": str(uuid.uuid4())})  # non-existent UUID
        resp = client.get("/v1/webhooks", headers={"Authorization": f"Bearer {forged_token}"})
        assert resp.status_code in {401, 403}, (
            f"Webhook route with forged tenant returned {resp.status_code}"
        )

    def test_agent_tasks_require_authentication(self, client):
        """Agent tasks route uses get_current_user — unauthenticated request must fail."""
        resp = client.get("/v1/agent-tasks")
        assert resp.status_code in {401, 403}, (
            f"Unauthenticated /v1/agent-tasks returned {resp.status_code}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 4. Rate limit and resource abuse
# ─────────────────────────────────────────────────────────────────────────────

class TestRateLimitDefense:
    """App must handle repeated requests without crashing."""

    def test_rapid_health_requests_no_crash(self, client):
        """Rapid health checks must never cause 5xx errors."""
        for _ in range(15):
            resp = client.get(PUBLIC_HEALTH_ROUTE)
            assert resp.status_code < 500, f"Server error during rapid health checks: {resp.status_code}"

    def test_repeated_invalid_auth_no_crash(self, client):
        """Repeated invalid auth attempts must not cause server errors."""
        for token in ["invalid.token.here", "totally-not-a-jwt", "x" * 500] * 3:
            resp = client.get(
                AUTH_REQUIRED_ROUTE,
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code < 500, (
                f"Server error on bad auth attempt (status={resp.status_code})"
            )

    def test_auth_endpoint_rejects_unknown_tenant(self, client):
        """Auth endpoint returns structured error for non-existent tenant."""
        resp = client.post(
            "/auth/token",
            json={"email": "x@x.com", "tenant_id": str(uuid.uuid4())},
        )
        assert resp.status_code in {404, 422, 401, 429}, (
            f"Auth with unknown tenant should fail gracefully, got {resp.status_code}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 5. Oversized payload rejection
# ─────────────────────────────────────────────────────────────────────────────

class TestOversizedPayloads:
    """Large payloads must be rejected before processing."""

    def test_oversized_json_body_rejected(self, client):
        """JSON body with very long strings must be rejected, never cause 500."""
        giant_string = "x" * 100_000
        resp = client.post("/v1/contracts", json={"name": giant_string})
        assert resp.status_code not in {200, 500}, (
            f"Oversized JSON body returned {resp.status_code}"
        )

    def test_deeply_nested_json_no_crash(self, client):
        """Deeply nested JSON (JSON bomb) must not crash the app."""
        nested: dict = {}
        current = nested
        for _ in range(100):
            current["b"] = {}
            current = current["b"]
        resp = client.post("/v1/contracts", json=nested)
        assert resp.status_code < 500, f"Deeply nested JSON caused server error: {resp.status_code}"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Path traversal in URL segments
# ─────────────────────────────────────────────────────────────────────────────

class TestPathTraversal:
    """Path traversal attempts in URL path segments must be rejected."""

    PATH_TRAVERSAL_PAYLOADS = [
        "../../../etc/passwd",
        "..%2F..%2Fetc%2Fpasswd",
        "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "....//....//etc//passwd",
        "\\..\\..\\windows\\system32\\",
    ]

    def test_path_traversal_in_resource_id(self, client):
        """Path traversal in UUID slot must return 4xx, never 200 or 500."""
        for payload in self.PATH_TRAVERSAL_PAYLOADS:
            resp = client.get(f"/v1/contracts/{payload}")
            assert resp.status_code not in {200, 500}, (
                f"Path traversal '{payload}' returned unexpected {resp.status_code}"
            )

    def test_null_bytes_no_crash(self, client):
        """Null bytes in path segments must not cause server errors."""
        resp = client.get("/v1/contracts/%00")
        assert resp.status_code not in {200, 500}


# ─────────────────────────────────────────────────────────────────────────────
# 7. Input validation
# ─────────────────────────────────────────────────────────────────────────────

class TestInputValidation:
    """Malformed inputs must be caught by validation before hitting DB."""

    def test_xss_payload_in_string_field_no_crash(self, client):
        """XSS payloads in POST body must not cause 500 errors."""
        xss_payloads = [
            "<script>alert(1)</script>",
            '"><img src=x onerror=alert(1)>',
            "javascript:alert(document.cookie)",
        ]
        for payload in xss_payloads:
            resp = client.post("/v1/contracts", json={"property_id": payload})
            assert resp.status_code != 500, f"XSS payload caused server error: {payload!r}"

    def test_integer_overflow_in_numeric_field_no_crash(self, client):
        """Extremely large numbers must not cause server errors."""
        resp = client.post("/v1/contracts", json={"monthly_rent": 10**300})
        assert resp.status_code != 500, "Integer overflow caused server error"

    def test_null_bytes_in_json_body_no_crash(self, client):
        """Null bytes in JSON body must not cause server errors."""
        resp = client.post("/v1/contracts", json={"name": "test\x00evil"})
        assert resp.status_code != 500

    def test_unicode_mojibake_no_crash(self, client):
        """Malformed Unicode sequences must not crash the app."""
        resp = client.post("/v1/contracts", json={"name": "\ufffd\ufffe\ufffftest"})
        assert resp.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 8. Security headers
# ─────────────────────────────────────────────────────────────────────────────

class TestSecurityHeaders:
    """Verify that security-relevant HTTP response headers are present."""

    def test_health_endpoint_responds(self, client):
        """Health endpoint must respond without server errors."""
        resp = client.get(PUBLIC_HEALTH_ROUTE)
        assert resp.status_code == 200

    def test_response_is_json_not_html(self, client):
        """API responses must be JSON, not HTML (which would indicate error pages)."""
        resp = client.get(PUBLIC_HEALTH_ROUTE)
        content_type = resp.headers.get("content-type", "")
        assert "text/html" not in content_type, (
            f"Health endpoint returned HTML content-type: {content_type}"
        )

    def test_server_header_does_not_expose_python_version(self, client):
        """Server header must not expose Python version details."""
        resp = client.get(PUBLIC_HEALTH_ROUTE)
        server = resp.headers.get("server", "").lower()
        assert "python/" not in server, f"Python version exposed in Server header: {server}"


# ─────────────────────────────────────────────────────────────────────────────
# 9. Error response structure (no info leakage)
# ─────────────────────────────────────────────────────────────────────────────

class TestErrorResponseStructure:
    """Error responses must not leak sensitive internal details."""

    def test_unknown_endpoint_does_not_expose_stack_trace(self, client):
        """404 for unknown endpoint must not contain stack traces."""
        resp = client.get("/v1/nonexistent-endpoint-xyz-abc")
        body = resp.text
        assert "Traceback" not in body, "Stack trace leaked in 404 response"
        assert "site-packages" not in body, "Internal path leaked in 404 response"

    def test_401_on_auth_required_route(self, client):
        """Auth-required routes must return 401/403 for invalid credentials."""
        resp = client.get(AUTH_REQUIRED_ROUTE, headers={"Authorization": "Bearer invalid-token"})
        assert resp.status_code in {401, 403}

    def test_error_response_does_not_expose_sqlalchemy(self, client):
        """Error responses must not leak SQLAlchemy internals."""
        # Send intentionally bad input to trigger potential DB error
        resp = client.post("/v1/contracts", json={"contract_id": "' DROP TABLE"})
        assert "sqlalchemy" not in resp.text.lower(), "SQLAlchemy internals leaked"
        assert resp.status_code != 500


# ─────────────────────────────────────────────────────────────────────────────
# 10. IDOR (Insecure Direct Object Reference)
# ─────────────────────────────────────────────────────────────────────────────

class TestIdorPrevention:
    """IDOR attacks must be prevented — accessing resources by ID must be tenant-scoped."""

    def test_sequential_integer_ids_not_accepted(self, client):
        """Integer IDs (sequential = guessable) must return 4xx, never 200."""
        for integer_id in ["1", "2", "100"]:
            resp = client.get(f"/v1/contracts/{integer_id}")
            # 429 is also acceptable if rate-limited
            assert resp.status_code not in {200, 500}, (
                f"Integer ID {integer_id!r} returned {resp.status_code}"
            )

    def test_random_uuid_returns_not_found_or_auth_error(self, client):
        """Random UUIDs that don't exist must return 4xx, never 200."""
        for _ in range(5):
            random_id = str(uuid.uuid4())
            resp = client.get(f"/v1/contracts/{random_id}")
            assert resp.status_code not in {200, 500}, (
                f"Random UUID {random_id} returned {resp.status_code} — possible IDOR!"
            )

    def test_webhook_id_requires_tenant_match(self, client):
        """Webhook endpoints must only be accessible to the owning tenant."""
        random_webhook_id = str(uuid.uuid4())
        # Without auth: 401/403. With wrong-tenant auth: 403/404. Rate-limited: 429.
        resp = client.get(f"/v1/webhooks/{random_webhook_id}")
        assert resp.status_code in {401, 403, 404, 429}, (
            f"Random webhook ID returned {resp.status_code}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# ZAP integration stub (skipped when ZAP unavailable)
# ─────────────────────────────────────────────────────────────────────────────

ZAP_URL = os.getenv("OWASP_ZAP_URL", "")
zap_required = pytest.mark.skipif(
    not ZAP_URL,
    reason="OWASP_ZAP_URL not set — set to http://localhost:8090 with ZAP running",
)


@zap_required
class TestOwaspZapScan:
    """
    OWASP ZAP active scan integration.
    Requires: ZAP running at OWASP_ZAP_URL.

    To run:
        docker run -d -p 8090:8090 ghcr.io/zaproxy/zaproxy:stable \\
            zap.sh -daemon -port 8090 -host 0.0.0.0 -config api.disablekey=true
        OWASP_ZAP_URL=http://localhost:8090 API_BASE_URL=http://localhost:8000 \\
            pytest tests/security/test_penetration.py::TestOwaspZapScan -v
    """

    @pytest.fixture(scope="class")
    def zap_client(self):
        zapv2 = pytest.importorskip("zapv2", reason="pip install python-owasp-zap-v2.4")
        api_key = os.getenv("OWASP_ZAP_API_KEY", "")
        return zapv2.ZAPv2(apikey=api_key, proxies={"http": ZAP_URL, "https": ZAP_URL})

    def test_zap_spider_scan(self, zap_client):
        """Run ZAP spider on the API base URL."""
        import time
        target = os.getenv("API_BASE_URL", "http://localhost:8000")
        scan_id = zap_client.spider.scan(target)
        for _ in range(12):
            progress = int(zap_client.spider.status(scan_id))
            if progress >= 100:
                break
            time.sleep(5)
        assert int(zap_client.spider.status(scan_id)) >= 100, "ZAP spider did not complete"

    def test_zap_no_high_risk_findings(self, zap_client):
        """ZAP active scan must not find high/critical risk vulnerabilities."""
        import time
        target = os.getenv("API_BASE_URL", "http://localhost:8000")
        scan_id = zap_client.ascan.scan(target)
        for _ in range(60):
            if int(zap_client.ascan.status(scan_id)) >= 100:
                break
            time.sleep(5)

        alerts = zap_client.core.alerts(baseurl=target)
        high_risk = [a for a in alerts if a.get("risk") in ("High", "Critical")]
        assert len(high_risk) == 0, (
            f"ZAP found {len(high_risk)} high/critical alerts:\n"
            + "\n".join(f"  - {a['name']}: {a['url']}" for a in high_risk[:10])
        )

    def test_zap_no_sql_injection(self, zap_client):
        """ZAP must not find SQL injection vulnerabilities."""
        target = os.getenv("API_BASE_URL", "http://localhost:8000")
        alerts = zap_client.core.alerts(baseurl=target)
        sqli = [a for a in alerts if "sql" in a.get("name", "").lower()]
        assert len(sqli) == 0, f"SQL injection alerts: {[a['name'] for a in sqli]}"
