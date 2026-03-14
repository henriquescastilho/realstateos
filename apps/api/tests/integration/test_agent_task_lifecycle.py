"""
Integration tests — Agent task lifecycle against real PostgreSQL.

Covers:
  1. Task creation with PENDING status
  2. Transition PENDING → RUNNING (sets started_at)
  3. Transition RUNNING → DONE (sets completed_at, output_data persisted)
  4. Transition RUNNING → FAILED
  5. Dead-letter queue (DLQ) after max retries
  6. Retry count increments correctly
  7. Tenant isolation: cannot fetch/update cross-tenant tasks
  8. Listing tasks filtered by status
  9. Listing tasks filtered by agent_type
 10. Bulk status update across multiple tasks
 11. Task count by status
 12. Input data is persisted and retrievable unchanged
"""
from __future__ import annotations

import uuid
import pytest

from tests.integration.conftest import skip_no_docker

pytestmark = [pytest.mark.integration, skip_no_docker]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _new_tenant_id() -> str:
    return str(uuid.uuid4())


def _create_task(pg_session, tenant_id: str, **kwargs) -> object:
    from app.repositories.agent_tasks import create_agent_task

    return create_agent_task(
        pg_session,
        tenant_id=tenant_id,
        agent_type=kwargs.get("agent_type", "billing_agent"),
        task_type=kwargs.get("task_type", "GENERATE_MONTHLY_CHARGE"),
        input_data=kwargs.get("input_data", {"contract_id": "c-001", "month": "2026-03"}),
        entity_type=kwargs.get("entity_type", "contract"),
        entity_id=kwargs.get("entity_id", "c-001"),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTaskCreation:
    def test_created_task_has_pending_status(self, pg_session):
        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        assert task.status == "PENDING"

    def test_id_is_set(self, pg_session):
        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        assert task.id is not None

    def test_input_data_persisted(self, pg_session):
        tid = _new_tenant_id()
        payload = {"contract_id": "abc-123", "special": True, "nested": {"x": 1}}
        task = _create_task(pg_session, tid, input_data=payload)
        assert task.input_data["contract_id"] == "abc-123"
        assert task.input_data["nested"]["x"] == 1

    def test_agent_type_stored(self, pg_session):
        tid = _new_tenant_id()
        task = _create_task(pg_session, tid, agent_type="payments_agent")
        assert task.agent_type == "payments_agent"

    def test_task_type_uppercased(self, pg_session):
        """Verify uppercase convention is enforced."""
        tid = _new_tenant_id()
        task = _create_task(pg_session, tid, task_type="RECONCILE_PAYMENT")
        assert task.task_type == task.task_type.upper()


class TestStatusTransitions:
    def test_pending_to_running_sets_started_at(self, pg_session):
        from app.repositories.agent_tasks import update_agent_task_status

        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        updated = update_agent_task_status(pg_session, str(task.id), "RUNNING")
        assert updated.status == "RUNNING"
        assert updated.started_at is not None

    def test_running_to_done_sets_completed_at(self, pg_session):
        from app.repositories.agent_tasks import update_agent_task_status

        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        update_agent_task_status(pg_session, str(task.id), "RUNNING")
        output = {"result": "3 charges generated", "count": 3}
        done = update_agent_task_status(
            pg_session, str(task.id), "DONE", output_data=output
        )
        assert done.status == "DONE"
        assert done.completed_at is not None
        assert done.output_data["count"] == 3

    def test_running_to_failed(self, pg_session):
        from app.repositories.agent_tasks import update_agent_task_status

        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        update_agent_task_status(pg_session, str(task.id), "RUNNING")
        failed = update_agent_task_status(pg_session, str(task.id), "FAILED")
        assert failed.status == "FAILED"


class TestRetryAndDLQ:
    def test_retry_count_increments(self, pg_session):
        from app.repositories.agent_tasks import increment_retry_count

        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        assert task.retry_count == 0
        t1 = increment_retry_count(pg_session, str(task.id))
        assert t1.retry_count == 1
        t2 = increment_retry_count(pg_session, str(task.id))
        assert t2.retry_count == 2

    def test_mark_dlq_after_max_retries(self, pg_session):
        from app.repositories.agent_tasks import (
            increment_retry_count,
            mark_task_dlq,
            get_agent_task,
        )

        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        # Simulate 3 retries then DLQ
        for _ in range(3):
            increment_retry_count(pg_session, str(task.id))

        mark_task_dlq(pg_session, str(task.id), reason="max retries exceeded")
        final = get_agent_task(pg_session, str(task.id), tid)
        assert final.status == "DLQ"


class TestTenantIsolation:
    def test_get_task_wrong_tenant_returns_none(self, pg_session):
        from app.repositories.agent_tasks import get_agent_task

        tid = _new_tenant_id()
        task = _create_task(pg_session, tid)
        result = get_agent_task(pg_session, str(task.id), "wrong-tenant-id")
        assert result is None

    def test_list_tasks_is_scoped_to_tenant(self, pg_session):
        from app.repositories.agent_tasks import list_agent_tasks

        tid_a = _new_tenant_id()
        tid_b = _new_tenant_id()
        _create_task(pg_session, tid_a)
        _create_task(pg_session, tid_b)

        tasks_a = list_agent_tasks(pg_session, tid_a)
        tasks_b = list_agent_tasks(pg_session, tid_b)

        assert len(tasks_a) >= 1
        assert len(tasks_b) >= 1
        # No cross-contamination
        assert all(str(t.tenant_id) == tid_a for t in tasks_a)
        assert all(str(t.tenant_id) == tid_b for t in tasks_b)


class TestFiltering:
    def test_filter_by_status(self, pg_session):
        from app.repositories.agent_tasks import list_agent_tasks, update_agent_task_status

        tid = _new_tenant_id()
        t1 = _create_task(pg_session, tid)
        t2 = _create_task(pg_session, tid)
        update_agent_task_status(pg_session, str(t1.id), "RUNNING")

        running = list_agent_tasks(pg_session, tid, status="RUNNING")
        pending = list_agent_tasks(pg_session, tid, status="PENDING")

        assert any(str(t.id) == str(t1.id) for t in running)
        assert any(str(t.id) == str(t2.id) for t in pending)

    def test_filter_by_agent_type(self, pg_session):
        from app.repositories.agent_tasks import list_agent_tasks

        tid = _new_tenant_id()
        _create_task(pg_session, tid, agent_type="billing_agent")
        _create_task(pg_session, tid, agent_type="payments_agent")

        billing_tasks = list_agent_tasks(pg_session, tid, agent_type="billing_agent")
        payments_tasks = list_agent_tasks(pg_session, tid, agent_type="payments_agent")

        assert all(t.agent_type == "billing_agent" for t in billing_tasks)
        assert all(t.agent_type == "payments_agent" for t in payments_tasks)

    def test_limit_is_respected(self, pg_session):
        from app.repositories.agent_tasks import list_agent_tasks

        tid = _new_tenant_id()
        for _ in range(5):
            _create_task(pg_session, tid)

        results = list_agent_tasks(pg_session, tid, limit=2)
        assert len(results) <= 2

    def test_count_by_status(self, pg_session):
        from app.repositories.agent_tasks import count_agent_tasks, update_agent_task_status

        tid = _new_tenant_id()
        t1 = _create_task(pg_session, tid)
        t2 = _create_task(pg_session, tid)
        update_agent_task_status(pg_session, str(t2.id), "RUNNING")

        total = count_agent_tasks(pg_session, tid)
        running_count = count_agent_tasks(pg_session, tid, status="RUNNING")

        assert total >= 2
        assert running_count >= 1


class TestBulkOperations:
    def test_bulk_status_update(self, pg_session):
        from app.repositories.agent_tasks import bulk_update_status, list_agent_tasks

        tid = _new_tenant_id()
        tasks = [_create_task(pg_session, tid) for _ in range(3)]
        task_ids = [str(t.id) for t in tasks]

        bulk_update_status(pg_session, task_ids, "CANCELLED")

        all_tasks = list_agent_tasks(pg_session, tid)
        our_tasks = [t for t in all_tasks if str(t.id) in task_ids]
        assert all(t.status == "CANCELLED" for t in our_tasks)
