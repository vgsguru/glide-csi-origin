from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.core.db import get_db
from app.core.security import auth_required
from app.models.finance import Device, Transaction
from app.services import llm_service

bp = Blueprint("profile", __name__, url_prefix="/profile")

ALLOWED_OBJECTIVES = {"buffer", "obligations", "goals", "investing", "discretionary"}


@bp.get("")
@auth_required
def get_profile():
    db = get_db()
    devices = db.query(Device).filter(Device.user_id == g.user.id).all()
    return jsonify({
        "user": g.user.to_dict(),
        "devices": [d.to_dict() for d in devices],
        "engine": llm_service.model_status(),
        "transaction_count": db.query(Transaction).filter(Transaction.user_id == g.user.id).count(),
    })


@bp.patch("")
@auth_required
def update_profile():
    """Edits here change the arbitrator's inputs, so the next tick can flip."""
    data = request.get_json(silent=True) or {}
    user = g.user
    changed = []

    if "name" in data and data["name"]:
        user.name = str(data["name"])[:120]
        changed.append("name")

    if "risk_tolerance" in data:
        try:
            user.risk_tolerance = max(0, min(int(data["risk_tolerance"]), 100))
            changed.append("risk_tolerance")
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_risk_tolerance"}), 400

    if "priorities" in data:
        priorities = data["priorities"]
        if not isinstance(priorities, list) or not priorities:
            return jsonify({"error": "invalid_priorities"}), 400
        cleaned = [p for p in priorities if p in ALLOWED_OBJECTIVES]
        if not cleaned:
            return jsonify({"error": "invalid_priorities"}), 400
        for objective in ALLOWED_OBJECTIVES:
            if objective not in cleaned:
                cleaned.append(objective)
        user.priorities = cleaned
        changed.append("priorities")

    if "buffer_floor" in data:
        try:
            user.buffer_floor = max(0.0, float(data["buffer_floor"]))
            changed.append("buffer_floor")
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_buffer_floor"}), 400

    if "income_type" in data and data["income_type"] in ("variable", "salaried", "mixed"):
        user.income_type = data["income_type"]
        changed.append("income_type")

    if "monthly_baseline" in data:
        try:
            user.monthly_baseline = max(0.0, float(data["monthly_baseline"]))
            changed.append("monthly_baseline")
        except (TypeError, ValueError):
            pass

    if data.get("onboarded") is not None:
        user.onboarded = bool(data["onboarded"])
        changed.append("onboarded")

    get_db().commit()
    return jsonify({"user": user.to_dict(), "changed": changed})


@bp.post("/devices")
@auth_required
def register_device():
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "Android device")[:120]
    db = get_db()

    device = db.query(Device).filter(Device.user_id == g.user.id, Device.label == label).first()
    if device is None:
        device = Device(user_id=g.user.id, label=label, platform=data.get("platform", "android"))
        db.add(device)
    device.last_sync_at = datetime.now(timezone.utc)
    db.commit()
    return jsonify({"device": device.to_dict()})
