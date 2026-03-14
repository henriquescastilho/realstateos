"""Unit tests for app.repositories.agent_tasks."""
from __future__ import annotations

import uuid
from datetime import date

import pytest


@pytest.fixture()
def tenant_id():
    return str(uuid.uuid4())


@pytest.fixture()
def sample_task(db_session, tenant_id):
    from app.repositories.agent_tasks import create_agent_task
    return create_agent_task(
        db_session,
        tenant_id=tenant_id,
        agent_type="billing_agent",
        task_type="GENERATE_MONTHLY_CHARGE",
        input_data={"contract_id": "c-001", "month_ref": "2026-03"},
        entity_type="contract",
        entity_id="c-001",
    )


class TestCreateAgentTask:
    def test_creates_with_pending_status(self, db_session, tenant_id):
        from app.repositories.agent_tasks import create_agent_task
        task = create_agent_task(db_session, tenant_id, "onboarding_agent", "EXTRACT_CONTRACT", {})
        assert task.status == "PENDING"

    def test_task_type_uppercased(self, db_session, tenant_id):
        from app.repositories.agent_tasks import create_agent_task
        task = create_agent_task(db_session, tenant_id, "billing_agent", "generate_charge", {})
        assert task.task_type == "GENERATE_CHARGE"

    def test_id_is_set(self, db_session, tenant_id):
        from app.repositories.agent_tasks import create_agent_task
        task = create_agent_task(db_session, tenant_id, "comms_agent", "SEND_NOTICE", {})
        assert task.id is not None

    def test_input_data_persisted(self, db_session, tenant_id):
        from app.repositories.agent_tasks import create_agent_task
        data = {"key": "value", "amount": 3500}
        task = create_agent_task(db_session, tenant_id, "payments_agent", "RECONCILE", data)
        assert task.input_data == data

    def test_tenant_id_set(self, db_session, tenant_id):
        from app.repositories.agent_tasks import create_agent_task
        task = create_agent_task(db_session, tenant_id, "billing_agent", "CHARGE", {})
        assert task.tenant_id == tenant_id

    def test_custom_priority(self, db_session, tenant_id):
        from app.repositories.agent_tasks import create_agent_task
        task = create_agent_task(db_session, tenant_id, "billing_agent", "CHARGE", {}, priority=1)
        assert task.priority == 1


class TestGetAgentTask:
    def test_returns_existing_task(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import get_agent_task
        result = get_agent_task(db_session, sample_task.id, tenant_id)
        assert result is not None
        assert result.id == sample_task.id

    def test_returns_none_for_wrong_tenant(self, db_session, sample_task):
        from app.repositories.agent_tasks import get_agent_task
        result = get_agent_task(db_session, sample_task.id, "wrong-tenant")
        assert result is None

    def test_returns_none_for_unknown_id(self, db_session, tenant_id):
        from app.repositories.agent_tasks import get_agent_task
        result = get_agent_task(db_session, "nonexistent-id", tenant_id)
        assert result is None


class TestListAgentTasks:
    def test_lists_tasks_for_tenant(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import list_agent_tasks
        results = list_agent_tasks(db_session, tenant_id)
        assert any(t.id == sample_task.id for t in results)

    def test_filters_by_status(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import list_agent_tasks
        results = list_agent_tasks(db_session, tenant_id, status="PENDING")
        assert all(t.status == "PENDING" for t in results)

    def test_filters_by_agent_type(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import list_agent_tasks
        results = list_agent_tasks(db_session, tenant_id, agent_type="billing_agent")
        assert all(t.agent_type == "billing_agent" for t in results)

    def test_tenant_isolation(self, db_session, sample_task):
        from app.repositories.agent_tasks import list_agent_tasks
        results = list_agent_tasks(db_session, "different-tenant")
        assert all(t.id != sample_task.id for t in results)

    def test_limit_applies(self, db_session, tenant_id):
        from app.repositories.agent_tasks import create_agent_task, list_agent_tasks
        for i in range(5):
            create_agent_task(db_session, tenant_id, "billing_agent", "CHARGE", {"i": i})
        results = list_agent_tasks(db_session, tenant_id, limit=2)
        assert len(results) <= 2

    def test_filters_by_entity_id(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import list_agent_tasks
        results = list_agent_tasks(db_session, tenant_id, entity_id="c-001")
        assert all(t.entity_id == "c-001" for t in results)


class TestCountAgentTasks:
    def test_count_all(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import count_agent_tasks
        count = count_agent_tasks(db_session, tenant_id)
        assert count >= 1

    def test_count_by_status(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import count_agent_tasks
        count = count_agent_tasks(db_session, tenant_id, status="PENDING")
        assert count >= 1

    def test_count_zero_for_done_when_none(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import count_agent_tasks
        count = count_agent_tasks(db_session, tenant_id, status="DONE")
        assert count == 0


class TestUpdateAgentTaskStatus:
    def test_updates_to_running_sets_started_at(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import update_agent_task_status
        updated = update_agent_task_status(db_session, sample_task.id, tenant_id, "RUNNING")
        assert updated.status == "RUNNING"
        assert updated.started_at is not None

    def test_updates_to_done_sets_completed_at(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import update_agent_task_status
        updated = update_agent_task_status(
            db_session, sample_task.id, tenant_id, "DONE",
            output_data={"result": "ok"}
        )
        assert updated.status == "DONE"
        assert updated.completed_at is not None
        assert updated.output_data == {"result": "ok"}

    def test_updates_to_failed_with_error_message(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import update_agent_task_status
        updated = update_agent_task_status(
            db_session, sample_task.id, tenant_id, "FAILED",
            error_message="timeout"
        )
        assert updated.status == "FAILED"
        assert updated.error_message == "timeout"

    def test_returns_none_for_unknown_task(self, db_session, tenant_id):
        from app.repositories.agent_tasks import update_agent_task_status
        result = update_agent_task_status(db_session, "unknown", tenant_id, "DONE")
        assert result is None


class TestIncrementRetryCount:
    def test_increments_from_zero(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import increment_retry_count
        initial = sample_task.retry_count
        updated = increment_retry_count(db_session, sample_task.id, tenant_id)
        assert updated.retry_count == initial + 1

    def test_returns_none_for_unknown(self, db_session, tenant_id):
        from app.repositories.agent_tasks import increment_retry_count
        result = increment_retry_count(db_session, "ghost-id", tenant_id)
        assert result is None


class TestMarkTaskDlq:
    def test_sets_status_dlq(self, db_session, sample_task, tenant_id):
        from app.repositories.agent_tasks import mark_task_dlq
        updated = mark_task_dlq(db_session, sample_task.id, tenant_id)
        assert updated.status == "DLQ"
        assert updated.dlq_at is not None

    def test_returns_none_for_unknown(self, db_session, tenant_id):
        from app.repositories.agent_tasks import mark_task_dlq
        assert mark_task_dlq(db_session, "ghost", tenant_id) is None


class TestBulkUpdateStatus:
    def test_bulk_updates_all_listed_ids(self, db_session, tenant_id):
        from app.repositories.agent_tasks import bulk_update_status, create_agent_task, list_agent_tasks
        t1 = create_agent_task(db_session, tenant_id, "billing_agent", "CHARGE", {})
        t2 = create_agent_task(db_session, tenant_id, "billing_agent", "CHARGE", {})
        rows = bulk_update_status(db_session, [t1.id, t2.id], tenant_id, "CANCELLED")
        assert rows == 2

    def test_tenant_isolation_in_bulk(self, db_session, tenant_id, sample_task):
        from app.repositories.agent_tasks import bulk_update_status, get_agent_task
        rows = bulk_update_status(db_session, [sample_task.id], "other-tenant", "CANCELLED")
        assert rows == 0
        # Original task should be unchanged
        task = get_agent_task(db_session, sample_task.id, tenant_id)
        assert task.status == "PENDING"
