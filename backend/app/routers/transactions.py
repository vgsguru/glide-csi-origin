from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.core.db import get_db
from app.core.security import auth_required
from app.models.finance import Transaction
from app.services import resolver
from app.services.sms_parser import categorize

bp = Blueprint("transactions", __name__, url_prefix="/transactions")


@bp.get("")
@auth_required
def list_transactions():
    db = get_db()
    limit = min(int(request.args.get("limit", 100)), 500)
    offset = int(request.args.get("offset", 0))

    query = db.query(Transaction).filter(Transaction.user_id == g.user.id)

    if request.args.get("direction") in ("CREDIT", "DEBIT"):
        query = query.filter(Transaction.direction == request.args["direction"])
    if request.args.get("category"):
        query = query.filter(Transaction.category == request.args["category"])
    if request.args.get("needs_review") == "true":
        query = query.filter(Transaction.needs_review.is_(True))

    total = query.count()
    rows = (
        query.order_by(Transaction.occurred_at.desc())
        .offset(offset).limit(limit).all()
    )
    with_evidence = request.args.get("evidence") == "true"
    return jsonify({
        "total": total,
        "count": len(rows),
        "transactions": [r.to_dict(with_evidence=with_evidence) for r in rows],
    })


@bp.get("/<int:txn_id>")
@auth_required
def get_transaction(txn_id):
    db = get_db()
    txn = db.query(Transaction).filter(
        Transaction.id == txn_id, Transaction.user_id == g.user.id
    ).first()
    if txn is None:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"transaction": txn.to_dict(with_evidence=True)})


@bp.post("")
@auth_required
def create_transaction():
    """Manual entry -- the always-available fallback path."""
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_amount"}), 400
    if amount <= 0:
        return jsonify({"error": "invalid_amount"}), 400

    direction = data.get("direction", "DEBIT").upper()
    if direction not in ("CREDIT", "DEBIT"):
        return jsonify({"error": "invalid_direction"}), 400

    merchant = (data.get("merchant") or "Manual entry")[:160]
    occurred_at = _coerce(data.get("occurred_at"))
    category = data.get("category") or categorize(merchant, merchant, direction)

    db = get_db()
    parsed = {
        "amount": amount,
        "direction": direction,
        "merchant": merchant,
        "category": category,
        "channel": data.get("channel", "CASH"),
        "account_hint": data.get("account_hint", "MANUAL"),
        "occurred_at": occurred_at,
        "confidence": 0.99,          # you told us directly; nothing to infer
        "raw": data.get("note") or f"Manual entry: {merchant} {amount}",
        "sender": "manual",
    }
    txn, action = resolver.ingest_parsed(db, g.user.id, parsed, "MANUAL")
    db.commit()
    return jsonify({"transaction": txn.to_dict(with_evidence=True), "action": action}), 201


@bp.patch("/<int:txn_id>")
@auth_required
def update_transaction(txn_id):
    """Review-queue corrections. A human edit is authoritative."""
    db = get_db()
    txn = db.query(Transaction).filter(
        Transaction.id == txn_id, Transaction.user_id == g.user.id
    ).first()
    if txn is None:
        return jsonify({"error": "not_found"}), 404

    data = request.get_json(silent=True) or {}
    if "amount" in data:
        try:
            txn.amount = float(data["amount"])
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_amount"}), 400
    if "merchant" in data:
        txn.merchant = str(data["merchant"])[:160]
    if "category" in data:
        txn.category = str(data["category"])[:40]
    if "direction" in data and data["direction"] in ("CREDIT", "DEBIT"):
        txn.direction = data["direction"]
    if data.get("confirm"):
        txn.needs_review = False
        txn.has_conflict = False
        txn.confidence = 0.99

    db.commit()
    return jsonify({"transaction": txn.to_dict(with_evidence=True)})


@bp.delete("/<int:txn_id>")
@auth_required
def delete_transaction(txn_id):
    db = get_db()
    txn = db.query(Transaction).filter(
        Transaction.id == txn_id, Transaction.user_id == g.user.id
    ).first()
    if txn is None:
        return jsonify({"error": "not_found"}), 404
    db.delete(txn)
    db.commit()
    return jsonify({"deleted": txn_id})


@bp.get("/review")
@auth_required
def review_queue():
    db = get_db()
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == g.user.id, Transaction.needs_review.is_(True))
        .order_by(Transaction.occurred_at.desc())
        .limit(50).all()
    )
    return jsonify({
        "count": len(rows),
        "transactions": [r.to_dict(with_evidence=True) for r in rows],
    })


def _coerce(value):
    if value is None:
        return datetime.now(timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)
