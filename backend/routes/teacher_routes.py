"""
teacher_routes.py
-----------------
Teacher-only endpoints.

All teacher APIs are mounted by app.py at:

    /api/teachers

Available endpoints:

    GET    /api/teachers/profile
    GET    /api/teachers/subjects
    GET    /api/teachers/available-subjects
    POST   /api/teachers/subjects
    POST   /api/teachers/subjects/assign
    DELETE /api/teachers/subjects/<id>
    GET    /api/teachers/subjects/<id>/students
    GET    /api/teachers/subjects/<id>/history
    GET    /api/teachers/subjects/<id>/report
"""

from flask import Blueprint, jsonify

from auth import role_required, current_user_id, get_json
from models import teacher as teacher_model
from models import subject as subject_model
from models import student as student_model
from models import attendance as attendance_model
from models import user as user_model


# IMPORTANT:
# app.py already adds /api/teachers
# Therefore NO url_prefix is added here.
teacher_bp = Blueprint(
    "teacher",
    __name__
)


# ============================================================
# HELPER
# ============================================================

def _get_profile():
    """
    Get the currently logged-in teacher profile with user info.
    """
    teacher = teacher_model.get_teacher_by_user_id(
        current_user_id()
    )
    if teacher:
        from models import user as user_model
        user = user_model.get_user_by_id(current_user_id())
        if user:
            teacher["username"] = user.get("username")
            teacher["email"] = user.get("email")
            teacher["profile_pic"] = user.get("profile_pic")
    return teacher


# ============================================================
# TEACHER PROFILE
# ============================================================

@teacher_bp.route("/profile", methods=["GET"])
@role_required("teacher")
def profile():

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    return jsonify(teacher)


# ============================================================
# MY SUBJECTS
# ============================================================

@teacher_bp.route("/subjects", methods=["GET"])
@role_required("teacher")
def my_subjects():

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    return jsonify(
        subject_model.get_teacher_subjects(
            teacher["id"]
        )
    )


# ============================================================
# AVAILABLE SUBJECTS
# ============================================================

@teacher_bp.route(
    "/available-subjects",
    methods=["GET"]
)
@role_required("teacher")
def available_subjects():

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    mine = {
        s["id"]
        for s in subject_model.get_teacher_subjects(
            teacher["id"]
        )
    }

    available = [
        s
        for s in subject_model.list_all_subjects()
        if s["id"] not in mine
    ]

    return jsonify(available)


# ============================================================
# CREATE + ASSIGN SUBJECT
# ============================================================

@teacher_bp.route(
    "/subjects",
    methods=["POST"]
)
@role_required("teacher")
def create_and_assign_subject():

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    data = get_json()

    code = (
        data.get("subject_code") or ""
    ).strip().upper()

    name = (
        data.get("subject_name") or ""
    ).strip()

    course = (
        data.get("course") or ""
    ).strip()

    branch = (
        data.get("branch") or ""
    ).strip()

    try:
        semester = int(
            data.get("semester") or 1
        )
    except (TypeError, ValueError):
        return jsonify({
            "error": "Semester must be a valid number."
        }), 400

    if not code or not name or not course or not branch:
        return jsonify({
            "error": (
                "Subject code, name, course "
                "and branch are required."
            )
        }), 400

    existing = subject_model.get_subject_by_code(
        code
    )

    if existing:
        subject_id = existing["id"]

    else:
        subject_id = subject_model.create_subject(
            code,
            name,
            course,
            branch,
            semester
        )

    subject_model.assign_subject_to_teacher(
        teacher["id"],
        subject_id
    )

    return jsonify({
        "message": "Subject added.",
        "subject_id": subject_id
    }), 201


# ============================================================
# ASSIGN EXISTING SUBJECT
# ============================================================

@teacher_bp.route(
    "/subjects/assign",
    methods=["POST"]
)
@role_required("teacher")
def assign_subject():

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    data = get_json()

    subject_id = data.get("subject_id")

    if not subject_id:
        return jsonify({
            "error": "subject_id is required."
        }), 400

    if not subject_model.get_subject_by_id(
        subject_id
    ):
        return jsonify({
            "error": "Subject not found."
        }), 404

    subject_model.assign_subject_to_teacher(
        teacher["id"],
        subject_id
    )

    return jsonify({
        "message": "Subject assigned to you."
    })


# ============================================================
# REMOVE SUBJECT
# ============================================================

@teacher_bp.route(
    "/subjects/<int:subject_id>",
    methods=["DELETE"]
)
@role_required("teacher")
def remove_subject(subject_id):

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    if not subject_model.teacher_owns_subject(
        teacher["id"],
        subject_id
    ):
        return jsonify({
            "error": (
                "You can only remove "
                "your own subjects."
            )
        }), 403

    subject_model.unassign_subject(
        teacher["id"],
        subject_id
    )

    return jsonify({
        "message": (
            "Subject removed from your list."
        )
    })


# ============================================================
# STUDENTS OF SUBJECT
# ============================================================

@teacher_bp.route(
    "/subjects/<int:subject_id>/students",
    methods=["GET"]
)
@role_required("teacher")
def subject_students(subject_id):

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    if not subject_model.teacher_owns_subject(
        teacher["id"],
        subject_id
    ):
        return jsonify({
            "error": (
                "You are not assigned "
                "to this subject."
            )
        }), 403

    subject = subject_model.get_subject_by_id(
        subject_id
    )

    if not subject:
        return jsonify({
            "error": "Subject not found."
        }), 404

    students = student_model.list_students_for_subject(
        subject["course"],
        subject["branch"],
        subject["semester"],
        subject_id=subject["id"],
    )

    return jsonify({
        "subject": subject,
        "students": students
    })


# ============================================================
# ATTENDANCE HISTORY
# ============================================================

@teacher_bp.route(
    "/subjects/<int:subject_id>/history",
    methods=["GET"]
)
@role_required("teacher")
def subject_history(subject_id):

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    if not subject_model.teacher_owns_subject(
        teacher["id"],
        subject_id
    ):
        return jsonify({
            "error": (
                "You are not assigned "
                "to this subject."
            )
        }), 403

    return jsonify({
        "records":
            attendance_model.get_history_for_subject(
                subject_id
            ),

        "dates":
            attendance_model.get_distinct_dates_for_subject(
                subject_id
            )
    })


# ============================================================
# SUBJECT REPORT
# ============================================================

@teacher_bp.route(
    "/subjects/<int:subject_id>/report",
    methods=["GET"]
)
@role_required("teacher")
def subject_report(subject_id):

    teacher = _get_profile()

    if not teacher:
        return jsonify({
            "error": "Teacher profile not found."
        }), 404

    if not subject_model.teacher_owns_subject(
        teacher["id"],
        subject_id
    ):
        return jsonify({
            "error": (
                "You are not assigned "
                "to this subject."
            )
        }), 403

    subject = subject_model.get_subject_by_id(
        subject_id
    )

    if not subject:
        return jsonify({
            "error": "Subject not found."
        }), 404

    return jsonify({
        "subject": subject,

        "report":
            attendance_model.get_subject_report(
                subject_id
            )
    })


# ============================================================
# ENROLLMENT REQUESTS (ONLY FOR THIS TEACHER'S SUBJECTS)
# ============================================================

@teacher_bp.route("/student-registrations", methods=["GET"])
@role_required("teacher")
def pending_student_registrations():
    return jsonify({
        "success": True,
        "registrations": user_model.get_pending_users(role="student"),
    })


@teacher_bp.route("/student-registrations/<int:user_id>/approve", methods=["POST"])
@role_required("teacher")
def approve_student_registration(user_id):
    student_user = user_model.get_user_by_id(user_id)
    if (
        not student_user
        or student_user.get("role") != "student"
        or student_user.get("account_status") != "pending"
    ):
        return jsonify({"error": "Pending student registration not found."}), 404
    user_model.update_account_status(user_id, "approved")
    return jsonify({"success": True, "message": "Student account approved."})


@teacher_bp.route("/student-registrations/<int:user_id>/reject", methods=["POST"])
@role_required("teacher")
def reject_student_registration(user_id):
    student_user = user_model.get_user_by_id(user_id)
    if (
        not student_user
        or student_user.get("role") != "student"
        or student_user.get("account_status") != "pending"
    ):
        return jsonify({"error": "Pending student registration not found."}), 404
    user_model.update_account_status(user_id, "rejected")
    return jsonify({"success": True, "message": "Student account rejected."})


@teacher_bp.route("/enrollment-requests", methods=["GET"])
@role_required("teacher")
def get_enrollment_requests():
    teacher = _get_profile()
    if not teacher:
        return jsonify({"error": "Teacher profile not found."}), 404

    from flask import request
    from models import enrollment as enrollment_model

    status_filter = (request.args.get("status") or "pending").strip().lower()

    if status_filter == "all":
        records = enrollment_model.get_all_enrollments_for_teacher(teacher["id"])
    else:
        records = enrollment_model.get_pending_enrollments_for_teacher(teacher["id"])

    return jsonify({
        "success": True,
        "teacher_id": teacher["id"],
        "requests": records,
    })


# ============================================================
# APPROVE ENROLLMENT REQUEST
# ============================================================

@teacher_bp.route("/enrollment-requests/<int:enrollment_id>/approve", methods=["POST"])
@role_required("teacher")
def approve_enrollment(enrollment_id):
    teacher = _get_profile()
    if not teacher:
        return jsonify({"error": "Teacher profile not found."}), 404

    from models import enrollment as enrollment_model

    enrollment = enrollment_model.get_enrollment_by_id(enrollment_id)
    if not enrollment:
        return jsonify({"error": "Enrollment request not found."}), 404

    # Strict check: Approval must be by the teacher who teaches this subject!
    if not subject_model.teacher_owns_subject(teacher["id"], enrollment["subject_id"]):
        return jsonify({
            "error": "Access denied. You can only approve enrollments for subjects you teach."
        }), 403

    enrollment_model.update_enrollment_status(
        enrollment_id=enrollment_id,
        status="approved",
        reviewed_by=teacher["id"]
    )

    return jsonify({
        "success": True,
        "message": f"Successfully approved {enrollment['student_name']} ({enrollment['roll_number']}) for {enrollment['subject_name']}."
    })


# ============================================================
# REJECT ENROLLMENT REQUEST
# ============================================================

@teacher_bp.route("/enrollment-requests/<int:enrollment_id>/reject", methods=["POST"])
@role_required("teacher")
def reject_enrollment(enrollment_id):
    teacher = _get_profile()
    if not teacher:
        return jsonify({"error": "Teacher profile not found."}), 404

    from flask import request
    from models import enrollment as enrollment_model

    enrollment = enrollment_model.get_enrollment_by_id(enrollment_id)
    if not enrollment:
        return jsonify({"error": "Enrollment request not found."}), 404

    # Strict check: Approval/rejection must be by the teacher who teaches this subject!
    if not subject_model.teacher_owns_subject(teacher["id"], enrollment["subject_id"]):
        return jsonify({
            "error": "Access denied. You can only manage enrollments for subjects you teach."
        }), 403

    data = request.get_json(silent=True) or {}
    reason = data.get("reason", "Not approved by teacher.")

    enrollment_model.update_enrollment_status(
        enrollment_id=enrollment_id,
        status="rejected",
        reviewed_by=teacher["id"],
        rejection_reason=reason
    )

    return jsonify({
        "success": True,
        "message": f"Rejected enrollment for {enrollment['student_name']} in {enrollment['subject_name']}."
    })


# ============================================================
# DASHBOARD STATS (INCLUDES PENDING APPROVALS COUNT)
# ============================================================

@teacher_bp.route("/dashboard-stats", methods=["GET"])
@role_required("teacher")
def teacher_dashboard_stats():
    teacher = _get_profile()
    if not teacher:
        return jsonify({"error": "Teacher profile not found."}), 404

    from models import enrollment as enrollment_model

    subjects = subject_model.get_teacher_subjects(teacher["id"])
    pending_requests = enrollment_model.get_pending_enrollments_for_teacher(teacher["id"])

    total_students = 0
    for s in subjects:
        st_list = student_model.list_students_for_subject(
            s["course"], s["branch"], s["semester"], subject_id=s["id"]
        )
        total_students += len(st_list)

    return jsonify({
        "success": True,
        "subjects_count": len(subjects),
        "total_students": total_students,
        "pending_approvals_count": len(pending_requests),
    })


# ============================================================
# TEACHER DIRECTLY ADDS STUDENT BY ROLL NUMBER
# ============================================================

@teacher_bp.route("/subjects/<int:subject_id>/students/add", methods=["POST"])
@role_required("teacher")
def teacher_add_student_by_roll(subject_id):
    teacher = _get_profile()
    if not teacher:
        return jsonify({"error": "Teacher profile not found."}), 404

    if not subject_model.teacher_owns_subject(teacher["id"], subject_id):
        return jsonify({"error": "Access denied. You do not teach this subject."}), 403

    subject = subject_model.get_subject_by_id(subject_id)
    if not subject:
        return jsonify({"error": "Subject not found."}), 404

    from flask import request
    data = request.get_json(silent=True) or {}
    roll_number = (data.get("roll_number") or "").strip().upper()
    full_name = (data.get("full_name") or "").strip()

    if not roll_number:
        return jsonify({"error": "Student roll number is required."}), 400

    student = student_model.get_student_by_roll(roll_number)
    is_unregistered = False

    if not student:
        # Student does not have an account yet!
        # Teacher can still enroll them with their name and roll number.
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
    else:
        # If student exists, update full_name if provided and was a placeholder
        if full_name and (not student.get("full_name") or student.get("full_name").startswith("Student ")):
            from db import execute
            execute("UPDATE students SET full_name = ? WHERE id = ?", (full_name, student["id"]))
            student["full_name"] = full_name

    # Strict branch restriction: Teacher can only add student belonging to the same branch
    student_branch = (student.get("branch") or "").strip().upper()
    subject_branch = (subject.get("branch") or "").strip().upper()

    if student_branch and subject_branch and student_branch != subject_branch:
        return jsonify({
            "error": f"Branch mismatch: Student {student['full_name']} belongs to '{student_branch}', but '{subject['subject_code']}' is for '{subject_branch}' branch. Cross-branch enrollment is prohibited."
        }), 403

    from models import enrollment as enrollment_model
    enrollment_id = enrollment_model.direct_enroll_student(
        student_id=student["id"],
        subject_id=subject_id,
        reviewed_by=teacher["id"]
    )

    sync_note = " (Student has not registered yet. When they register with this roll number, all their attendance will automatically sync to their dashboard!)" if is_unregistered or not student.get("user_id") else ""

    return jsonify({
        "success": True,
        "message": f"Student '{student['full_name']}' ({student['roll_number']}) successfully enrolled in {subject['subject_code']}!{sync_note}",
        "student": student,
        "student_id": student["id"],
        "enrollment_id": enrollment_id,
        "is_unregistered": is_unregistered or not student.get("user_id"),
    }), 200


# ============================================================
# TEACHER REMOVES STUDENT FROM SUBJECT
# ============================================================

@teacher_bp.route("/subjects/<int:subject_id>/students/<int:student_id>/remove", methods=["POST", "DELETE"])
@role_required("teacher")
def teacher_remove_student(subject_id, student_id):
    teacher = _get_profile()
    if not teacher:
        return jsonify({"error": "Teacher profile not found."}), 404

    if not subject_model.teacher_owns_subject(teacher["id"], subject_id):
        return jsonify({"error": "Access denied. You do not teach this subject."}), 403

    subject = subject_model.get_subject_by_id(subject_id)
    student = student_model.get_student_by_id(student_id)

    from models import enrollment as enrollment_model
    enrollment_model.remove_student_enrollment(student_id=student_id, subject_id=subject_id)

    name = student["full_name"] if student else "Student"
    sub_name = subject["subject_code"] if subject else "subject"

    return jsonify({
        "success": True,
        "message": f"{name} has been removed from {sub_name}."
    }), 200