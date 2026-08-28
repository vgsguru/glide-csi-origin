"""Attention policy.

An agent that surfaces everything it notices is just a noisier dashboard.
This module decides how much of the ranked output actually earns the user's
attention, and records the reason for everything it silences.
"""
from datetime import datetime, timedelta, timezone

from app.models.finance import Insight

ATTENTION_BUDGET = 3            # max cards surfaced per tick
COOLDOWN_DAYS = 2               # a dismissed insight stays quiet this long...
RESURFACE_MAGNITUDE_DELTA = 0.30  # ...unless it got 30% worse
MIN_UTILITY = 0.12


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def apply(db, user, ranked):
    """Split ranked signals into (surfaced, suppressed) with reasons."""
    now = datetime.now(timezone.utc)

    recent = (
        db.query(Insight)
        .filter(Insight.user_id == user.id)
        .order_by(Insight.created_at.desc())
        .limit(60)
        .all()
    )
    history = {}
    for insight in recent:
        history.setdefault(insight.detector, []).append(insight)

    surfaced, suppressed = [], []

    for entry in ranked:
        signal = entry["signal"]
        utility = entry["utility"]

        if utility < MIN_UTILITY:
            suppressed.append(_record(signal, utility, f"below attention threshold ({utility:.2f} < {MIN_UTILITY})"))
            continue

        prior = history.get(signal.detector, [])
        blocked = False

        for previous in prior:
            age = now - _aware(previous.created_at)

            # Dismissed and nothing materially changed -> stay quiet.
            if previous.status == "dismissed" and age < timedelta(days=COOLDOWN_DAYS):
                previous_magnitude = previous.magnitude or 0
                grew = (
                    abs(signal.magnitude) > previous_magnitude * (1 + RESURFACE_MAGNITUDE_DELTA)
                    if previous_magnitude else abs(signal.magnitude) > 0
                )
                if not grew:
                    days_ago = max(age.days, 0)
                    suppressed.append(
                        _record(
                            signal, utility,
                            f"cooldown -- you dismissed this {days_ago}d ago and the "
                            f"impact has not grown by {int(RESURFACE_MAGNITUDE_DELTA * 100)}%",
                        )
                    )
                    blocked = True
                    break

            # Already on screen and unchanged -> don't duplicate it.
            if previous.status == "active" and age < timedelta(hours=12):
                if abs(abs(signal.magnitude) - (previous.magnitude or 0)) < max(previous.magnitude or 1, 1) * 0.1:
                    suppressed.append(_record(signal, utility, "already active and unchanged since the last tick"))
                    blocked = True
                    break

        if blocked:
            continue

        if len(surfaced) >= ATTENTION_BUDGET:
            suppressed.append(
                _record(signal, utility, f"attention budget full ({ATTENTION_BUDGET} cards already surfaced this tick)")
            )
            continue

        surfaced.append(entry)

    return surfaced, suppressed


def _record(signal, utility, reason):
    return {
        "title": signal.title,
        "detector": signal.detector,
        "objective": signal.objective,
        "score": round(utility, 4),
        "reason": reason,
    }
