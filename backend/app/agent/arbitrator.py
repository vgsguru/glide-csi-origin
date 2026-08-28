"""Objective arbitration.

Competing signals want incompatible things: the buffer detector wants you to
hold cash, the surplus detector wants you to invest it. Something has to decide,
and that decision must be *the user's*, not ours.

The waterfall walks the user's stated priority order. Risk tolerance sets a
`floor_mult` that decides how hard a lower-priority objective has to fight to
outrank a higher one. Same data + a different priority order = a different
answer. That is the whole point.
"""
from app.models.finance import DEFAULT_PRIORITIES

OBJECTIVES = ["buffer", "obligations", "goals", "investing", "discretionary"]


def floor_multiplier(risk_tolerance: int) -> float:
    """Conservative users defend the buffer harder.

    0   (max conservative) -> 1.6x weight on protective objectives
    100 (max aggressive)   -> 0.6x
    """
    risk = max(0, min(int(risk_tolerance or 50), 100))
    return round(1.6 - (risk / 100.0) * 1.0, 3)


def priority_weights(priorities):
    """Earlier in the user's list -> heavier weight."""
    ordered = [p for p in (priorities or []) if p in OBJECTIVES]
    for objective in DEFAULT_PRIORITIES:
        if objective not in ordered:
            ordered.append(objective)
    count = len(ordered)
    return {objective: round(1.0 - (index / count) * 0.75, 3) for index, objective in enumerate(ordered)}, ordered


def arbitrate(signals, user):
    """Rank signals by (priority weight x risk posture x magnitude).

    Returns (ranked, trace) where trace explains the decision well enough that
    the Activity screen can show a judge exactly why one card won.
    """
    weights, ordered = priority_weights(user.priorities)
    multiplier = floor_multiplier(user.risk_tolerance)

    protective = {"buffer", "obligations"}
    growth = {"investing", "goals"}

    magnitudes = [abs(s.magnitude) for s in signals if s.magnitude] or [1.0]
    max_magnitude = max(magnitudes)

    ranked = []
    for signal in signals:
        weight = weights.get(signal.objective, 0.3)

        # Risk posture: conservative users amplify protective objectives and
        # damp growth ones; aggressive users do the reverse.
        if signal.objective in protective:
            posture = multiplier
        elif signal.objective in growth:
            posture = round(2.0 - multiplier, 3)
        else:
            posture = 1.0

        normalized_magnitude = min(abs(signal.magnitude) / max_magnitude, 1.0) if max_magnitude else 0.0
        severity_boost = {"critical": 1.35, "warn": 1.12, "info": 1.0}.get(signal.severity, 1.0)

        utility = round(weight * posture * (0.35 + 0.65 * normalized_magnitude) * severity_boost, 4)

        ranked.append(
            {
                "signal": signal,
                "utility": utility,
                "weight": weight,
                "posture": posture,
                "normalized_magnitude": round(normalized_magnitude, 3),
                "explain": (
                    f"objective '{signal.objective}' ranked #{ordered.index(signal.objective) + 1} "
                    f"in your priorities (weight {weight}), risk posture x{posture}, "
                    f"impact Rs.{abs(signal.magnitude):,.0f}"
                ),
            }
        )

    ranked.sort(key=lambda entry: entry["utility"], reverse=True)

    trace = {
        "priorities": ordered,
        "risk_tolerance": user.risk_tolerance,
        "floor_mult": multiplier,
        "weights": weights,
        "winner": ranked[0]["signal"].title if ranked else None,
        "winner_objective": ranked[0]["signal"].objective if ranked else None,
        "waterfall": [
            {
                "objective": entry["signal"].objective,
                "title": entry["signal"].title,
                "utility": entry["utility"],
                "why": entry["explain"],
            }
            for entry in ranked
        ],
    }
    return ranked, trace
