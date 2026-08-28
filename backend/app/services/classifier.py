"""Recurring-obligation discovery.

Nothing here is configured by the user. Rent, subscriptions and SIPs are
*learned* from repetition, and confidence grows with each confirming repeat --
so the app can say "I think this is rent, and here is how sure I am".
"""
import re
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.models.finance import Obligation, Transaction

MIN_OCCURRENCES = 3              # 3 repeats in the window before we commit
AMOUNT_TOLERANCE = 0.15          # 15% -- utility bills genuinely vary
CADENCE_TOLERANCE_DAYS = 6
DORMANT_AFTER_MISSED = 2

# A recurring charge is the merchant's *dominant* behaviour. Somebody who orders
# from Swiggy 15 times will have 3 that happen to cluster near one amount --
# that is a coincidence, not a subscription. Requiring the consistent set to be
# a majority of the merchant's activity is what separates the two.
MIN_CONSISTENT_RATIO = 0.6
MIN_REGULARITY = 0.35

RECURRING_CATEGORY_HINTS = {"Rent", "Bills", "Entertainment", "Investment", "Health", "Education"}


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def normalize_merchant(name: str) -> str:
    """Collapse the noise banks add so repeats of one payee group together."""
    text = (name or "unknown").lower().strip()
    text = re.sub(r"\b(pvt|private|ltd|limited|india|inc|llp|co)\b", "", text)
    text = re.sub(r"@[a-z]+$", "", text)                # strip UPI handle suffix
    text = re.sub(r"[0-9]{3,}", "", text)               # strip long digit runs
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "unknown"


def _detect_cadence(dates):
    """Median gap between occurrences, snapped to a familiar billing rhythm."""
    if len(dates) < 2:
        return None, 0.0
    gaps = [
        (dates[i] - dates[i - 1]).days
        for i in range(1, len(dates))
        if (dates[i] - dates[i - 1]).days > 0
    ]
    if not gaps:
        return None, 0.0

    median_gap = statistics.median(gaps)
    for canonical in (7, 14, 30, 31, 90, 365):
        if abs(median_gap - canonical) <= CADENCE_TOLERANCE_DAYS:
            median_gap = 30 if canonical == 31 else canonical
            break

    # Regularity: how tightly the gaps cluster around the median.
    if len(gaps) >= 2:
        spread = statistics.pstdev(gaps) / max(median_gap, 1)
        regularity = max(0.0, 1.0 - spread)
    else:
        regularity = 0.5
    return int(median_gap), round(regularity, 3)


def refresh_recurring_obligations(db, user_id: int, lookback_days: int = 120):
    """Rebuild the obligation set from observed history."""
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.direction == "DEBIT")
        .order_by(Transaction.occurred_at.asc())
        .all()
    )
    rows = [r for r in rows if _aware(r.occurred_at) and _aware(r.occurred_at) >= since]

    groups = defaultdict(list)
    for txn in rows:
        groups[normalize_merchant(txn.merchant)].append(txn)

    now = datetime.now(timezone.utc)
    existing = {
        normalize_merchant(o.name): o
        for o in db.query(Obligation).filter(Obligation.user_id == user_id).all()
    }
    seen_keys = set()

    for key, txns in groups.items():
        if key == "unknown" or len(txns) < MIN_OCCURRENCES:
            continue

        amounts = [t.amount for t in txns if t.amount]
        median_amount = statistics.median(amounts)
        # Keep only the occurrences that look like the same recurring charge.
        consistent = [
            t for t in txns
            if abs(t.amount - median_amount) / max(median_amount, 1) <= AMOUNT_TOLERANCE
        ]
        if len(consistent) < MIN_OCCURRENCES:
            continue
        if len(consistent) / len(txns) < MIN_CONSISTENT_RATIO:
            continue

        dates = sorted(_aware(t.occurred_at) for t in consistent)
        cadence, regularity = _detect_cadence(dates)
        if cadence is None or cadence < 5:
            continue
        if regularity < MIN_REGULARITY:
            continue

        occurrences = len(consistent)
        amount_stability = 1.0 - min(
            1.0,
            (statistics.pstdev(amounts) / max(median_amount, 1)) if len(amounts) > 1 else 0.0,
        )

        # Confidence rises with each confirming repeat, then is tempered by how
        # regular the rhythm and how stable the amount actually are.
        base = 1 - (0.55 ** (occurrences - 1))
        category = _dominant_category(consistent)
        category_bonus = 0.08 if category in RECURRING_CATEGORY_HINTS else 0.0
        confidence = min(
            0.97,
            base * (0.55 + 0.30 * regularity + 0.15 * amount_stability) + category_bonus,
        )

        last_seen = dates[-1]
        next_due = last_seen + timedelta(days=cadence)
        while next_due < now - timedelta(days=cadence):
            next_due += timedelta(days=cadence)

        missed = max(0, int((now - last_seen).days / cadence) - 1)
        status = "dormant" if missed >= DORMANT_AFTER_MISSED else "active"

        display_name = _display_name(consistent)
        obligation = existing.get(key)
        if obligation is None:
            obligation = Obligation(user_id=user_id, name=display_name)
            db.add(obligation)

        obligation.name = display_name
        obligation.category = category
        obligation.expected_amount = round(median_amount, 2)
        obligation.cadence_days = cadence
        obligation.next_due = next_due
        obligation.last_seen = last_seen
        obligation.occurrences = occurrences
        obligation.confidence = round(confidence, 3)
        obligation.status = status
        seen_keys.add(key)

        for txn in consistent:
            txn.is_recurring = True

    # Anything that used to recur but no longer appears goes dormant, not deleted --
    # the history is evidence, and a resumed subscription should recover its confidence.
    for key, obligation in existing.items():
        if key not in seen_keys and obligation.status == "active":
            last_seen = _aware(obligation.last_seen)
            if last_seen and (now - last_seen).days > (obligation.cadence_days or 30) * 2:
                obligation.status = "dormant"

    db.flush()
    return (
        db.query(Obligation)
        .filter(Obligation.user_id == user_id, Obligation.status == "active")
        .all()
    )


def _dominant_category(txns):
    counts = defaultdict(int)
    for txn in txns:
        counts[txn.category or "Other"] += 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _display_name(txns):
    counts = defaultdict(int)
    for txn in txns:
        if txn.merchant:
            counts[txn.merchant] += 1
    if not counts:
        return "Recurring payment"
    return max(counts.items(), key=lambda kv: kv[1])[0]
