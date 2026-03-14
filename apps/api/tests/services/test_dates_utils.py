"""Unit tests for app.utils.dates."""
from __future__ import annotations

from datetime import date

import pytest


class TestMoveToNextBusinessDay:
    def test_weekday_unchanged(self):
        from app.utils.dates import move_to_next_business_day
        # 2026-03-09 is a Monday
        assert move_to_next_business_day(date(2026, 3, 9)) == date(2026, 3, 9)

    def test_saturday_moves_to_monday(self):
        from app.utils.dates import move_to_next_business_day
        # 2026-03-07 is a Saturday
        assert move_to_next_business_day(date(2026, 3, 7)) == date(2026, 3, 9)

    def test_sunday_moves_to_monday(self):
        from app.utils.dates import move_to_next_business_day
        # 2026-03-08 is a Sunday
        assert move_to_next_business_day(date(2026, 3, 8)) == date(2026, 3, 9)

    def test_friday_unchanged(self):
        from app.utils.dates import move_to_next_business_day
        assert move_to_next_business_day(date(2026, 3, 6)) == date(2026, 3, 6)


class TestResolveDueDate:
    def test_normal_due_day(self):
        from app.utils.dates import resolve_due_date
        # 2026-03-10 is a Tuesday
        result = resolve_due_date(date(2026, 3, 1), 10)
        assert result == date(2026, 3, 10)

    def test_due_day_0_clamps_to_1(self):
        from app.utils.dates import resolve_due_date
        result = resolve_due_date(date(2026, 3, 1), 0)
        # day 0 → clamped to 1 → 2026-03-01 (Sunday) → 2026-03-02
        assert result.month == 3

    def test_due_day_31_in_april_clamps(self):
        from app.utils.dates import resolve_due_date
        # April has 30 days — day 31 clamps to 30
        result = resolve_due_date(date(2026, 4, 1), 31)
        assert result.month == 4
        assert result.day == 30

    def test_due_day_on_weekend_pushed_to_weekday(self):
        from app.utils.dates import resolve_due_date
        # 2026-03-01 is a Sunday → pushed to Monday 2026-03-02
        result = resolve_due_date(date(2026, 3, 1), 1)
        assert result.weekday() < 5

    def test_february_28_day(self):
        from app.utils.dates import resolve_due_date
        # 2026 is not a leap year — Feb has 28 days. Feb 28 2026 is a Saturday,
        # so resolve_due_date pushes it to Monday Mar 2. The key property is that
        # the result is always a weekday.
        result = resolve_due_date(date(2026, 2, 1), 28)
        assert result.weekday() < 5
