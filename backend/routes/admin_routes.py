"""
admin_routes.py
---------------
Admin-only endpoints mounted at /api/admin.

Provides system-wide management for:
- Viewing and approving/rejecting all student enrollment requests
- Viewing all teachers, students, subjects, and stats
- Cross-branch oversight
"""

from flask import Blueprint, jsonify, request

from auth import admin_required, current_user_id
from models import enrollment as enrollment_model
from models import subject as subject_model
from models import user as user_model
from db import query

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.route("/registrations", methods=["GET"])
@admin_required
def pending_registrations():
    return jsonify({
        "success": True,
        "registrations": user_model.get_pending_users(),
    })


@admin_bp.route("/registrations/<int:user_id>/approve", methods=["POST"])
@admin_required
def approve_registration(user_id):
    user = user_model.get_user_by_id(user_id)
    if not user or user.get("account_status") != "pending":
        return jsonify({"error": "Pending registration not found."}), 404
    user_model.update_account_status(user_id, "approved")
    return jsonify({"success": True, "message": "Account approved."})


@admin_bp.route("/registrations/<int:user_id>/reject", methods=["POST"])
@admin_required
def reject_registration(user_id):
    user = user_model.get_user_by_id(user_id)
    if not user or user.get("account_status") != "pending":
        return jsonify({"error": "Pending registration not found."}), 404
    user_model.update_account_status(user_id, "rejected")
    return jsonify({"success": True, "message": "Account rejected."})


# ============================================================
# ALL ATTENDANCE RECORDS (ADMIN)
# ============================================================

@admin_bp.route("/attendance", methods=["GET"])
@admin_required
def all_attendance():
    records = query(
        """
        SELECT a.id, a.date, a.status,
               st.roll_number, st.full_name AS student_name,
               s.id AS subject_id, s.subject_code, s.subject_name,
               s.course, s.branch, s.semester,
               t.id AS teacher_id, t.full_name AS teacher_name
        FROM attendance a
        JOIN students st ON st.id = a.student_id
        JOIN subjects s ON s.id = a.subject_id
        JOIN teachers t ON t.id = a.teacher_id
        ORDER BY a.date DESC, s.subject_code, st.roll_number
        """
    )
    return jsonify({"success": True, "records": records})

# ============================================================
# ADMIN STATS
# ============================================================

@admin_bp.route("/stats", methods=["GET"])
@admin_required
def admin_stats():
    teacher_count = query("SELECT COUNT(*) AS total FROM teachers", one=True)["total"]
    student_count = query("SELECT COUNT(*) AS total FROM students", one=True)["total"]
    subject_count = query("SELECT COUNT(*) AS total FROM subjects", one=True)["total"]
    total_enrollments = query("SELECT COUNT(*) AS total FROM enrollments", one=True)["total"]
    pending_approvals = query("SELECT COUNT(*) AS total FROM enrollments WHERE status = 'pending'", one=True)["total"]
    pending_registrations = query("SELECT COUNT(*) AS total FROM users WHERE account_status = 'pending'", one=True)["total"]
    total_attendance = query("SELECT COUNT(*) AS total FROM attendance", one=True)["total"]

    return jsonify({
        "success": True,
        "teachers_count": teacher_count,
        "students_count": student_count,
        "subjects_count": subject_count,
        "total_enrollments": total_enrollments,
        "pending_approvals": pending_approvals,
        "pending_registrations": pending_registrations,
        "total_attendance": total_attendance,
    })


# ============================================================
# ALL ENROLLMENT REQUESTS
# ============================================================

@admin_bp.route("/enrollments", methods=["GET"])
@admin_required
def all_enrollments():
    records = enrollment_model.get_all_enrollments_for_admin()
    return jsonify({
        "success": True,
        "enrollments": records,
    })


# ============================================================
# ADMIN APPROVE ENROLLMENT
# ============================================================

@admin_bp.route("/enrollments/<int:enrollment_id>/approve", methods=["POST"])
@admin_required
def admin_approve(enrollment_id):
    enrollment = enrollment_model.get_enrollment_by_id(enrollment_id)
    if not enrollment:
        return jsonify({"error": "Enrollment request not found."}), 404

    enrollment_model.update_enrollment_status(
        enrollment_id=enrollment_id,
        status="approved",
        reviewed_by=current_user_id()
    )

    return jsonify({
        "success": True,
        "message": f"Admin approved enrollment for {enrollment['student_name']} in {enrollment['subject_name']}."
    })


# ============================================================
# ADMIN REJECT ENROLLMENT
# ============================================================

@admin_bp.route("/enrollments/<int:enrollment_id>/reject", methods=["POST"])
@admin_required
def admin_reject(enrollment_id):
    enrollment = enrollment_model.get_enrollment_by_id(enrollment_id)
    if not enrollment:
        return jsonify({"error": "Enrollment request not found."}), 404

    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Rejected by administrator.")

    enrollment_model.update_enrollment_status(
        enrollment_id=enrollment_id,
        status="rejected",
        reviewed_by=current_user_id(),
        rejection_reason=reason
    )

    return jsonify({
        "success": True,
        "message": f"Admin rejected enrollment for {enrollment['student_name']} in {enrollment['subject_name']}."
    })


# ============================================================
# ALL STUDENTS
# ============================================================

@admin_bp.route("/students", methods=["GET"])
@admin_required
def all_students():
    students = query(
        """
        SELECT s.*, u.username, u.email, u.profile_pic,
               COUNT(e.id) AS total_enrolled
        FROM students s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'approved'
        GROUP BY s.id, u.username, u.email, u.profile_pic
        ORDER BY s.roll_number
        """
    )
    return jsonify({"success": True, "students": students})


# ============================================================
# ALL TEACHERS
# ============================================================

@admin_bp.route("/teachers", methods=["GET"])
@admin_required
def all_teachers():
    teachers = query(
        """
        SELECT t.*, u.username, u.email, u.profile_pic,
               COUNT(ts.id) AS total_subjects
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.id
        GROUP BY t.id, u.username, u.email, u.profile_pic
        ORDER BY t.full_name
        """
    )
    return jsonify({"success": True, "teachers": teachers})


# ============================================================
# ALL SUBJECTS
# ============================================================

@admin_bp.route("/subjects", methods=["GET"])
@admin_required
def all_subjects():
    subjects = subject_model.list_all_subjects()
    results = []
    for s in subjects:
        teachers = subject_model.get_subject_teachers(s["id"])
        enrolled_count = query(
            "SELECT COUNT(*) AS total FROM enrollments WHERE subject_id = ? AND status = 'approved'",
            (s["id"],),
            one=True,
        )["total"]
        results.append({
            **s,
            "teachers": teachers,
            "teacher_names": ", ".join([t["full_name"] for t in teachers]) if teachers else "Unassigned",
            "enrolled_students": enrolled_count,
        })
    return jsonify({"success": True, "subjects": results})


# ============================================================
# CREATE NEW SUBJECT (ADMIN)
# ============================================================

@admin_bp.route("/subjects", methods=["POST"])
@admin_required
def admin_create_subject():
    data = request.get_json(silent=True) or {}
    subject_code = (data.get("subject_code") or "").strip().upper()
    subject_name = (data.get("subject_name") or "").strip()
    course = (data.get("course") or "").strip()
    branch = (data.get("branch") or "").strip().upper()
    semester = int(data.get("semester") or 1)
    teacher_id = data.get("teacher_id")

    if not subject_code or not subject_name or not course or not branch:
        return jsonify({"error": "Subject code, name, course, and branch are required."}), 400

    if subject_model.get_subject_by_code(subject_code):
        return jsonify({"error": f"Subject code '{subject_code}' already exists."}), 409

    subject_id = subject_model.create_subject(
        subject_code=subject_code,
        subject_name=subject_name,
        course=course,
        branch=branch,
        semester=semester
    )

    if teacher_id:
        try:
            subject_model.assign_subject_to_teacher(int(teacher_id), subject_id)
        except Exception:
            pass

    return jsonify({
        "success": True,
        "message": f"Subject {subject_code} ({subject_name}) created successfully.",
        "subject_id": subject_id
    }), 201


# ============================================================
# DELETE SUBJECT (ADMIN)
# ============================================================

@admin_bp.route("/subjects/<int:subject_id>", methods=["DELETE", "POST"])
@admin_required
def admin_delete_subject(subject_id):
    sub = subject_model.get_subject_by_id(subject_id)
    if not sub:
        return jsonify({"error": "Subject not found."}), 404

    subject_model.delete_subject(subject_id)
    return jsonify({
        "success": True,
        "message": f"Subject '{sub['subject_code']} - {sub['subject_name']}' deleted successfully."
    }), 200


# ============================================================
# ASSIGN TEACHER TO SUBJECT (ADMIN)
# ============================================================

@admin_bp.route("/subjects/<int:subject_id>/assign-teacher", methods=["POST"])
@admin_required
def admin_assign_teacher(subject_id):
    data = request.get_json(silent=True) or {}
    teacher_id = data.get("teacher_id")
    if not teacher_id:
        return jsonify({"error": "teacher_id is required."}), 400

    subject_model.assign_subject_to_teacher(int(teacher_id), subject_id)
    return jsonify({
        "success": True,
        "message": "Faculty assigned to subject."
    }), 200


# ============================================================
# UNASSIGN TEACHER FROM SUBJECT (ADMIN)
# ============================================================

@admin_bp.route("/subjects/<int:subject_id>/unassign-teacher", methods=["POST"])
@admin_required
def admin_unassign_teacher(subject_id):
    data = request.get_json(silent=True) or {}
    teacher_id = data.get("teacher_id")
    if not teacher_id:
        return jsonify({"error": "teacher_id is required."}), 400

    subject_model.unassign_subject(int(teacher_id), subject_id)
    return jsonify({
        "success": True,
        "message": "Faculty unassigned from subject."
    }), 200


# ============================================================
# CREATE NEW STUDENT (ADMIN)
# ============================================================

@admin_bp.route("/students", methods=["POST"])
@admin_required
def admin_create_student():
    from models import user as user_model
    from models import student as student_model

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()
    roll_number = (data.get("roll_number") or "").strip().upper()
    course = (data.get("course") or "").strip()
    branch = (data.get("branch") or "").strip().upper()
    semester = int(data.get("semester") or 1)
    phone = (data.get("phone") or "").strip()

    if not username or not email or not password or not full_name or not roll_number or not branch:
        return jsonify({"error": "Full name, roll number, branch, username, email, and password are required."}), 400

    if user_model.get_user_by_username(username):
        return jsonify({"error": f"Username '{username}' is already in use."}), 409
    if user_model.get_user_by_email(email):
        return jsonify({"error": f"Email '{email}' is already registered."}), 409
    if student_model.get_student_by_roll(roll_number):
        return jsonify({"error": f"Roll number '{roll_number}' is already registered."}), 409

    user_id = user_model.create_user(username, email, password, role="student")
    student_id = student_model.create_student_profile(
        user_id=user_id,
        roll_number=roll_number,
        full_name=full_name,
        course=course or "B.Tech",
        branch=branch,
        semester=semester,
        phone=phone
    )

    return jsonify({
        "success": True,
        "message": f"Student '{full_name}' ({roll_number}) created successfully.",
        "student_id": student_id,
        "user_id": user_id
    }), 201


# ============================================================
# DELETE STUDENT (ADMIN)
# ============================================================

@admin_bp.route("/students/<int:student_id>", methods=["DELETE", "POST"])
@admin_required
def admin_delete_student(student_id):
    from models import student as student_model
    st = student_model.get_student_by_id(student_id)
    if not st:
        return jsonify({"error": "Student not found."}), 404

    student_model.delete_student(student_id)
    return jsonify({
        "success": True,
        "message": f"Student '{st['full_name']}' ({st['roll_number']}) and user account deleted."
    }), 200


# ============================================================
# CREATE NEW TEACHER (ADMIN)
# ============================================================

@admin_bp.route("/teachers", methods=["POST"])
@admin_required
def admin_create_teacher():
    from models import user as user_model
    from models import teacher as teacher_model

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()
    department = (data.get("department") or "").strip()
    employee_id = (data.get("employee_id") or "").strip().upper()
    phone = (data.get("phone") or "").strip()

    if not username or not email or not password or not full_name or not department or not employee_id:
        return jsonify({"error": "Full name, employee ID, department, username, email, and password are required."}), 400

    if user_model.get_user_by_username(username):
        return jsonify({"error": f"Username '{username}' is already in use."}), 409
    if user_model.get_user_by_email(email):
        return jsonify({"error": f"Email '{email}' is already registered."}), 409

    user_id = user_model.create_user(username, email, password, role="teacher")
    teacher_id = teacher_model.create_teacher_profile(
        user_id=user_id,
        full_name=full_name,
        department=department,
        employee_id=employee_id,
        phone=phone
    )

    return jsonify({
        "success": True,
        "message": f"Faculty member '{full_name}' ({employee_id}) created successfully.",
        "teacher_id": teacher_id,
        "user_id": user_id
    }), 201


# ============================================================
# DELETE TEACHER (ADMIN)
# ============================================================

@admin_bp.route("/teachers/<int:teacher_id>", methods=["DELETE", "POST"])
@admin_required
def admin_delete_teacher(teacher_id):
    from models import teacher as teacher_model
    t = teacher_model.get_teacher_by_id(teacher_id)
    if not t:
        return jsonify({"error": "Teacher not found."}), 404

    teacher_model.delete_teacher(teacher_id)
    return jsonify({
        "success": True,
        "message": f"Teacher '{t['full_name']}' ({t['employee_id']}) and user account deleted."
    }), 200


# ============================================================
# DIRECT ENROLL STUDENT (ADMIN OVERRIDE / DIRECT ADD)
# ============================================================

@admin_bp.route("/enroll-student", methods=["POST"])
@admin_required
def admin_direct_enroll():
    from models import student as student_model

    data = request.get_json(silent=True) or {}
    roll_number = (data.get("roll_number") or "").strip().upper()
    full_name = (data.get("full_name") or "").strip()
    subject_id = data.get("subject_id")

    if not roll_number or not subject_id:
        return jsonify({"error": "Both roll_number and subject_id are required."}), 400

    subject = subject_model.get_subject_by_id(int(subject_id))
    if not subject:
        return jsonify({"error": "Subject not found."}), 404

    student = student_model.get_student_by_roll(roll_number)
    is_unregistered = False

    if not student:
        if not full_name:
            full_name = f"Student {roll_number}"
        student = student_model.create_or_get_unregistered_student(
            roll_number=roll_number,
            full_name=full_name,
            course=subject.get("course", "B.Tech"),
            branch=subject.get("branch", "CSE"),
            semester=subject.get("semester", 1),
        )
        is_unregistered = True

    # Branch check warning or enforcement
    student_branch = (student.get("branch") or "").strip().upper()
    subject_branch = (subject.get("branch") or "").strip().upper()
    if student_branch and subject_branch and student_branch != subject_branch:
        return jsonify({
            "error": f"Branch mismatch: Student {student['full_name']} belongs to '{student_branch}', but subject is '{subject_branch}'."
        }), 403

    enrollment_id = enrollment_model.direct_enroll_student(
        student_id=student["id"],
        subject_id=subject["id"],
        reviewed_by=current_user_id()
    )

    sync_note = " (Student has not registered yet. When they register with this roll number, all their attendance will automatically sync to their dashboard!)" if is_unregistered or not student.get("user_id") else ""

    return jsonify({
        "success": True,
        "message": f"Student '{student['full_name']}' ({student['roll_number']}) successfully enrolled in {subject['subject_code']}!{sync_note}",
        "enrollment_id": enrollment_id,
        "is_unregistered": is_unregistered or not student.get("user_id"),
    }), 200


# ============================================================
# DELETE / REMOVE ENROLLMENT (ADMIN)
# ============================================================

@admin_bp.route("/enrollments/<int:enrollment_id>", methods=["DELETE", "POST"])
@admin_required
def admin_delete_enrollment(enrollment_id):
    from db import execute
    execute("DELETE FROM enrollments WHERE id = ?", (enrollment_id,))
    return jsonify({
        "success": True,
        "message": "Enrollment record deleted."
    }), 200
