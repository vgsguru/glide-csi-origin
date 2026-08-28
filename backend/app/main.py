import os

from flask import Flask, g, jsonify, request
from flask_cors import CORS

from app.core.db import Base, engine, get_db, remove_session
from app.core.security import auth_required
from app.models import finance  # noqa: F401  -- registers the mappers
from app.routers import agent, auth, chat, dashboard, profile, sms, transactions
from app.services import llm_service


def create_app():
    app = Flask(__name__)

    Base.metadata.create_all(bind=engine)

    # The Android client connects over the LAN, so the origin is not fixed.
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

    for blueprint in (
        auth.bp, profile.bp, sms.bp, transactions.bp,
        dashboard.bp, agent.bp, chat.bp,
    ):
        app.register_blueprint(blueprint)

    @app.teardown_appcontext
    def cleanup(exception=None):
        if exception is not None:
            try:
                get_db().rollback()
            except Exception:
                pass
        remove_session()

    @app.get("/health")
    def health():
        return jsonify({
            "status": "ok",
            "service": "glide-backend",
            "engine": llm_service.model_status(),
        })

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "not_found", "path": request.path}), 404

    @app.errorhandler(500)
    def server_error(exc):
        return jsonify({"error": "server_error", "detail": str(exc)}), 500

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    # host=0.0.0.0 so the Android device on the same Wi-Fi can reach it.
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
