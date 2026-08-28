"""Obligation detection -- what is due, and is it actually covered?"""
from app.detectors import Signal


def detect(state, user):
    signals = []
    obligations = state["obligations"]
    balance = state["balance"]

    # --- a large obligation lands before the money does ---------------------
    imminent = [o for o in obligations if 0 <= o["days_until"] <= 5]
    for obligation in imminent:
        if obligation["expected_amount"] > balance * 0.6 or obligation["expected_amount"] > balance:
            covered = balance >= obligation["expected_amount"]
            signals.append(
                Signal(
                    detector="obligation_cover",
                    objective="obligations",
                    kind="risk",
                    severity="critical" if not covered else "warn",
                    title=(
                        f"{obligation['name']} (Rs.{obligation['expected_amount']:,.0f}) "
                        f"due in {obligation['days_until']} day"
                        f"{'s' if obligation['days_until'] != 1 else ''}"
                    ),
                    body=(
                        f"This is {obligation['expected_amount'] / max(balance, 1) * 100:.0f}% of "
                        f"your observed balance. "
                        + (
                            "It is covered, but it will take most of what you have."
                            if covered
                            else f"You are Rs.{obligation['expected_amount'] - balance:,.0f} short right now."
                        )
                    ),
                    magnitude=obligation["expected_amount"] if not covered else obligation["expected_amount"] * 0.4,
                    reasoning=(
                        f"discovered from {obligation['occurrences']} repeats at "
                        f"{obligation['confidence'] * 100:.0f}% confidence, "
                        f"cadence {obligation['cadence_days']} days"
                    ),
                    evidence=[
                        {"label": "Expected amount", "value": f"Rs.{obligation['expected_amount']:,.0f}", "source": f"{obligation['occurrences']} past payments"},
                        {"label": "Detection confidence", "value": f"{obligation['confidence'] * 100:.0f}%", "source": "learned, not configured"},
                        {"label": "Observed balance", "value": f"Rs.{balance:,.0f}", "source": "ledger"},
                    ],
                )
            )

    # --- newly learned commitments the user never told us about -------------
    newly_confident = [
        o for o in obligations
        if o["occurrences"] == 3 and o["confidence"] >= 0.7
    ]
    for obligation in newly_confident:
        signals.append(
            Signal(
                detector="obligation_discovered",
                objective="obligations",
                kind="information",
                severity="info",
                title=f"Learned a recurring payment: {obligation['name']}",
                body=(
                    f"Rs.{obligation['expected_amount']:,.0f} roughly every "
                    f"{obligation['cadence_days']} days. You never configured this -- "
                    f"it was inferred from {obligation['occurrences']} repeats."
                ),
                magnitude=obligation["expected_amount"] * 0.25,
                reasoning=f"{obligation['occurrences']} consistent repeats, cadence {obligation['cadence_days']}d",
                evidence=[
                    {"label": "Confidence", "value": f"{obligation['confidence'] * 100:.0f}%", "source": "rises with each repeat"},
                    {"label": "Cadence", "value": f"every {obligation['cadence_days']} days", "source": "median gap"},
                ],
            )
        )
    return signals
