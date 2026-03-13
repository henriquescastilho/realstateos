from calendar import monthrange
from datetime import date, timedelta


def resolve_due_date(reference_month: date, due_day: int) -> date:
    last_day = monthrange(reference_month.year, reference_month.month)[1]
    target_day = min(max(due_day, 1), last_day)
    candidate = date(reference_month.year, reference_month.month, target_day)
    return move_to_next_business_day(candidate)


def move_to_next_business_day(value: date) -> date:
    while value.weekday() >= 5:
        value += timedelta(days=1)
    return value
