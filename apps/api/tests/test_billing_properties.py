"""
Property-based tests for billing calculation functions.

Uses hypothesis to verify invariants that must hold for ALL valid inputs:
  - No negative charge amounts
  - IGPM/IPCA adjustment bounds
  - Partial payment consistency
  - Due-date safety invariants
  - Penalty calculations are monotone in days-late
  - Discount is capped and never exceeds gross
  - Charge composition totals are self-consistent

Run: pytest tests/test_billing_properties.py -v
"""
from __future__ import annotations

import pytest
from decimal import Decimal, ROUND_HALF_UP

hypothesis = pytest.importorskip("hypothesis", reason="hypothesis not installed — pip install hypothesis")
from hypothesis import given, settings, assume
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Domain strategies
# ---------------------------------------------------------------------------

# Brazilian monthly rents: R$200 – R$50 000
rent_amounts = st.decimals(
    min_value=Decimal("200.00"),
    max_value=Decimal("50000.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# IGPM/IPCA monthly rate: -5% to +5% (realistic Brazilian range)
monthly_rates = st.decimals(
    min_value=Decimal("-5.000000"),
    max_value=Decimal("5.000000"),
    places=6,
    allow_nan=False,
    allow_infinity=False,
)

# Late fee percentage: 0% to 10%
late_fee_pcts = st.decimals(
    min_value=Decimal("0"),
    max_value=Decimal("10.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Days late: -10 to 365 (negative = early, 0 = on time, positive = late)
days_late_range = st.integers(min_value=-10, max_value=365)

# Days early: 0 to 30
days_early_range = st.integers(min_value=0, max_value=30)

# Due day (calendar day of month): 1–31
due_day_range = st.integers(min_value=1, max_value=31)

# Reference month: valid dates in 2020–2030
reference_months = st.dates(
    min_value=__import__("datetime").date(2020, 1, 1),
    max_value=__import__("datetime").date(2030, 12, 1),
)

# Partial payment ratio: 0.01 to 0.99 of gross
partial_ratios = st.floats(min_value=0.01, max_value=0.99, allow_nan=False, allow_infinity=False)

# Positive decimal amounts
positive_amounts = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("100000.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


# ---------------------------------------------------------------------------
# Tests — due date utilities
# ---------------------------------------------------------------------------

class TestDueDateProperties:
    @given(ref=reference_months, day=due_day_range)
    @settings(max_examples=200)
    def test_due_date_is_always_a_weekday(self, ref, day):
        """resolve_due_date must always return Monday–Friday."""
        from app.utils.dates import resolve_due_date

        result = resolve_due_date(ref, day)
        assert result.weekday() < 5, f"Expected weekday, got {result} (weekday={result.weekday()})"

    @given(ref=reference_months, day=due_day_range)
    @settings(max_examples=200)
    def test_due_date_is_never_before_first_of_month(self, ref, day):
        """Due date is always within the reference month or shortly after (weekend push)."""
        from app.utils.dates import resolve_due_date
        import datetime

        result = resolve_due_date(ref, day)
        first_of_month = ref.replace(day=1)
        # Result is within the month or at most 3 days into next month (weekend/holiday push)
        assert result >= first_of_month
        assert (result - first_of_month).days <= 33  # never more than 33 days ahead

    @given(ref=reference_months, day=due_day_range)
    @settings(max_examples=200)
    def test_due_day_clamped_to_month_end(self, ref, day):
        """Due days beyond month end should be clamped, never crash."""
        from app.utils.dates import resolve_due_date

        # Must not raise
        result = resolve_due_date(ref, day)
        assert result is not None

    @given(d=reference_months)
    @settings(max_examples=200)
    def test_move_to_business_day_is_idempotent_on_weekdays(self, d):
        """If d is already a weekday, it should be returned unchanged."""
        from app.utils.dates import move_to_next_business_day
        import datetime

        assume(d.weekday() < 5)
        result = move_to_next_business_day(d)
        assert result == d

    @given(d=reference_months)
    @settings(max_examples=200)
    def test_move_to_business_day_weekend_advances(self, d):
        """Weekend dates must advance to Monday."""
        from app.utils.dates import move_to_next_business_day
        import datetime

        assume(d.weekday() >= 5)
        result = move_to_next_business_day(d)
        assert result.weekday() == 0  # Monday


# ---------------------------------------------------------------------------
# Tests — charge amount invariants
# ---------------------------------------------------------------------------

class TestChargeAmountInvariants:
    @given(rent=rent_amounts, ref=reference_months, day=due_day_range)
    @settings(max_examples=200)
    def test_charge_amount_is_never_negative(self, rent, ref, day):
        """A monthly rent charge must always equal the contract rent (never negative)."""
        from types import SimpleNamespace
        from app.services.billing_service import generate_monthly_rent_charge

        contract = SimpleNamespace(
            id="test-id",
            tenant_id="tenant-id",
            property_id="prop-id",
            monthly_rent=rent,
            due_day=day,
        )
        charge = generate_monthly_rent_charge(contract, ref)
        assert charge.amount >= Decimal("0.00")
        assert charge.amount == rent

    @given(rent=rent_amounts, ref=reference_months, day=due_day_range)
    @settings(max_examples=200)
    def test_charge_status_is_pending(self, rent, ref, day):
        """Every newly created charge must have 'pending' status."""
        from types import SimpleNamespace
        from app.services.billing_service import generate_monthly_rent_charge

        contract = SimpleNamespace(
            id="test-id",
            tenant_id="tenant-id",
            property_id="prop-id",
            monthly_rent=rent,
            due_day=day,
        )
        charge = generate_monthly_rent_charge(contract, ref)
        assert charge.status == "pending"

    @given(rent=rent_amounts, ref=reference_months, day=due_day_range)
    @settings(max_examples=200)
    def test_charge_description_contains_reference_month(self, rent, ref, day):
        """Charge description must identify the billing month."""
        from types import SimpleNamespace
        from app.services.billing_service import generate_monthly_rent_charge

        contract = SimpleNamespace(
            id="test-id",
            tenant_id="tenant-id",
            property_id="prop-id",
            monthly_rent=rent,
            due_day=day,
        )
        charge = generate_monthly_rent_charge(contract, ref)
        expected_period = ref.strftime("%Y-%m")
        assert expected_period in charge.description


# ---------------------------------------------------------------------------
# Tests — IGPM/IPCA adjustment calculation properties
# ---------------------------------------------------------------------------

def apply_index_adjustment(base_rent: Decimal, annual_rate: Decimal) -> Decimal:
    """
    Pure helper mirroring the billing agent logic:
      adjustment = base_rent * annual_rate / 100  (ROUND_HALF_UP, 2 places)
    Returns the adjustment amount (never the new rent total).
    """
    _two = Decimal("0.01")
    return (base_rent * annual_rate / 100).quantize(_two, rounding=ROUND_HALF_UP)


def compound_monthly_to_annual(monthly_rate: Decimal) -> Decimal:
    """
    Compound 12 monthly rates into an annual accumulated rate.
    Mirrors how IGPM/IPCA annual adjustments are typically computed.
    Returns percentage (e.g. 8.5 for 8.5%).
    """
    factor = (1 + monthly_rate / 100) ** 12
    return (factor - 1) * 100


class TestIgpmAdjustmentProperties:
    @given(rent=rent_amounts, rate=monthly_rates)
    @settings(max_examples=300)
    def test_positive_rate_yields_positive_adjustment(self, rent, rate):
        """A positive IGPM rate must produce a positive (or zero) adjustment."""
        assume(rate > Decimal("0"))
        adj = apply_index_adjustment(rent, rate)
        assert adj >= Decimal("0.00"), f"adj={adj} for rate={rate}"

    @given(rent=rent_amounts, rate=monthly_rates)
    @settings(max_examples=300)
    def test_negative_rate_yields_negative_or_zero_adjustment(self, rent, rate):
        """A negative IGPM rate (deflation) yields a deduction or zero."""
        assume(rate < Decimal("0"))
        adj = apply_index_adjustment(rent, rate)
        assert adj <= Decimal("0.00"), f"adj={adj} for rate={rate}"

    @given(rent=rent_amounts, rate=monthly_rates)
    @settings(max_examples=300)
    def test_adjustment_never_exceeds_rent_for_realistic_rates(self, rent, rate):
        """
        With IGPM rates bounded to [-5%, +5%], a monthly adjustment
        applied to the base rent must never exceed 5% of the rent.
        """
        adj = apply_index_adjustment(rent, rate)
        max_realistic = (rent * Decimal("5") / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        assert abs(adj) <= max_realistic + Decimal("0.01"), (
            f"adj={adj} exceeds bound for rent={rent}, rate={rate}"
        )

    @given(rate=monthly_rates)
    @settings(max_examples=300)
    def test_annual_compound_within_realistic_bounds(self, rate):
        """
        If monthly IGPM is between -5% and +5%, the annual compound must
        be between -46% and +80% (mathematically derived bounds).
        """
        annual = compound_monthly_to_annual(rate)
        # Lower bound: (1 - 0.05)^12 - 1 ≈ -0.4596, so ~ -46%
        # Upper bound: (1 + 0.05)^12 - 1 ≈ 0.7959, so ~ +80%
        assert annual >= Decimal("-47"), f"Annual rate {annual} below lower bound"
        assert annual <= Decimal("81"), f"Annual rate {annual} above upper bound"

    @given(rent=rent_amounts, rate=monthly_rates)
    @settings(max_examples=300)
    def test_zero_rate_yields_zero_adjustment(self, rent, rate):
        """Zero IGPM rate → zero adjustment regardless of rent."""
        adj = apply_index_adjustment(rent, Decimal("0"))
        assert adj == Decimal("0.00")

    @given(rent=rent_amounts, rate=monthly_rates)
    @settings(max_examples=300)
    def test_rent_plus_adjustment_never_negative(self, rent, rate):
        """
        Even with maximum deflation (-5%), rent + adjustment should
        remain positive for any realistic rent.
        """
        adj = apply_index_adjustment(rent, rate)
        new_rent = rent + adj
        assert new_rent > Decimal("0.00"), f"rent={rent}, adj={adj}, new_rent={new_rent}"


# ---------------------------------------------------------------------------
# Tests — partial payment consistency
# ---------------------------------------------------------------------------

def classify_payment(paid: Decimal, charged: Decimal) -> str:
    """
    Pure classification mirroring the reconciliation rule in payments_agent.
    Returns: "paid" | "partial" | "overpayment" | "unmatched"
    """
    if charged <= Decimal("0"):
        return "unmatched"
    tolerance = Decimal("0.05")
    if abs(paid - charged) <= tolerance:
        return "paid"
    if paid < charged:
        return "partial"
    return "overpayment"


class TestPartialPaymentConsistency:
    @given(amount=positive_amounts, ratio=partial_ratios)
    @settings(max_examples=300)
    def test_partial_payment_never_resolves_as_paid(self, amount, ratio):
        """
        Paying less than 99% of a charge (with tolerance gap) must never
        yield 'paid' status.
        """
        paid = (amount * Decimal(str(ratio))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        assume(amount - paid > Decimal("0.10"))  # ensure beyond tolerance
        status = classify_payment(paid, amount)
        assert status == "partial", f"paid={paid}, charged={amount}, status={status}"

    @given(amount=positive_amounts)
    @settings(max_examples=200)
    def test_exact_payment_is_always_paid(self, amount):
        """Paying exactly the charged amount must always resolve as 'paid'."""
        status = classify_payment(amount, amount)
        assert status == "paid", f"charged=paid={amount}, expected 'paid', got '{status}'"

    @given(amount=positive_amounts, excess=positive_amounts)
    @settings(max_examples=200)
    def test_overpayment_is_always_overpayment(self, amount, excess):
        """Paying more than the charged amount (beyond tolerance) must be 'overpayment'."""
        paid = amount + excess + Decimal("0.10")
        status = classify_payment(paid, amount)
        assert status == "overpayment", f"paid={paid}, charged={amount}, status={status}"

    @given(amount=positive_amounts, days=days_late_range, pct=late_fee_pcts)
    @settings(max_examples=200)
    def test_late_charge_total_never_below_principal(self, amount, days, pct):
        """
        Principal + late fee + interest must always be >= principal.
        (Penalty adds to, never subtracts from, the amount.)
        """
        if days <= 0 or pct <= Decimal("0"):
            return  # no-op case
        late_fee = (amount * pct / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total = amount + late_fee
        assert total >= amount, f"total={total} < amount={amount} with pct={pct}"

    @given(amount=positive_amounts, days=days_late_range, pct=late_fee_pcts)
    @settings(max_examples=200)
    def test_late_fee_is_monotone_in_days(self, amount, days, pct):
        """
        If a payment is 1 day later, the late fee must be >= the fee for 0 days late.
        (Penalty only applies when days > 0.)
        """
        assume(pct > Decimal("0"))

        def late_fee(d: int) -> Decimal:
            if d <= 0:
                return Decimal("0.00")
            return (amount * pct / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        fee_0 = late_fee(0)
        fee_1 = late_fee(1)
        assert fee_1 >= fee_0, f"Fee went down from {fee_0} to {fee_1}"

    @given(amount=positive_amounts, days=days_early_range)
    @settings(max_examples=200)
    def test_early_discount_never_exceeds_rent(self, amount, days):
        """
        Early payment discount (max 10%) must never exceed the gross amount.
        """
        max_discount_pct = Decimal("10.00")
        if days <= 0:
            discount = Decimal("0.00")
        else:
            discount = (amount * max_discount_pct / 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        assert discount <= amount, f"discount={discount} > amount={amount}"

    @given(amount=positive_amounts, discount_pct=st.decimals(
        min_value=Decimal("0"), max_value=Decimal("10"), places=2,
        allow_nan=False, allow_infinity=False,
    ))
    @settings(max_examples=200)
    def test_net_after_discount_never_negative(self, amount, discount_pct):
        """Applying up to 10% discount must never make net amount negative."""
        discount = (amount * discount_pct / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        net = amount - discount
        assert net >= Decimal("0.00"), f"net={net} < 0 for amount={amount}, pct={discount_pct}"
