"""The live financial state model.

Everything the agent reasons over comes from here. The central commitment:
variable income is reported as a *distribution*, never as a single number, and
every figure carries the basis that produced it.
"""
import statistics
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.models.finance import Obligation, Snapshot, Transaction

DISCRETIONARY_CATEGORIES = {
    "Food", "Shopping", "Entertainment", "Transport", "Other",
}
ESSENTIAL_CATEGORIES = {"Rent", "Bills", "Health", "Education"}
INCOME_CATEGORIES = {"Income", "Salary"}

# Credits below this are cashback, refunds and UPI dust. They still count
# toward money-in, but including them in the income *distribution* drags the
# median toward zero and makes the band meaningless.
INCOME_NOISE_FLOOR = 100.0


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def percentile(values, pct: float):
    """Linear-interpolation percentile; stable for the tiny samples we have."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * pct
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return float(ordered[lower] * (1 - weight) + ordered[upper] * weight)


def load_transactions(db, user_id: int, days: int = 90):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.occurred_at.asc())
        .all()
    )
    return [r for r in rows if _aware(r.occurred_at) and _aware(r.occurred_at) >= since]


def income_band(transactions, days: int = 90):
    """Monthly income as p10 / p50 / p90, plus an honest description of basis."""
    credits = [t for t in transactions if t.direction == "CREDIT"]
    if not credits:
        return {
            "p10": 0.0, "p50": 0.0, "p90": 0.0,
            "basis": "No income observed yet",
            "sample_size": 0, "stability": "unknown", "confidence": 0.1,
        }

    # Bucket credits into calendar months, then reason over monthly totals.
    monthly = defaultdict(float)
    for txn in credits:
        occurred = _aware(txn.occurred_at)
        monthly[(occurred.year, occurred.month)] += txn.amount or 0.0

    totals = list(monthly.values())
    deposits = [t.amount for t in credits if t.amount]

    if len(totals) >= 3:
        p10, p50, p90 = percentile(totals, 0.10), percentile(totals, 0.50), percentile(totals, 0.90)
        basis = f"{len(totals)} months of history, {len(deposits)} deposits"
        sample_size = len(totals)
        confidence = min(0.5 + 0.12 * len(totals), 0.92)
    else:
        # Too few complete months to take monthly totals seriously.
        #
        # Scale the observed TOTAL to 30 days rather than multiplying a median
        # deposit by the deposit count. Real inboxes carry a long tail of tiny
        # credits (Rs.1-2 cashback, refunds); with those in the sample the
        # median collapses and median x count produced absurd figures like
        # "Rs.93/month" against Rs.41,821 actually received.
        span_days = max(
            1,
            (_aware(credits[-1].occurred_at) - _aware(credits[0].occurred_at)).days,
        )
        observed_total = sum(deposits)
        p50 = observed_total * (30.0 / max(span_days, 1))

        # Band width comes from two sources of uncertainty, and we take the
        # larger: how lumpy the deposits actually are, and how little evidence
        # we have. Two deposits that happen to be similar are not proof of a
        # steady income -- they are two data points.
        meaningful = [d for d in deposits if d >= INCOME_NOISE_FLOOR] or deposits
        count = len(meaningful)
        small_sample_floor = 0.45 if count <= 2 else 0.35 if count <= 4 else 0.28 if count <= 8 else 0.20
        if count > 1:
            dispersion = statistics.pstdev(meaningful) / max(statistics.mean(meaningful), 1)
            spread = min(0.60, max(small_sample_floor, dispersion * 0.5))
        else:
            spread = 0.50
        p10, p90 = p50 * (1 - spread), p50 * (1 + spread)

        ignored = len(deposits) - len(meaningful)
        basis = (
            f"{len(meaningful)} deposit{'s' if len(meaningful) != 1 else ''} "
            f"over {span_days} days"
            + (f", {ignored} tiny credits ignored" if ignored else "")
        )
        sample_size = len(meaningful)
        confidence = min(0.25 + 0.06 * len(meaningful), 0.6)

    spread_ratio = (p90 - p10) / p50 if p50 else 0
    if spread_ratio < 0.25:
        stability = "steady"
    elif spread_ratio < 0.6:
        stability = "variable"
    else:
        stability = "highly variable"

    return {
        "p10": round(p10, 2), "p50": round(p50, 2), "p90": round(p90, 2),
        "basis": basis, "sample_size": sample_size,
        "stability": stability, "confidence": round(confidence, 3),
        "deposit_count": len(deposits),
    }


def current_balance(db, user_id: int):
    """Net position from observed flows.

    This is a *derived* balance, not a bank-confirmed one -- the UI labels it
    that way rather than implying we have account access.
    """
    rows = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    credits = sum(r.amount or 0 for r in rows if r.direction == "CREDIT")
    debits = sum(r.amount or 0 for r in rows if r.direction == "DEBIT")
    return round(credits - debits, 2)


def spend_breakdown(transactions, days: int = 30):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    recent = [
        t for t in transactions
        if t.direction == "DEBIT" and _aware(t.occurred_at) and _aware(t.occurred_at) >= since
    ]
    by_category = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for txn in recent:
        entry = by_category[txn.category or "Other"]
        entry["amount"] += txn.amount or 0
        entry["count"] += 1

    total = sum(v["amount"] for v in by_category.values())
    breakdown = [
        {
            "category": name,
            "amount": round(v["amount"], 2),
            "count": v["count"],
            "share": round(v["amount"] / total, 3) if total else 0.0,
            "essential": name in ESSENTIAL_CATEGORIES,
        }
        for name, v in sorted(by_category.items(), key=lambda kv: -kv[1]["amount"])
    ]
    discretionary = sum(
        v["amount"] for k, v in by_category.items() if k in DISCRETIONARY_CATEGORIES
    )
    return {
        "total": round(total, 2),
        "discretionary": round(discretionary, 2),
        "essential": round(total - discretionary, 2),
        "daily_run_rate": round(total / max(days, 1), 2),
        "discretionary_run_rate": round(discretionary / max(days, 1), 2),
        "by_category": breakdown,
        "transaction_count": len(recent),
    }


def upcoming_obligations(db, user_id: int, days: int = 30):
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=days)
    rows = (
        db.query(Obligation)
        .filter(Obligation.user_id == user_id, Obligation.status == "active")
        .all()
    )
    upcoming = []
    for row in rows:
        next_due = _aware(row.next_due)
        if next_due and now - timedelta(days=3) <= next_due <= horizon:
            upcoming.append(
                {
                    **row.to_dict(),
                    "days_until": (next_due - now).days,
                }
            )
    upcoming.sort(key=lambda o: o["days_until"])
    return upcoming


def safe_to_spend(balance, obligations, buffer_floor, income_p10, days=30):
    """Balance, minus what is already promised, minus the floor you set."""
    committed = sum(o["expected_amount"] for o in obligations)
    # Only the pessimistic tail of income is treated as money you can count on.
    expected_inflow = income_p10 * (days / 30.0) * 0.5
    available = balance + expected_inflow - committed - buffer_floor
    return {
        "amount": round(max(available, 0), 2),
        "raw": round(available, 2),
        "is_negative": available < 0,
        "components": {
            "balance": round(balance, 2),
            "expected_inflow_conservative": round(expected_inflow, 2),
            "committed_obligations": round(committed, 2),
            "buffer_floor": round(buffer_floor, 2),
        },
    }


def project_cashflow(balance, band, obligations, run_rate, buffer_floor, days=30):
    """Three scenarios over the horizon -- pessimistic / expected / optimistic."""
    scenarios = []
    for label, income_key, spend_mult in (
        ("pessimistic", "p10", 1.15),
        ("expected", "p50", 1.0),
        ("optimistic", "p90", 0.9),
    ):
        monthly_income = band[income_key]
        daily_income = monthly_income / 30.0
        daily_spend = run_rate * spend_mult

        series, running = [], balance
        obligation_by_day = defaultdict(float)
        for obligation in obligations:
            day = max(0, min(days, obligation["days_until"]))
            obligation_by_day[day] += obligation["expected_amount"]

        breach_day = None
        for day in range(days + 1):
            if day > 0:
                running += daily_income - daily_spend - obligation_by_day.get(day, 0.0)
            if breach_day is None and running < buffer_floor:
                breach_day = day
            series.append({"day": day, "balance": round(running, 2)})

        scenarios.append(
            {
                "scenario": label,
                "end_balance": round(running, 2),
                "breaches_floor": breach_day is not None,
                "breach_day": breach_day,
                "series": series,
            }
        )
    return scenarios


def build_state(db, user, days: int = 30):
    """Assemble the complete financial state the agent reasons over."""
    transactions = load_transactions(db, user.id, days=90)
    band = income_band(transactions)
    balance = current_balance(db, user.id)
    spend = spend_breakdown(transactions, days=30)
    obligations = upcoming_obligations(db, user.id, days=days)
    buffer_floor = user.buffer_floor or 0.0

    sts = safe_to_spend(balance, obligations, buffer_floor, band["p10"], days=days)
    projection = project_cashflow(
        balance, band, obligations, spend["discretionary_run_rate"] + _essential_daily(spend),
        buffer_floor, days=days,
    )

    review_count = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id, Transaction.needs_review.is_(True))
        .count()
    )

    credits = [t for t in transactions if t.direction == "CREDIT" and _aware(t.occurred_at)]
    last_credit_at = max((_aware(t.occurred_at) for t in credits), default=None)

    return {
        "balance": balance,
        "balance_basis": "Derived from observed credits and debits, not a bank-confirmed balance",
        "last_credit_at": last_credit_at.isoformat() if last_credit_at else None,
        "income": band,
        "spend": spend,
        "obligations": obligations,
        "obligations_total": round(sum(o["expected_amount"] for o in obligations), 2),
        "safe_to_spend": sts,
        "buffer_floor": buffer_floor,
        "projection": projection,
        "needs_review_count": review_count,
        "transaction_count": len(transactions),
        "horizon_days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _essential_daily(spend):
    return round(spend["essential"] / 30.0, 2)


def write_snapshot(db, user, state=None):
    state = state or build_state(db, user)
    ref = "SNP-" + uuid.uuid4().hex[:4].upper()
    snapshot = Snapshot(user_id=user.id, ref=ref, payload=_compact(state))
    db.add(snapshot)
    db.flush()
    return snapshot, state


def _compact(state):
    """Snapshots keep the numbers, not the full day-by-day series."""
    compact = dict(state)
    compact["projection"] = [
        {k: v for k, v in scenario.items() if k != "series"}
        for scenario in state.get("projection", [])
    ]
    return compact


def latest_snapshot(db, user_id: int):
    return (
        db.query(Snapshot)
        .filter(Snapshot.user_id == user_id)
        .order_by(Snapshot.created_at.desc())
        .first()
    )
