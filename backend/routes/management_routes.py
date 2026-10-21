from flask import Blueprint, jsonify
from db import query, execute
from auth import login_required, current_role, current_user_id, get_json
import re

management_bp = Blueprint(
    "management",
    __name__,
    url_prefix="/api/management"
)


def fail(message, status=400):
    return jsonify({"error": message}), status


def valid_id(value):
    try:
        result = int(value)
        return result if result > 0 else None
    except (TypeError, ValueError):
        return None


def clean(value):
    return value.strip() if isinstance(value, str) else ""


def get_student(student_id):
    return query("""
        SELECT s.id, s.user_id, s.roll_number, s.full_name,
               s.course, s.branch, s.semester, s.phone,
               u.username, u.email
        FROM students s
        LEFT JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
    """, (student_id,), one=True)


def get_teacher(teacher_id):
    return query("""
        SELECT t.id, t.user_id, t.full_name, t.department,
               t.employee_id, t.phone, u.username, u.email
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        WHERE t.id = ?
    """, (teacher_id,), one=True)


@management_bp.route("/students", methods=["GET"])
@login_required
def list_students():
    if current_role() not in ("admin", "teacher"):
        return fail("Access denied.", 403)

    rows = query("""
        SELECT s.id, s.roll_number, s.full_name, s.course,
               s.branch, s.semester, s.phone,
               u.username, u.email
        FROM students s
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.full_name
    """)
    return jsonify({"students": rows})


@management_bp.route("/teachers", methods=["GET"])
@login_required
def list_teachers():
    if current_role() != "admin":
        return fail("Only admins can view teacher management.", 403)

    rows = query("""
        SELECT t.id, t.full_name, t.department, t.employee_id,
               t.phone, u.username, u.email
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        ORDER BY t.full_name
    """)
    return jsonify({"teachers": rows})


@management_bp.route("/students/<int:student_id>", methods=["PUT"])
@login_required
def update_student(student_id):
    # Only admins can edit student profiles.
    if current_role() != "admin":
        return fail("Only admins can edit student profiles.", 403)

    data = get_json()
    student = get_student(student_id)

    if not student:
        return fail("Student not found.", 404)

    full_name = clean(data.get("full_name"))
    roll_number = clean(data.get("roll_number")).upper()
    course = clean(data.get("course"))
    branch = clean(data.get("branch")).upper()
    phone = clean(data.get("phone"))
    semester = data.get("semester")

    if not all([full_name, roll_number, course, branch]):
        return fail("Name, roll number, course and branch are required.")

    try:
        semester = int(semester)
    except (TypeError, ValueError):
        return fail("Semester must be a number.")

    if not 1 <= semester <= 12:
        return fail("Semester must be between 1 and 12.")

    username = clean(data.get("username"))
    email = clean(data.get("email")).lower()

    if not username or len(username) < 3:
        return fail("Username must be at least 3 characters.")

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return fail("Enter a valid email address.")

    duplicate = query("""
        SELECT id FROM users
        WHERE (username = ? OR email = ?) AND id <> ?
    """, (username, email, student["user_id"]), one=True)

    if duplicate:
        return fail("Username or email is already in use.", 409)

    try:
        execute("""
            UPDATE students
            SET full_name = ?, roll_number = ?, course = ?,
                branch = ?, semester = ?, phone = ?
            WHERE id = ?
        """, (
            full_name, roll_number, course, branch,
            semester, phone or None, student_id
        ))

        execute("""
            UPDATE users SET username = ?, email = ?
            WHERE id = ? AND role = 'student'
        """, (username, email, student["user_id"]))

    except Exception:
        return fail(
            "Update failed. Check whether the roll number is already in use.",
            409
        )

    return jsonify({"message": "Student profile updated successfully."})


@management_bp.route("/teachers/<int:teacher_id>", methods=["PUT"])
@login_required
def update_teacher(teacher_id):
    if current_role() != "admin":
        return fail("Only admins can edit teacher profiles.", 403)

    teacher = get_teacher(teacher_id)

    if not teacher:
        return fail("Teacher not found.", 404)

    data = get_json()
    full_name = clean(data.get("full_name"))
    department = clean(data.get("department"))
    employee_id = clean(data.get("employee_id"))
    phone = clean(data.get("phone"))
    username = clean(data.get("username"))
    email = clean(data.get("email")).lower()

    if not all([full_name, department, employee_id, username]):
        return fail(
            "Name, department, employee ID and username are required."
        )

    if len(username) < 3:
        return fail("Username must be at least 3 characters.")

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return fail("Enter a valid email address.")

    duplicate = query("""
        SELECT id FROM users
        WHERE (username = ? OR email = ?) AND id <> ?
    """, (username, email, teacher["user_id"]), one=True)

    if duplicate:
        return fail("Username or email is already in use.", 409)

    duplicate_employee = query("""
        SELECT id FROM teachers
        WHERE employee_id = ? AND id <> ?
    """, (employee_id, teacher_id), one=True)

    if duplicate_employee:
        return fail("Employee ID is already in use.", 409)

    try:
        execute("""
            UPDATE teachers
            SET full_name = ?, department = ?, employee_id = ?, phone = ?
            WHERE id = ?
        """, (
            full_name, department, employee_id,
            phone or None, teacher_id
        ))

        execute("""
            UPDATE users SET username = ?, email = ?
            WHERE id = ? AND role = 'teacher'
        """, (username, email, teacher["user_id"]))

    except Exception:
        return fail("Teacher update failed. Check duplicate details.", 409)

    return jsonify({"message": "Teacher profile updated successfully."})


@management_bp.route(
    "/accounts/<role>/<int:user_id>",
    methods=["DELETE"]
)
@login_required
def delete_account(role, user_id):
    # Only admins can delete student or teacher accounts.
    if current_role() != "admin":
        return fail("Only admins can delete accounts.", 403)

    if role not in ("student", "teacher"):
        return fail("Only student or teacher accounts can be deleted.")

    if user_id == current_user_id():
        return fail("You cannot delete your own logged-in account.")

    user = query("""
        SELECT id, role FROM users WHERE id = ?
    """, (user_id,), one=True)

    if not user or user["role"] != role:
        return fail("Account not found.", 404)

    profile = (
        query(
            "SELECT id FROM students WHERE user_id = ?",
            (user_id,),
            one=True
        )
        if role == "student"
        else query(
            "SELECT id FROM teachers WHERE user_id = ?",
            (user_id,),
            one=True
        )
    )

    if not profile:
        return fail("Profile not found. No account was deleted.", 404)

    try:
        execute(
            "DELETE FROM users WHERE id = ? AND role = ?",
            (user_id, role)
        )
    except Exception:
        return fail(
            "Delete failed because related records or database constraints "
            "prevented deletion. No success is being reported.",
            409
        )

    return jsonify({"message": "Account deleted successfully."})
    
