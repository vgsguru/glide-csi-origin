"""Income-shape detection -- volatility, droughts, and surplus opportunities."""
from datetime import datetime, timedelta, timezone

from app.detectors import Signal


def detect(state, user):
    signals = []
    band = state["income"]

    if band["sample_size"] == 0:
        return signals

    # --- the band itself is the honest answer, so say so when it is wide ----
    spread = (band["p90"] - band["p10"]) / band["p50"] if band["p50"] else 0
    if spread > 0.6 and band["sample_size"] >= 2:
        signals.append(
            Signal(
                detector="income_volatility",
                objective="buffer",
                kind="information",
                severity="info",
                title="Your income is highly variable -- plan against the low end",
                body=(
                    f"Across your history the monthly range is Rs.{band['p10']:,.0f} to "
                    f"Rs.{band['p90']:,.0f}. A budget built on the middle "
                    f"(Rs.{band['p50']:,.0f}) fails in the bad months."
                ),
                magnitude=(band["p50"] - band["p10"]),
                reasoning=f"p90-p10 spread is {spread * 100:.0f}% of median; basis: {band['basis']}",
                evidence=[
                    {"label": "Low month (p10)", "value": f"Rs.{band['p10']:,.0f}", "source": band["basis"]},
                    {"label": "Typical (p50)", "value": f"Rs.{band['p50']:,.0f}", "source": band["basis"]},
                    {"label": "Good month (p90)", "value": f"Rs.{band['p90']:,.0f}", "source": band["basis"]},
                ],
            )
        )

    # --- a surplus worth deploying -----------------------------------------
    sts = state["safe_to_spend"]
    floor = state["buffer_floor"]
    if not sts["is_negative"] and floor > 0 and sts["amount"] > floor * 1.2:
        surplus = sts["amount"] - floor
        signals.append(
            Signal(
                detector="income_surplus",
                objective="investing",
                kind="opportunity",
                severity="info",
                title=f"Rs.{surplus:,.0f} is sitting idle above your floor",
                body=(
                    f"Your buffer is covered and you still have Rs.{sts['amount']:,.0f} spendable. "
                    f"Roughly Rs.{surplus:,.0f} could go to a goal or an investment "
                    f"without touching your safety margin."
                ),
                magnitude=surplus,
                reasoning=(
                    f"safe-to-spend Rs.{sts['amount']:,.0f} exceeds floor Rs.{floor:,.0f} by "
                    f"{(sts['amount'] / floor - 1) * 100:.0f}%"
                ),
                evidence=[
                    {"label": "Safe to spend", "value": f"Rs.{sts['amount']:,.0f}", "source": "computed"},
                    {"label": "Buffer floor", "value": f"Rs.{floor:,.0f}", "source": "you set this"},
                    {"label": "Income stability", "value": band["stability"], "source": band["basis"]},
                ],
            )
        )

    # --- income drought -----------------------------------------------------
    days_since = _days_since_last_credit(state)
    if days_since is not None and days_since > 21 and band["stability"] != "steady":
        signals.append(
            Signal(
                detector="income_drought",
                objective="buffer",
                kind="risk",
                severity="warn",
                title=f"No income received in {days_since} days",
                body=(
                    f"Your last credit was {days_since} days ago. At your current "
                    f"Rs.{state['spend']['daily_run_rate']:,.0f}/day run-rate that is "
                    f"Rs.{state['spend']['daily_run_rate'] * days_since:,.0f} spent with nothing in."
                ),
                magnitude=state["spend"]["daily_run_rate"] * days_since,
                reasoning=f"{days_since} days since last CREDIT; income marked '{band['stability']}'",
                evidence=[
                    {"label": "Days since income", "value": str(days_since), "source": "ledger"},
                    {"label": "Daily run-rate", "value": f"Rs.{state['spend']['daily_run_rate']:,.0f}", "source": "last 30 days"},
                ],
            )
        )
    return signals


def _days_since_last_credit(state):
    last = state.get("last_credit_at")
    if not last:
        return None
    try:
        parsed = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
        if not parsed.tzinfo:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - parsed).days
    except ValueError:
        return None
