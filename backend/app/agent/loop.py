"""The agent tick: perceive -> model -> reason -> arbitrate -> decide -> act -> log."""
import time
from datetime import datetime, timezone

from app.agent.arbitrator import arbitrate
from app.agent import policy
from app.detectors import run_all
from app.models.finance import AgentRun, Insight
from app.services import financial_engine
from app.services.classifier import refresh_recurring_obligations


def tick(db, user, trigger: str = "manual", use_llm: bool = True):
    """Run one full agent cycle. Returns the AgentRun row."""
    started = time.perf_counter()

    # 1. MODEL -- rediscover obligations, then rebuild the live state.
    refresh_recurring_obligations(db, user.id)
    state = financial_engine.build_state(db, user)
    snapshot, _ = financial_engine.write_snapshot(db, user, state)

    # 2. REASON -- pure detectors over the snapshot.
    signals = run_all(state, user)

    # 3. ARBITRATE -- resolve competing objectives against stated priorities.
    ranked, trace = arbitrate(signals, user)

    # 4. DECIDE -- attention budget, cooldown, novelty.
    surfaced, suppressed = policy.apply(db, user, ranked)

    # 5. ACT -- retire stale cards, write the new ones.
    _retire_stale(db, user, [e["signal"].detector for e in surfaced])

    surfaced_records = []
    for entry in surfaced:
        signal = entry["signal"]
        body = signal.body
        if use_llm:
            body = _maybe_polish(signal, body)

        insight = Insight(
            user_id=user.id,
            kind=signal.kind,
            detector=signal.detector,
            title=signal.title,
            body=body,
            reasoning=signal.reasoning,
            evidence_refs=signal.evidence,
            magnitude=abs(signal.magnitude),
            score=entry["utility"],
            severity=signal.severity,
            snapshot_ref=snapshot.ref,
            status="active",
        )
        db.add(insight)
        surfaced_records.append(
            {
                "title": signal.title,
                "detector": signal.detector,
                "objective": signal.objective,
                "score": round(entry["utility"], 4),
                "reason": entry["explain"],
            }
        )

    # 6. LOG -- the audit trail that makes the decision inspectable.
    run = AgentRun(
        user_id=user.id,
        trigger=trigger,
        snapshot_ref=snapshot.ref,
        signals_considered=len(signals),
        surfaced=surfaced_records,
        suppressed=suppressed,
        arbitration=trace,
        duration_ms=int((time.perf_counter() - started) * 1000),
    )
    db.add(run)
    db.commit()
    return run


def _retire_stale(db, user, active_detectors):
    """Cards whose condition no longer fires should disappear on their own."""
    rows = (
        db.query(Insight)
        .filter(Insight.user_id == user.id, Insight.status == "active")
        .all()
    )
    for insight in rows:
        if insight.detector not in active_detectors:
            insight.status = "resolved"
            insight.dismissed_at = datetime.now(timezone.utc)


def _maybe_polish(signal, fallback):
    """Optionally let gemma4 rephrase -- but never let it invent a number.

    The template output is the default, not the fallback. The LLM only ever
    gets to *replace* it if every figure it produced already existed in the
    input, which the numeral guard enforces.
    """
    try:
        from app.services.llm_service import polish_insight

        polished = polish_insight(signal.title, fallback, signal.reasoning)
        return polished or fallback
    except Exception:
        return fallback
