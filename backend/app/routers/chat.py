from flask import Blueprint, g, jsonify, request

from app.core.db import get_db
from app.core.security import auth_required
from app.models.finance import ChatMessage
from app.services import chat_service, financial_engine, llm_service

bp = Blueprint("chat", __name__, url_prefix="/chat")


@bp.post("")
@auth_required
def send():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "empty_message"}), 400
    if len(message) > 1000:
        return jsonify({"error": "message_too_long"}), 400

    reply = chat_service.answer(
        get_db(), g.user, message, prefer_llm=data.get("use_llm", True)
    )
    return jsonify({"reply": reply.to_dict()})


@bp.get("/history")
@auth_required
def history():
    db = get_db()
    limit = min(int(request.args.get("limit", 50)), 200)
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == g.user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit).all()
    )
    return jsonify({"messages": [m.to_dict() for m in reversed(rows)]})


@bp.delete("/history")
@auth_required
def clear_history():
    db = get_db()
    deleted = db.query(ChatMessage).filter(ChatMessage.user_id == g.user.id).delete()
    db.commit()
    return jsonify({"deleted": deleted})


@bp.get("/suggestions")
@auth_required
def suggestions():
    db = get_db()
    state = financial_engine.build_state(db, g.user)
    return jsonify({
        "suggestions": chat_service.suggestions(state),
        "engine": llm_service.model_status(),
    })
