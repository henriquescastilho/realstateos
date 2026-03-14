"""Unit tests for app.services.webhook_service."""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.models.webhook import WebhookEndpoint


# ── _compute_signature ────────────────────────────────────────────────────────

class TestComputeSignature:
    def test_returns_sha256_prefix(self):
        from app.services.webhook_service import _compute_signature
        sig = _compute_signature("secret", b"hello")
        assert sig.startswith("sha256=")

    def test_deterministic_for_same_inputs(self):
        from app.services.webhook_service import _compute_signature
        sig1 = _compute_signature("my-secret", b"payload")
        sig2 = _compute_signature("my-secret", b"payload")
        assert sig1 == sig2

    def test_different_secrets_produce_different_sigs(self):
        from app.services.webhook_service import _compute_signature
        sig1 = _compute_signature("secret-A", b"body")
        sig2 = _compute_signature("secret-B", b"body")
        assert sig1 != sig2

    def test_different_bodies_produce_different_sigs(self):
        from app.services.webhook_service import _compute_signature
        sig1 = _compute_signature("secret", b"body-1")
        sig2 = _compute_signature("secret", b"body-2")
        assert sig1 != sig2

    def test_matches_manual_hmac(self):
        from app.services.webhook_service import _compute_signature
        secret = "test-secret"
        body = b"test-body"
        expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        assert _compute_signature(secret, body) == expected


# ── verify_webhook_signature ─────────────────────────────────────────────────

class TestVerifyWebhookSignature:
    def test_valid_signature_returns_true(self):
        from app.services.webhook_service import _compute_signature, verify_webhook_signature
        body = b'{"event": "test"}'
        secret = "my-webhook-secret"
        sig = _compute_signature(secret, body)
        assert verify_webhook_signature(secret, body, sig) is True

    def test_tampered_body_returns_false(self):
        from app.services.webhook_service import _compute_signature, verify_webhook_signature
        body = b'{"event": "test"}'
        secret = "my-webhook-secret"
        sig = _compute_signature(secret, body)
        assert verify_webhook_signature(secret, b'{"event": "tampered"}', sig) is False

    def test_wrong_secret_returns_false(self):
        from app.services.webhook_service import _compute_signature, verify_webhook_signature
        body = b"hello"
        sig = _compute_signature("correct-secret", body)
        assert verify_webhook_signature("wrong-secret", body, sig) is False

    def test_empty_body_valid_sig(self):
        from app.services.webhook_service import _compute_signature, verify_webhook_signature
        sig = _compute_signature("s", b"")
        assert verify_webhook_signature("s", b"", sig) is True


# ── dispatch_webhook_event ────────────────────────────────────────────────────

class TestDispatchWebhookEvent:
    def test_no_endpoints_returns_zero(self, db_session):
        from app.services.webhook_service import dispatch_webhook_event
        count = dispatch_webhook_event(db_session, "tenant-X", "contract.created", {"id": "1"})
        assert count == 0

    def test_matching_endpoint_returns_one(self, db_session):
        from app.services.webhook_service import dispatch_webhook_event
        ep = WebhookEndpoint(
            tenant_id="tenant-Y",
            url="http://localhost:9999/hook",
            secret="mysecret",
            events="contract.created",
            is_active=True,
        )
        db_session.add(ep)
        db_session.commit()

        with patch("app.services.webhook_service._deliver") as mock_deliver:
            mock_deliver.return_value = None
            count = dispatch_webhook_event(db_session, "tenant-Y", "contract.created", {"id": "abc"})

        assert count == 1
        assert mock_deliver.called

    def test_wildcard_endpoint_matches_any_event(self, db_session):
        from app.services.webhook_service import dispatch_webhook_event
        ep = WebhookEndpoint(
            tenant_id="tenant-Z",
            url="http://localhost:9999/all",
            secret="s",
            events="*",
            is_active=True,
        )
        db_session.add(ep)
        db_session.commit()

        with patch("app.services.webhook_service._deliver") as mock_deliver:
            mock_deliver.return_value = None
            count = dispatch_webhook_event(db_session, "tenant-Z", "payment.reconciled", {})

        assert count == 1

    def test_inactive_endpoint_not_notified(self, db_session):
        from app.services.webhook_service import dispatch_webhook_event
        ep = WebhookEndpoint(
            tenant_id="tenant-inactive",
            url="http://localhost:9999/inactive",
            secret="s",
            events="*",
            is_active=False,
        )
        db_session.add(ep)
        db_session.commit()

        count = dispatch_webhook_event(db_session, "tenant-inactive", "contract.created", {})
        assert count == 0

    def test_tenant_isolation(self, db_session):
        """Endpoint from another tenant must not receive events."""
        from app.services.webhook_service import dispatch_webhook_event
        ep = WebhookEndpoint(
            tenant_id="tenant-A",
            url="http://localhost:9999/a",
            secret="s",
            events="*",
            is_active=True,
        )
        db_session.add(ep)
        db_session.commit()

        with patch("app.services.webhook_service._deliver") as mock_deliver:
            count = dispatch_webhook_event(db_session, "tenant-B", "contract.created", {})

        assert count == 0
        assert not mock_deliver.called

    def test_event_not_subscribed_not_delivered(self, db_session):
        from app.services.webhook_service import dispatch_webhook_event
        ep = WebhookEndpoint(
            tenant_id="tenant-sub",
            url="http://localhost:9999/sub",
            secret="s",
            events="contract.created",
            is_active=True,
        )
        db_session.add(ep)
        db_session.commit()

        with patch("app.services.webhook_service._deliver") as mock_deliver:
            count = dispatch_webhook_event(db_session, "tenant-sub", "payment.reconciled", {})

        assert count == 0
