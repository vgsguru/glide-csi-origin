"""Buffer-health detection -- is the safety floor about to be breached?"""
from app.detectors import Signal


def detect(state, user):
    signals = []
    sts = state["safe_to_spend"]
    floor = state["buffer_floor"]
    balance = state["balance"]

    # --- the floor is already breached -------------------------------------
    if sts["is_negative"]:
        shortfall = abs(sts["raw"])
        signals.append(
            Signal(
                detector="buffer",
                objective="buffer",
                kind="risk",
                severity="critical",
                title="You are below your safety floor",
                body=(
                    f"After the obligations due in the next {state['horizon_days']} days "
                    f"(Rs.{state['obligations_total']:,.0f}) and your Rs.{floor:,.0f} floor, "
                    f"you are Rs.{shortfall:,.0f} short."
                ),
                magnitude=shortfall,
                reasoning=(
                    f"balance Rs.{balance:,.0f} + conservative inflow "
                    f"Rs.{sts['components']['expected_inflow_conservative']:,.0f} "
                    f"- obligations Rs.{state['obligations_total']:,.0f} "
                    f"- floor Rs.{floor:,.0f} = Rs.{sts['raw']:,.0f}"
                ),
                evidence=[
                    {"label": "Observed balance", "value": f"Rs.{balance:,.0f}", "source": "ledger"},
                    {"label": "Obligations due", "value": f"Rs.{state['obligations_total']:,.0f}", "source": "discovered"},
                    {"label": "Your buffer floor", "value": f"Rs.{floor:,.0f}", "source": "you set this"},
                ],
            )
        )
    # --- thin, but not yet breached ----------------------------------------
    elif floor > 0 and sts["amount"] < floor * 0.35:
        signals.append(
            Signal(
                detector="buffer",
                objective="buffer",
                kind="risk",
                severity="warn",
                title="Your buffer is thin this cycle",
                body=(
                    f"Rs.{sts['amount']:,.0f} is spendable above your floor -- "
                    f"about {sts['amount'] / max(state['spend']['daily_run_rate'], 1):.0f} days "
                    f"at your current spending rate."
                ),
                magnitude=floor - sts["amount"],
                reasoning=(
                    f"safe-to-spend Rs.{sts['amount']:,.0f} is under 35% of your "
                    f"Rs.{floor:,.0f} floor"
                ),
                evidence=[
                    {"label": "Safe to spend", "value": f"Rs.{sts['amount']:,.0f}", "source": "computed"},
                    {"label": "Daily run-rate", "value": f"Rs.{state['spend']['daily_run_rate']:,.0f}/day", "source": "last 30 days"},
                ],
            )
        )

    # --- forward-looking: the projection breaches even if today is fine -----
    pessimistic = next((s for s in state["projection"] if s["scenario"] == "pessimistic"), None)
    expected = next((s for s in state["projection"] if s["scenario"] == "expected"), None)
    if expected and expected["breaches_floor"] and not sts["is_negative"]:
        signals.append(
            Signal(
                detector="buffer_projection",
                objective="buffer",
                kind="risk",
                severity="warn",
                title=f"Projected to dip below your floor in {expected['breach_day']} days",
                body=(
                    f"On your expected income (Rs.{state['income']['p50']:,.0f}/month) and current "
                    f"spending, the balance crosses your Rs.{floor:,.0f} floor around day "
                    f"{expected['breach_day']}."
                ),
                magnitude=max(floor - expected["end_balance"], 0),
                reasoning=(
                    f"expected-case projection ends at Rs.{expected['end_balance']:,.0f} "
                    f"vs floor Rs.{floor:,.0f}"
                ),
                evidence=[
                    {"label": "Expected income (p50)", "value": f"Rs.{state['income']['p50']:,.0f}", "source": state["income"]["basis"]},
                    {"label": "Breach day", "value": f"day {expected['breach_day']}", "source": "30-day projection"},
                    {
                        "label": "Pessimistic case",
                        "value": f"Rs.{pessimistic['end_balance']:,.0f}" if pessimistic else "n/a",
                        "source": "p10 income",
                    },
                ],
            )
        )
    return signals
