"""
auth.py
-------
Authentication & authorisation helpers.

Responsibilities
    * hash / verify passwords (never store plain text)
    * create and destroy the login session
    * decorators that protect API routes by role
    * small input-validation helpers used across the routes
"""

import re
from functools import wraps
from flask import session, jsonify, request
from werkzeug.security import generate_password_hash, check_password_hash


# ------------------------------------------------------------------
# Passwords
# ------------------------------------------------------------------
def hash_password(plain_password):
    """Return a secure PBKDF2 hash of the given password."""
    return generate_password_hash(plain_password)


def verify_password(plain_password, password_hash):
    """Check a plain password against the stored hash."""
    return check_password_hash(password_hash, plain_password)


# ------------------------------------------------------------------
# Session helpers
# ------------------------------------------------------------------
def login_user(user):
    """Store the essential user info in the signed session cookie."""
    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["role"] = user["role"]


def logout_user():
    session.clear()


def current_user_id():
    return session.get("user_id")


def current_role():
    return session.get("role")


# ------------------------------------------------------------------
# Route protection decorators
# ------------------------------------------------------------------
def login_required(f):
    """Allow access only to logged-in users."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_user_id():
            return jsonify({"error": "Authentication required. Please log in."}), 401
        return f(*args, **kwargs)
    return wrapper


def role_required(*roles):
    """Allow access only to specific role(s). Admin has access to teacher/staff endpoints as well."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not current_user_id():
                return jsonify({"error": "Authentication required. Please log in."}), 401
            u_role = current_role()
            if u_role not in roles and u_role != "admin":
                return jsonify({"error": f"Access denied. Allowed: {', '.join(roles)}."}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator


def admin_required(f):
    """Allow access only to admin users."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_user_id():
            return jsonify({"error": "Authentication required. Please log in."}), 401
        if current_role() != "admin":
            return jsonify({"error": "Access denied. Admin only."}), 403
        return f(*args, **kwargs)
    return wrapper


# ------------------------------------------------------------------
# Validation helpers
# ------------------------------------------------------------------
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(email):
    return bool(email) and bool(EMAIL_RE.match(email))


def is_valid_password(password):
    """Minimum 6 characters – simple rule that is easy for beginners."""
    return bool(password) and len(password) >= 6


def get_json():
    """Safely read the JSON body of a request (returns {} if none)."""
    return request.get_json(silent=True) or {}
