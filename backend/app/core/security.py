"""Auth primitives — zero extra dependencies.

Password hashing uses werkzeug (already a Flask dependency); tokens are signed
with itsdangerous (also already present), which gives us JWT-equivalent
tamper-proof, expiring bearer tokens without adding PyJWT.
"""
import functools
import os

from flask import g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

SECRET_KEY = os.environ.get("GLIDE_SECRET_KEY", "glide-dev-secret-change-in-production")
TOKEN_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

_serializer = URLSafeTimedSerializer(SECRET_KEY, salt="glide-auth")


def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return check_password_hash(hashed, raw)
    except Exception:
        return False


def create_token(user_id: int) -> str:
    return _serializer.dumps({"uid": user_id})


def decode_token(token: str):
    try:
        data = _serializer.loads(token, max_age=TOKEN_MAX_AGE)
        return data.get("uid")
    except (BadSignature, SignatureExpired, Exception):
        return None


def current_user_id():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return decode_token(header[7:])
    token = request.args.get("token")
    return decode_token(token) if token else None


def auth_required(fn):
    """Attaches the authenticated User to flask.g.user, or 401s."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        from app.core.db import get_db
        from app.models.finance import User

        uid = current_user_id()
        if uid is None:
            return jsonify({"error": "unauthorized", "detail": "Missing or invalid token"}), 401
        user = get_db().get(User, uid)
        if user is None:
            return jsonify({"error": "unauthorized", "detail": "User no longer exists"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper
