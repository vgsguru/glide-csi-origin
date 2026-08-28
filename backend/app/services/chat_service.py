"""Grounded chat.

Two paths, one contract: every answer cites the snapshot it used and lists the
figures behind it.

  * The RULE path answers the questions that actually matter (affordability,
    buffer health, where the money went) deterministically. It is the default,
    not the fallback -- it works with zero keys and cannot hallucinate.
  * The gemma4:12b path handles everything else, but only sees a numeric
    context block, and its output passes the numeral guard before delivery.
"""
import re
from datetime import datetime, timezone

from app.models.finance import ChatMessage
from app.services import financial_engine, llm_service

AFFORD_RE = re.compile(
    r"(?:afford|spend|buy|blow|drop|purchase)\D{0,30}?(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)"
    r"|(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\D{0,25}?(?:afford|spend|worth)",
    re.IGNORECASE,
)


def build_context(state, user):
    """The numeric ground truth. Both paths answer only from this."""
    band = state["income"]
    sts = state["safe_to_spend"]
    spend = state["spend"]
    top = spend["by_category"][:5]
    obligations = state["obligations"][:6]

    lines = [
        f"Currency: INR (write amounts as Rs.X)",
        f"Observed balance: Rs.{state['balance']:,.0f} ({state['balance_basis']})",
        f"Safe to spend today: Rs.{sts['amount']:,.0f}",
        f"  = balance Rs.{sts['components']['balance']:,.0f}"
        f" + conservative expected inflow Rs.{sts['components']['expected_inflow_conservative']:,.0f}"
        f" - obligations due Rs.{sts['components']['committed_obligations']:,.0f}"
        f" - buffer floor Rs.{sts['components']['buffer_floor']:,.0f}",
        f"Buffer floor (user-set): Rs.{state['buffer_floor']:,.0f}",
        f"Monthly income band: p10 Rs.{band['p10']:,.0f} / p50 Rs.{band['p50']:,.0f} / p90 Rs.{band['p90']:,.0f}",
        f"Income basis: {band['basis']} (stability: {band['stability']})",
        f"30-day spend: Rs.{spend['total']:,.0f} total, Rs.{spend['discretionary']:,.0f} discretionary,"
        f" Rs.{spend['essential']:,.0f} essential",
        f"Daily run-rate: Rs.{spend['daily_run_rate']:,.0f}/day across {spend['transaction_count']} transactions",
    ]

    if top:
        lines.append("Top spending categories (last 30 days):")
        for category in top:
            lines.append(
                f"  - {category['category']}: Rs.{category['amount']:,.0f}"
                f" ({category['share'] * 100:.0f}%, {category['count']} txns)"
            )

    if obligations:
        lines.append("Upcoming obligations (auto-discovered, not configured):")
        for obligation in obligations:
            lines.append(
                f"  - {obligation['name']}: Rs.{obligation['expected_amount']:,.0f}"
                f" due in {obligation['days_until']} days"
                f" ({obligation['confidence'] * 100:.0f}% confidence,"
                f" seen {obligation['occurrences']} times)"
            )
    else:
        lines.append("Upcoming obligations: none discovered yet")

    expected = next((s for s in state["projection"] if s["scenario"] == "expected"), None)
    if expected:
        lines.append(
            f"30-day projection (expected case): ends at Rs.{expected['end_balance']:,.0f}"
            + (
                f", crosses the buffer floor on day {expected['breach_day']}"
                if expected["breaches_floor"] else ", stays above the buffer floor"
            )
        )

    lines.append(
        f"User settings: risk tolerance {user.risk_tolerance}/100, "
        f"priority order {', '.join(user.priorities or [])}"
    )
    lines.append(f"Transactions needing review: {state['needs_review_count']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Deterministic answers
# ---------------------------------------------------------------------------

def _grounding(pairs):
    return [{"label": label, "value": value} for label, value in pairs]


def rule_answer(question: str, state, user):
    """Returns (answer, grounding) or (None, None) when no rule applies."""
    low = question.lower()
    sts = state["safe_to_spend"]
    band = state["income"]
    spend = state["spend"]
    floor = state["buffer_floor"]

    # --- "can I afford Rs.X?" ---------------------------------------------
    match = AFFORD_RE.search(question)
    if match and any(word in low for word in ("afford", "spend", "buy", "purchase", "worth", "ok to")):
        raw = match.group(1) or match.group(2)
        try:
            amount = float(raw.replace(",", ""))
        except (TypeError, ValueError):
            amount = None
        if amount and amount > 0:
            remaining = sts["amount"] - amount
            if remaining >= 0:
                verdict = (
                    f"Yes -- Rs.{amount:,.0f} fits. Your safe-to-spend today is "
                    f"Rs.{sts['amount']:,.0f}, so you would have Rs.{remaining:,.0f} left "
                    f"above your Rs.{floor:,.0f} floor."
                )
            else:
                verdict = (
                    f"I would be cautious. Safe-to-spend today is Rs.{sts['amount']:,.0f}, so "
                    f"Rs.{amount:,.0f} would dip Rs.{abs(remaining):,.0f} below your "
                    f"Rs.{floor:,.0f} buffer floor."
                )
            obligations = state["obligations"][:2]
            if obligations:
                nearest = obligations[0]
                verdict += (
                    f" {nearest['name']} (Rs.{nearest['expected_amount']:,.0f}) is due in "
                    f"{nearest['days_until']} days and is already accounted for."
                )
            return verdict, _grounding([
                ("Safe to spend", f"Rs.{sts['amount']:,.0f}"),
                ("Requested", f"Rs.{amount:,.0f}"),
                ("Buffer floor", f"Rs.{floor:,.0f}"),
                ("Obligations due", f"Rs.{state['obligations_total']:,.0f}"),
            ])

    # --- "why is my buffer low?" ------------------------------------------
    if any(word in low for word in ("buffer", "safe to spend", "safe-to-spend")) and any(
        word in low for word in ("why", "low", "down", "drop", "thin", "shrink")
    ):
        obligations = state["obligations"][:3]
        if obligations:
            detail = "; ".join(
                f"{o['name']} Rs.{o['expected_amount']:,.0f} in {o['days_until']}d" for o in obligations
            )
        else:
            detail = "no obligations discovered yet"
        answer = (
            f"Safe-to-spend is Rs.{sts['amount']:,.0f} because Rs.{state['obligations_total']:,.0f} "
            f"of obligations land inside {state['horizon_days']} days and your floor is "
            f"Rs.{floor:,.0f}. The largest claims: {detail}."
        )
        if spend["discretionary"] > spend["essential"]:
            answer += (
                f" Discretionary spending (Rs.{spend['discretionary']:,.0f}) is also "
                f"outrunning essentials (Rs.{spend['essential']:,.0f}) this month."
            )
        return answer, _grounding([
            ("Safe to spend", f"Rs.{sts['amount']:,.0f}"),
            ("Obligations due", f"Rs.{state['obligations_total']:,.0f}"),
            ("Buffer floor", f"Rs.{floor:,.0f}"),
            ("Observed balance", f"Rs.{state['balance']:,.0f}"),
        ])

    # --- "how much do I earn?" --------------------------------------------
    if any(word in low for word in ("income", "earn", "make", "salary")) and not any(
        word in low for word in ("spend", "spent")
    ):
        answer = (
            f"I model your income as a range, not a single number: a low month is about "
            f"Rs.{band['p10']:,.0f}, typical is Rs.{band['p50']:,.0f}, a good month reaches "
            f"Rs.{band['p90']:,.0f}. Basis: {band['basis']}. I treat it as {band['stability']}, "
            f"so plan against the low end."
        )
        return answer, _grounding([
            ("Low month (p10)", f"Rs.{band['p10']:,.0f}"),
            ("Typical (p50)", f"Rs.{band['p50']:,.0f}"),
            ("Good month (p90)", f"Rs.{band['p90']:,.0f}"),
            ("Basis", band["basis"]),
        ])

    # --- "where did my money go?" -----------------------------------------
    if any(phrase in low for phrase in ("where", "spend", "spent", "going", "breakdown", "category")):
        top = spend["by_category"][:4]
        if top:
            listed = ", ".join(
                f"{c['category']} Rs.{c['amount']:,.0f} ({c['share'] * 100:.0f}%)" for c in top
            )
            answer = (
                f"Over the last 30 days you spent Rs.{spend['total']:,.0f} across "
                f"{spend['transaction_count']} transactions: {listed}. "
                f"Rs.{spend['discretionary']:,.0f} of that was discretionary -- that is the part "
                f"you can actually move."
            )
            return answer, _grounding(
                [("Total 30-day spend", f"Rs.{spend['total']:,.0f}")]
                + [(c["category"], f"Rs.{c['amount']:,.0f}") for c in top]
            )

    # --- "what is due?" ----------------------------------------------------
    if any(word in low for word in ("due", "obligation", "bill", "upcoming", "rent", "subscription")):
        obligations = state["obligations"]
        if not obligations:
            return (
                "I have not discovered any recurring obligations yet. They appear "
                "automatically once a payment repeats -- nothing to configure.",
                _grounding([("Discovered obligations", "0")]),
            )
        listed = "; ".join(
            f"{o['name']} Rs.{o['expected_amount']:,.0f} in {o['days_until']}d "
            f"({o['confidence'] * 100:.0f}% confidence)"
            for o in obligations[:5]
        )
        answer = (
            f"Rs.{state['obligations_total']:,.0f} is committed over the next "
            f"{state['horizon_days']} days: {listed}. Every one of these was learned from "
            f"repeats, not entered by you."
        )
        return answer, _grounding(
            [("Total committed", f"Rs.{state['obligations_total']:,.0f}")]
            + [(o["name"], f"Rs.{o['expected_amount']:,.0f} in {o['days_until']}d") for o in obligations[:4]]
        )

    return None, None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are Glide, an agentic financial copilot for people with variable income in India.\n"
    "ABSOLUTE RULES:\n"
    "1. Use ONLY the figures in the CONTEXT block. Never invent, estimate, or extrapolate a number.\n"
    "2. If the context does not contain what is needed, say so plainly.\n"
    "3. Write amounts as Rs.X (no currency symbol).\n"
    "4. Be concise: 2-4 sentences, plain English, no markdown, no bullet lists, no emoji.\n"
    "5. Always name the figures you used, so the user can check you.\n"
    "6. You are not a licensed financial adviser; describe the user's own numbers rather "
    "than recommending specific financial products."
)


def answer(db, user, question: str, prefer_llm: bool = True):
    state = financial_engine.build_state(db, user)
    snapshot = financial_engine.latest_snapshot(db, user.id)
    if snapshot is None:
        snapshot, _ = financial_engine.write_snapshot(db, user, state)
    context = build_context(state, user)

    rule_text, grounding = rule_answer(question, state, user)
    engine = "rules"
    text = rule_text

    if prefer_llm and llm_service.is_available():
        history = (
            db.query(ChatMessage)
            .filter(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(6)
            .all()
        )
        messages = [
            {"role": m.role, "content": m.content}
            for m in reversed(history)
            if m.role in ("user", "assistant")
        ]
        if rule_text:
            prompt = (
                f"CONTEXT (the only facts you may use):\n{context}\n\n"
                f"A deterministic engine already produced this correct answer:\n\"{rule_text}\"\n\n"
                f"User asked: {question}\n\n"
                f"Rewrite that answer to sound natural and conversational. Keep every number "
                f"identical. Do not add any figure that is not above."
            )
        else:
            prompt = (
                f"CONTEXT (the only facts you may use):\n{context}\n\n"
                f"User asked: {question}\n\n"
                f"Answer using only the context above."
            )
        messages.append({"role": "user", "content": prompt})

        generated = llm_service.strip_think(
            llm_service.chat(messages, system=SYSTEM_PROMPT, temperature=0.3) or ""
        )
        if generated:
            allowed = f"{context}\n{rule_text or ''}"
            if llm_service.numerals_are_grounded(generated, allowed):
                text = generated
                engine = llm_service.MODEL_NAME
            else:
                print("[chat] gemma4 output rejected by numeral guard; using rule answer")

    if not text:
        text = (
            f"I can answer from your live numbers. Right now: safe-to-spend "
            f"Rs.{state['safe_to_spend']['amount']:,.0f}, observed balance "
            f"Rs.{state['balance']:,.0f}, and Rs.{state['obligations_total']:,.0f} "
            f"of obligations inside {state['horizon_days']} days. Ask me whether you can "
            f"afford something, why your buffer moved, or where your money went."
        )
        grounding = _grounding([
            ("Safe to spend", f"Rs.{state['safe_to_spend']['amount']:,.0f}"),
            ("Observed balance", f"Rs.{state['balance']:,.0f}"),
        ])

    if grounding is None:
        grounding = _grounding([
            ("Safe to spend", f"Rs.{state['safe_to_spend']['amount']:,.0f}"),
            ("Income p50", f"Rs.{state['income']['p50']:,.0f}"),
            ("Obligations due", f"Rs.{state['obligations_total']:,.0f}"),
        ])

    db.add(ChatMessage(user_id=user.id, role="user", content=question, engine=engine))
    reply = ChatMessage(
        user_id=user.id,
        role="assistant",
        content=text,
        cited_snapshot_ref=snapshot.ref,
        grounding=grounding,
        engine=engine,
    )
    db.add(reply)
    db.commit()
    return reply


def suggestions(state):
    """Chips generated from live state, never static examples."""
    chips = []
    sts = state["safe_to_spend"]["amount"]
    if sts > 0:
        probe = max(500, int(round(sts * 0.4 / 100.0)) * 100)
        chips.append(f"Can I afford Rs.{probe:,}?")
    if state["obligations"]:
        nearest = state["obligations"][0]
        chips.append(f"Why is {nearest['name']} due so soon?")
    if state["safe_to_spend"]["is_negative"] or sts < state["buffer_floor"] * 0.5:
        chips.append("Why is my buffer low?")
    if state["spend"]["total"] > 0:
        chips.append("Where did my money go this month?")
    chips.append("What is my income range?")
    if state["obligations"]:
        chips.append("What is due in the next 30 days?")
    return chips[:5]
