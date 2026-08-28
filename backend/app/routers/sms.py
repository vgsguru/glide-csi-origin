"""Ingestion endpoints -- the perception layer's front door."""
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app.core.db import get_db
from app.core.security import auth_required
from app.models.finance import Device, Transaction, TransactionEvidence
from app.services import resolver
from app.services.classifier import refresh_recurring_obligations
from app.services.sms_parser import parse_batch, parse_sms

bp = Blueprint("sms", __name__, url_prefix="/sms")


@bp.post("/ingest")
@auth_required
def ingest_one():
    data = request.get_json(silent=True) or {}
    body = data.get("body") or data.get("text") or ""
    if not body:
        return jsonify({"error": "empty_body"}), 400

    parsed = parse_sms(body, data.get("sender", ""), _coerce(data.get("received_at")))
    if not parsed.get("ok"):
        return jsonify({"ingested": False, "reason": parsed.get("reason")}), 200

    db = get_db()
    parsed["dedupe_key"] = None
    txn, action = resolver.ingest_parsed(db, g.user.id, parsed, data.get("source_type", "SMS"))
    db.commit()

    return jsonify({
        "ingested": True,
        "action": action,
        "transaction": txn.to_dict(with_evidence=True),
    })


@bp.post("/ingest-batch")
@auth_required
def ingest_batch():
    """The Android client's bulk path -- a month of inbox in one call."""
    data = request.get_json(silent=True) or {}
    messages = data.get("messages") or []
    if not isinstance(messages, list):
        return jsonify({"error": "messages_must_be_a_list"}), 400
    if len(messages) > 5000:
        return jsonify({"error": "too_many_messages", "detail": "Send at most 5000 per call."}), 413

    db = get_db()
    parsed_list, rejected = parse_batch(messages, g.user.id)
    result = resolver.ingest_many(db, g.user.id, parsed_list, data.get("source_type", "SMS"))

    # Newly ingested history can reveal recurring commitments immediately.
    refresh_recurring_obligations(db, g.user.id)

    device_label = data.get("device_label")
    if device_label:
        device = db.query(Device).filter(
            Device.user_id == g.user.id, Device.label == device_label
        ).first()
        if device is None:
            device = Device(user_id=g.user.id, label=device_label[:120])
            db.add(device)
        device.last_sync_at = datetime.now(timezone.utc)
        device.messages_ingested = (device.messages_ingested or 0) + len(parsed_list)

    db.commit()

    return jsonify({
        "received": len(messages),
        "parsed": len(parsed_list),
        "rejected": len(rejected),
        "created": result["created"],
        "merged": result["merged"],
        "needs_review": result["needs_review"],
        "rejection_samples": rejected[:8],
    })


@bp.get("/status")
@auth_required
def status():
    db = get_db()
    total = db.query(Transaction).filter(Transaction.user_id == g.user.id).count()
    from_sms = (
        db.query(TransactionEvidence)
        .join(Transaction, Transaction.id == TransactionEvidence.transaction_id)
        .filter(Transaction.user_id == g.user.id, TransactionEvidence.source_type == "SMS")
        .count()
    )
    devices = db.query(Device).filter(Device.user_id == g.user.id).all()
    return jsonify({
        "transactions": total,
        "sms_evidence": from_sms,
        "devices": [d.to_dict() for d in devices],
    })


def _coerce(value):
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, (int, float)):
        seconds = value / 1000.0 if value > 10_000_000_000 else float(value)
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)
