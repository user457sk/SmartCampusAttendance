"""
attendance_routes.py
--------------------
Endpoints for marking and editing attendance (mounted at /api/attendance).

    POST /api/attendance/mark                       -> save/update a whole class
    GET  /api/attendance/subject/<id>/date/<date>   -> existing records for a date

Security:
    * teacher-only
    * the teacher must be assigned to the subject
    * duplicate rows for (student, subject, date) are impossible (UNIQUE key)
"""

from flask import Blueprint, jsonify
from datetime import datetime

from auth import role_required, current_user_id, get_json
from models import teacher as teacher_model
from models import subject as subject_model
from models import attendance as attendance_model

attendance_bp = Blueprint("attendance", __name__, url_prefix="/api/attendance")


@attendance_bp.route("/mark", methods=["POST"])
@role_required("teacher")
def mark():
    teacher = teacher_model.get_teacher_by_user_id(current_user_id())
    data = get_json()

    subject_id = data.get("subject_id")
    date = (data.get("date") or "").strip()
    records = data.get("records") or []

    # ---- validation ------------------------------------------------
    if not subject_id or not date:
        return jsonify({"error": "subject_id and date are required."}), 400
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "Date must be in YYYY-MM-DD format."}), 400
    if not subject_model.teacher_owns_subject(teacher["id"], subject_id):
        return jsonify({"error": "You are not assigned to this subject."}), 403
    if not records:
        return jsonify({"error": "No attendance records supplied."}), 400

    # ---- save each student (insert or update) ----------------------
    saved = 0
    for rec in records:
        student_id = rec.get("student_id")
        status = rec.get("status")
        if not student_id or status not in ("Present", "Absent"):
            continue
        attendance_model.save_attendance(
            student_id, subject_id, teacher["id"], date, status
        )
        saved += 1

    return jsonify({"message": f"Attendance saved for {saved} student(s).", "saved": saved})


@attendance_bp.route("/subject/<int:subject_id>/date/<date>", methods=["GET"])
@role_required("teacher")
def existing_for_date(subject_id, date):
    teacher = teacher_model.get_teacher_by_user_id(current_user_id())
    if not subject_model.teacher_owns_subject(teacher["id"], subject_id):
        return jsonify({"error": "You are not assigned to this subject."}), 403
    return jsonify(attendance_model.get_attendance_for_date(subject_id, date))
