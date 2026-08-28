from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from app.core.db import get_db
from app.core.security import auth_required
from app.models.finance import Obligation, Transaction
from app.services import financial_engine
from app.services.classifier import refresh_recurring_obligations

bp = Blueprint("dashboard", __name__)


@bp.get("/dashboard/state")
@auth_required
def state():
    db = get_db()
    days = min(int(request.args.get("days", 30)), 90)
    if request.args.get("refresh") != "false":
        refresh_recurring_obligations(db, g.user.id)
        db.commit()
    return jsonify(financial_engine.build_state(db, g.user, days=days))


@bp.get("/dashboard/projection")
@auth_required
def projection():
    db = get_db()
    days = min(int(request.args.get("days", 30)), 90)
    full = financial_engine.build_state(db, g.user, days=days)
    return jsonify({"horizon_days": days, "scenarios": full["projection"]})


@bp.get("/dashboard/timeline")
@auth_required
def timeline():
    """Daily in/out series -- what the dashboard chart draws."""
    db = get_db()
    days = min(int(request.args.get("days", 30)), 180)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == g.user.id)
        .order_by(Transaction.occurred_at.asc())
        .all()
    )

    buckets = {}
    for offset in range(days + 1):
        key = (since + timedelta(days=offset)).strftime("%Y-%m-%d")
        buckets[key] = {"date": key, "inflow": 0.0, "outflow": 0.0, "count": 0}

    for txn in rows:
        occurred = txn.occurred_at
        if occurred is None:
            continue
        if not occurred.tzinfo:
            occurred = occurred.replace(tzinfo=timezone.utc)
        if occurred < since:
            continue
        key = occurred.strftime("%Y-%m-%d")
        bucket = buckets.get(key)
        if bucket is None:
            continue
        if txn.direction == "CREDIT":
            bucket["inflow"] += txn.amount or 0
        else:
            bucket["outflow"] += txn.amount or 0
        bucket["count"] += 1

    series = [
        {**b, "inflow": round(b["inflow"], 2), "outflow": round(b["outflow"], 2)}
        for b in buckets.values()
    ]
    return jsonify({"days": days, "series": series})


@bp.get("/obligations")
@auth_required
def obligations():
    db = get_db()
    if request.args.get("refresh") != "false":
        refresh_recurring_obligations(db, g.user.id)
        db.commit()
    include_dormant = request.args.get("include_dormant") == "true"
    query = db.query(Obligation).filter(Obligation.user_id == g.user.id)
    if not include_dormant:
        query = query.filter(Obligation.status == "active")
    rows = query.order_by(Obligation.next_due.asc()).all()
    return jsonify({
        "count": len(rows),
        "obligations": [o.to_dict() for o in rows],
        "total": round(sum(o.expected_amount or 0 for o in rows), 2),
    })
