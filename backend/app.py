```python
"""
app.py
------
SmartCampus Flask application.

Responsibilities:
- Create Flask application
- Configure sessions
- Register API routes
- Initialize PostgreSQL / Supabase database
- Serve frontend
- Provide health-check endpoint
"""

import os
import sys

from flask import Flask, jsonify, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix


# ============================================================
# BACKEND DIRECTORY
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


# ============================================================
# PROJECT IMPORTS
# ============================================================

from config import (
    FRONTEND_DIR,
    SECRET_KEY,
    SESSION_LIFETIME,
    SMARTCAMPUS_ENV,
    DEBUG,
    DATABASE_URL,
)

from db import init_db, close_db


# ============================================================
# ROUTE IMPORTS
# ============================================================

from routes.auth_routes import auth_bp
from routes.student_routes import student_bp
from routes.teacher_routes import teacher_bp
from routes.attendance_routes import attendance_bp
from routes.profile_routes import profile_bp
from routes.admin_routes import admin_bp
from routes.management_routes import management_bp


# ============================================================
# CREATE FLASK APPLICATION
# ============================================================

def create_app():

    app = Flask(
        __name__,
        static_folder=None,
    )

    # --------------------------------------------------------
    # Basic configuration
    # --------------------------------------------------------

    app.config["SECRET_KEY"] = SECRET_KEY

    app.config["PERMANENT_SESSION_LIFETIME"] = SESSION_LIFETIME

    app.config["JSON_SORT_KEYS"] = False

    # --------------------------------------------------------
    # Session security
    # --------------------------------------------------------

    is_production = SMARTCAMPUS_ENV == "production"

    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = is_production

    # --------------------------------------------------------
    # Reverse proxy support
    # --------------------------------------------------------

    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
        x_prefix=1,
    )

    # --------------------------------------------------------
    # Database cleanup
    # --------------------------------------------------------

    app.teardown_appcontext(close_db)

    # ========================================================
    # API BLUEPRINTS
    # ========================================================

    # Authentication
    app.register_blueprint(
        auth_bp,
        url_prefix="/api/auth",
    )

    # Student routes
    app.register_blueprint(
        student_bp,
        url_prefix="/api/students",
    )

    # Teacher routes
    app.register_blueprint(
        teacher_bp,
        url_prefix="/api/teachers",
    )

    # Attendance routes
    app.register_blueprint(
        attendance_bp,
        url_prefix="/api/attendance",
    )

    # Profile routes
    app.register_blueprint(
        profile_bp,
        url_prefix="/api/profile",
    )

    # Admin routes
    app.register_blueprint(
        admin_bp,
        url_prefix="/api/admin",
    )

    # Management routes
    app.register_blueprint(
        management_bp,
        url_prefix="/api/management",
    )

    # ========================================================
    # HEALTH CHECK
    # ========================================================

    @app.get("/health")
    def health():
        return jsonify({
            "status": "ok",
            "application": "SmartCampus",
            "environment": SMARTCAMPUS_ENV,
        }), 200

    # ========================================================
    # HOME PAGE
    # ========================================================

    @app.get("/")
    def home():
        return send_from_directory(
            FRONTEND_DIR,
            "index.html",
        )

    # ========================================================
    # FRONTEND FILES
    # ========================================================

    @app.get("/<path:filename>")
    def frontend_files(filename):

        frontend_root = os.path.abspath(FRONTEND_DIR)

        requested_path = os.path.abspath(
            os.path.join(FRONTEND_DIR, filename)
        )

        # Prevent access outside the frontend directory
        if not (
            requested_path.startswith(frontend_root + os.sep)
            or requested_path == frontend_root
        ):
            return jsonify({
                "error": "File not found"
            }), 404

        if not os.path.isfile(requested_path):
            return jsonify({
                "error": "Page not found"
            }), 404

        return send_from_directory(
            FRONTEND_DIR,
            filename,
        )

    # ========================================================
    # 404 ERROR
    # ========================================================

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "error": "Resource not found"
        }), 404

    # ========================================================
    # 500 ERROR
    # ========================================================

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({
            "error": "Internal server error"
        }), 500

    return app


# ============================================================
# CREATE APPLICATION INSTANCE
# ============================================================

app = create_app()


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

def initialize_database():
    """
    Initialize the configured database.
    Supports PostgreSQL / Supabase and SQLite,
    depending on backend/db.py configuration.
    """

    try:
        with app.app_context():
            init_db()

        print("\nDatabase initialization successful.\n")
        return True

    except Exception as error:
        print("\nDatabase initialization failed:")
        print(error)
        print()
        return False


# ============================================================
# RUN APPLICATION
# ============================================================

if __name__ == "__main__":

    print()
    print("=" * 60)
    print("              SmartCampus Backend")
    print("=" * 60)
    print()

    # Initialize database
    database_ready = initialize_database()

    if not database_ready:
        print(
            "SmartCampus could not start because "
            "the database is not ready."
        )
        sys.exit(1)

    # Server configuration
    port = int(os.environ.get("PORT", 5000))

    print()
    print("SmartCampus backend running on:")
    print(f"http://127.0.0.1:{port}")
    print()
    print("Health check:")
    print(f"http://127.0.0.1:{port}/health")
    print()
    print(f"Environment: {SMARTCAMPUS_ENV}")
    print(f"Debug: {DEBUG}")
    print()

    # Start Flask server
    app.run(
        host="0.0.0.0",
        port=port,
        debug=DEBUG,
    )
```
