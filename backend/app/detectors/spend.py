"""Spending-pattern detection -- category spikes and run-rate drift."""
from app.detectors import Signal


def detect(state, user):
    signals = []
    spend = state["spend"]
    if spend["total"] <= 0:
        return signals

    # --- one discretionary category dominating -----------------------------
    discretionary = [
        c for c in spend["by_category"]
        if not c["essential"] and c["category"] not in ("Transfer", "Investment")
    ]
    for category in discretionary[:2]:
        if category["share"] >= 0.30 and category["amount"] > 1500:
            signals.append(
                Signal(
                    detector="spend_concentration",
                    objective="discretionary",
                    kind="risk" if category["share"] >= 0.45 else "information",
                    severity="warn" if category["share"] >= 0.45 else "info",
                    title=f"{category['category']} is {category['share'] * 100:.0f}% of your spending",
                    body=(
                        f"Rs.{category['amount']:,.0f} across {category['count']} transactions "
                        f"in the last 30 days. Trimming it by a quarter frees about "
                        f"Rs.{category['amount'] * 0.25:,.0f}."
                    ),
                    magnitude=category["amount"] * 0.25,
                    reasoning=(
                        f"{category['category']} = Rs.{category['amount']:,.0f} of "
                        f"Rs.{spend['total']:,.0f} total debits over 30 days"
                    ),
                    evidence=[
                        {"label": category["category"], "value": f"Rs.{category['amount']:,.0f}", "source": f"{category['count']} transactions"},
                        {"label": "Total 30-day spend", "value": f"Rs.{spend['total']:,.0f}", "source": "ledger"},
                        {"label": "Share", "value": f"{category['share'] * 100:.0f}%", "source": "computed"},
                    ],
                )
            )

    # --- burn rate outruns even a good month -------------------------------
    band = state["income"]
    monthly_burn = spend["daily_run_rate"] * 30
    if band["p50"] > 0 and monthly_burn > band["p50"] * 1.05:
        overshoot = monthly_burn - band["p50"]
        beats_best_month = monthly_burn > band["p90"]
        signals.append(
            Signal(
                detector="spend_run_rate",
                objective="discretionary",
                kind="risk",
                severity="critical" if beats_best_month else "warn",
                title="You are spending faster than you earn",
                body=(
                    f"Your Rs.{spend['daily_run_rate']:,.0f}/day pace annualises to "
                    f"Rs.{monthly_burn:,.0f}/month against typical income of "
                    f"Rs.{band['p50']:,.0f}. "
                    + (
                        "That exceeds even your best observed month."
                        if beats_best_month
                        else f"That is Rs.{overshoot:,.0f} more than you typically bring in."
                    )
                ),
                magnitude=overshoot,
                reasoning=(
                    f"30-day burn Rs.{monthly_burn:,.0f} vs income p50 Rs.{band['p50']:,.0f} "
                    f"(p90 Rs.{band['p90']:,.0f})"
                ),
                evidence=[
                    {"label": "Monthly burn", "value": f"Rs.{monthly_burn:,.0f}", "source": "30-day run-rate"},
                    {"label": "Typical income", "value": f"Rs.{band['p50']:,.0f}", "source": band["basis"]},
                    {"label": "Discretionary share", "value": f"Rs.{spend['discretionary']:,.0f}", "source": "categorised debits"},
                ],
            )
        )
    return signals
