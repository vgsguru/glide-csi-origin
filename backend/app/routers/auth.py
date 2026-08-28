from flask import Blueprint, g, jsonify, request

from app.core.db import get_db
from app.core.security import auth_required, create_token, hash_password, verify_password
from app.models.finance import DEFAULT_PRIORITIES, User

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.post("/signup")
def signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip() or email.split("@")[0]

    if not email or "@" not in email:
        return jsonify({"error": "invalid_email", "detail": "Enter a valid email address."}), 400
    if len(password) < 6:
        return jsonify({"error": "weak_password", "detail": "Password must be at least 6 characters."}), 400

    db = get_db()
    if db.query(User).filter(User.email == email).first():
        return jsonify({"error": "email_taken", "detail": "An account with this email already exists."}), 409

    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
        priorities=list(DEFAULT_PRIORITIES),
        risk_tolerance=50,
        buffer_floor=10000.0,
        income_type="variable",
        onboarded=False,
    )
    db.add(user)
    db.commit()

    return jsonify({"token": create_token(user.id), "user": user.to_dict(), "is_new": True}), 201


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    db = get_db()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(password, user.password_hash):
        return jsonify({"error": "invalid_credentials", "detail": "Invalid email or password."}), 401

    return jsonify({
        "token": create_token(user.id),
        "user": user.to_dict(),
        "is_new": not bool(user.onboarded),
    })


@bp.get("/me")
@auth_required
def me():
    return jsonify({"user": g.user.to_dict()})
