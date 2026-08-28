from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.agent import loop
from app.core.db import get_db
from app.core.security import auth_required
from app.models.finance import AgentRun, Insight

bp = Blueprint("agent", __name__)


@bp.post("/agent/tick")
@auth_required
def tick():
    """Force one agent cycle. The demo's 'watch it change its mind' button."""
    db = get_db()
    data = request.get_json(silent=True) or {}
    run = loop.tick(
        db, g.user,
        trigger=data.get("trigger", "manual"),
        use_llm=data.get("use_llm", True),
    )
    active = (
        db.query(Insight)
        .filter(Insight.user_id == g.user.id, Insight.status == "active")
        .order_by(Insight.score.desc())
        .all()
    )
    return jsonify({"run": run.to_dict(), "insights": [i.to_dict() for i in active]})


@bp.get("/agent/runs")
@auth_required
def runs():
    db = get_db()
    limit = min(int(request.args.get("limit", 25)), 100)
    rows = (
        db.query(AgentRun)
        .filter(AgentRun.user_id == g.user.id)
        .order_by(AgentRun.created_at.desc())
        .limit(limit).all()
    )
    return jsonify({"count": len(rows), "runs": [r.to_dict() for r in rows]})


@bp.get("/insights")
@auth_required
def insights():
    db = get_db()
    status = request.args.get("status", "active")
    query = db.query(Insight).filter(Insight.user_id == g.user.id)
    if status != "all":
        query = query.filter(Insight.status == status)
    rows = query.order_by(Insight.score.desc(), Insight.created_at.desc()).limit(50).all()
    return jsonify({"count": len(rows), "insights": [i.to_dict() for i in rows]})


@bp.post("/insights/<int:insight_id>/dismiss")
@auth_required
def dismiss(insight_id):
    db = get_db()
    insight = db.query(Insight).filter(
        Insight.id == insight_id, Insight.user_id == g.user.id
    ).first()
    if insight is None:
        return jsonify({"error": "not_found"}), 404
    insight.status = "dismissed"
    insight.dismissed_at = datetime.now(timezone.utc)
    db.commit()
    return jsonify({"insight": insight.to_dict()})


@bp.post("/insights/<int:insight_id>/act")
@auth_required
def act(insight_id):
    db = get_db()
    insight = db.query(Insight).filter(
        Insight.id == insight_id, Insight.user_id == g.user.id
    ).first()
    if insight is None:
        return jsonify({"error": "not_found"}), 404
    insight.status = "acted"
    insight.dismissed_at = datetime.now(timezone.utc)
    db.commit()
    return jsonify({"insight": insight.to_dict()})
