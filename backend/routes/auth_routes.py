"""
auth_routes.py
--------------
Authentication endpoints (mounted at /api/auth):

    POST /api/auth/register   -> create a student or teacher account
    POST /api/auth/login      -> start a session
    POST /api/auth/logout     -> end the session
    GET  /api/auth/me         -> who am I? (used by the frontend on load)
"""

from flask import Blueprint, jsonify

from auth import (
    get_json, login_user, logout_user, verify_password,
    is_valid_email, is_valid_password, login_required, current_user_id,
)
from models import user as user_model
from models import student as student_model
from models import teacher as teacher_model

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = get_json()

    role = (data.get("role") or "").strip().lower()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    # ---- validation -------------------------------------------------
    if role not in ("student", "teacher"):
        return jsonify({"error": "Role must be 'student' or 'teacher'."}), 400
    if not username or len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if not is_valid_email(email):
        return jsonify({"error": "Please provide a valid email address."}), 400
    if not is_valid_password(password):
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    if user_model.get_user_by_username(username):
        return jsonify({"error": "That username is already taken."}), 409
    if user_model.get_user_by_email(email):
        return jsonify({"error": "That email is already registered."}), 409

    # ---- create the login record -----------------------------------
    user_id = user_model.create_user(username, email, password, role)

    # ---- create the matching profile -------------------------------
    try:
        if role == "student":
            roll = (data.get("roll_number") or "").strip().upper()
            full_name = (data.get("full_name") or "").strip()
            course = (data.get("course") or "").strip()
            branch = (data.get("branch") or "").strip().upper()
            semester = int(data.get("semester") or 1)
            if not roll or not full_name or not course or not branch:
                raise ValueError("Roll number, name, course and branch are required.")

            existing_student = student_model.get_student_by_roll(roll)
            if existing_student:
                if existing_student.get("user_id"):
                    raise ValueError(f"Roll number '{roll}' is already registered with an active account.")
                # Link newly created user account to the existing placeholder profile created by teacher!
                # All past attendance records and approved enrollments are instantly available!
                student_model.link_student_user(
                    student_id=existing_student["id"],
                    user_id=user_id,
                    full_name=full_name,
                    course=course,
                    branch=branch,
                    semester=semester,
                    phone=(data.get("phone") or "").strip()
                )
            else:
                student_model.create_student_profile(
                    user_id, roll, full_name, course, branch, semester,
                    (data.get("phone") or "").strip(),
                )
        else:
            full_name = (data.get("full_name") or "").strip()
            department = (data.get("department") or "").strip()
            employee_id = (data.get("employee_id") or "").strip()
            if not full_name or not department or not employee_id:
                raise ValueError("Name, department and employee id are required.")
            teacher_model.create_teacher_profile(
                user_id, full_name, department, employee_id,
                (data.get("phone") or "").strip(),
            )
    except ValueError as err:
        # roll back the user row if the profile is invalid
        from db import execute
        execute("DELETE FROM users WHERE id = ?", (user_id,))
        return jsonify({"error": str(err)}), 400

    return jsonify({"message": "Registration successful. You can now log in.",
                    "role": role}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = user_model.get_user_by_username(username)
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid username or password."}), 401

    redirect_url = "/student/dashboard.html"
    if user["role"] == "admin":
        redirect_url = "/admin/dashboard.html"
    elif user["role"] == "teacher":
        redirect_url = "/teacher/dashboard.html"

    login_user(user)
    return jsonify({
        "message": "Login successful.",
        "role": user["role"],
        "username": user["username"],
        "profile_pic": user.get("profile_pic"),
        "redirect": redirect_url,
    })


@auth_bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return jsonify({"message": "Logged out."})


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    user = user_model.get_user_by_id(current_user_id())
    if not user:
        logout_user()
        return jsonify({"error": "Session invalid."}), 401
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "email": user.get("email"),
        "profile_pic": user.get("profile_pic"),
    })

