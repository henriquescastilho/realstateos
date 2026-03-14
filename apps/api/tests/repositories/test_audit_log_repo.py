"""Unit tests for app.repositories.audit_log."""
from __future__ import annotations

import uuid

import pytest


@pytest.fixture()
def tenant_id():
    return str(uuid.uuid4())


@pytest.fixture()
def sample_entry(db_session, tenant_id):
    from app.repositories.audit_log import append_audit_entry
    return append_audit_entry(
        db_session,
        tenant_id=tenant_id,
        entity_type="contract",
        entity_id="contract-001",
        action="created",
        actor_type="user",
        actor_id="user-001",
        before_state=None,
        after_state={"status": "active"},
        correlation_id="corr-001",
    )


class TestAppendAuditEntry:
    def test_creates_entry_with_id(self, db_session, tenant_id):
        from app.repositories.audit_log import append_audit_entry
        entry = append_audit_entry(db_session, tenant_id, "charge", "ch-1", "updated", "agent", "billing_agent")
        assert entry.id is not None

    def test_action_uppercased(self, db_session, tenant_id):
        from app.repositories.audit_log import append_audit_entry
        entry = append_audit_entry(db_session, tenant_id, "charge", "ch-2", "paid", "user", "user-1")
        assert entry.action == "PAID"

    def test_before_after_state_persisted(self, db_session, tenant_id):
        from app.repositories.audit_log import append_audit_entry
        entry = append_audit_entry(
            db_session, tenant_id, "charge", "ch-3", "updated", "agent", "a-1",
            before_state={"status": "pending"},
            after_state={"status": "paid"},
        )
        assert entry.before_state == {"status": "pending"}
        assert entry.after_state == {"status": "paid"}

    def test_correlation_id_stored(self, db_session, tenant_id):
        from app.repositories.audit_log import append_audit_entry
        entry = append_audit_entry(
            db_session, tenant_id, "contract", "c-1", "created", "user", "u-1",
            correlation_id="corr-xyz"
        )
        assert entry.correlation_id == "corr-xyz"


class TestGetAuditLogEntry:
    def test_fetches_by_id_and_tenant(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import get_audit_log_entry
        result = get_audit_log_entry(db_session, sample_entry.id, tenant_id)
        assert result is not None
        assert result.id == sample_entry.id

    def test_returns_none_wrong_tenant(self, db_session, sample_entry):
        from app.repositories.audit_log import get_audit_log_entry
        result = get_audit_log_entry(db_session, sample_entry.id, "wrong-tenant")
        assert result is None


class TestListAuditEntries:
    def test_lists_entries_for_tenant(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import list_audit_entries
        results = list_audit_entries(db_session, tenant_id)
        assert any(e.id == sample_entry.id for e in results)

    def test_filters_by_entity_type(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import list_audit_entries
        results = list_audit_entries(db_session, tenant_id, entity_type="contract")
        assert all(e.entity_type == "contract" for e in results)

    def test_filters_by_entity_id(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import list_audit_entries
        results = list_audit_entries(db_session, tenant_id, entity_id="contract-001")
        assert all(e.entity_id == "contract-001" for e in results)

    def test_filters_by_action(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import list_audit_entries
        results = list_audit_entries(db_session, tenant_id, action="CREATED")
        assert all(e.action == "CREATED" for e in results)

    def test_filters_by_correlation_id(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import list_audit_entries
        results = list_audit_entries(db_session, tenant_id, correlation_id="corr-001")
        assert len(results) >= 1

    def test_tenant_isolation(self, db_session, sample_entry):
        from app.repositories.audit_log import list_audit_entries
        results = list_audit_entries(db_session, "other-tenant")
        assert all(e.id != sample_entry.id for e in results)

    def test_limit_applies(self, db_session, tenant_id):
        from app.repositories.audit_log import append_audit_entry, list_audit_entries
        for i in range(5):
            append_audit_entry(db_session, tenant_id, "charge", f"c-{i}", "created", "user", "u-1")
        results = list_audit_entries(db_session, tenant_id, limit=2)
        assert len(results) <= 2


class TestExportAuditLogCsv:
    def test_export_csv_has_header(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import export_audit_log_csv
        csv_str = export_audit_log_csv(db_session, tenant_id)
        assert "id" in csv_str
        assert "entity_type" in csv_str

    def test_export_csv_contains_entry(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import export_audit_log_csv
        csv_str = export_audit_log_csv(db_session, tenant_id)
        assert "contract-001" in csv_str


class TestExportAuditLogJson:
    def test_export_json_returns_list(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import export_audit_log_json
        result = export_audit_log_json(db_session, tenant_id)
        assert isinstance(result, list)
        assert any(e["entity_id"] == "contract-001" for e in result)

    def test_export_json_entry_has_required_fields(self, db_session, sample_entry, tenant_id):
        from app.repositories.audit_log import export_audit_log_json
        result = export_audit_log_json(db_session, tenant_id)
        entry = next(e for e in result if e["entity_id"] == "contract-001")
        assert "id" in entry
        assert "action" in entry
        assert "actor_type" in entry
