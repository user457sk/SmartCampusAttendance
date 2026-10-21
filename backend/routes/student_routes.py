"""
student_routes.py
-----------------
Student-only API endpoints.

All student routes are mounted from app.py as:

/api/students/...

Available endpoints:

GET /api/students/profile
GET /api/students/dashboard
GET /api/students/attendance
GET /api/students/subject-attendance
GET /api/students/monthly-attendance
"""

from flask import Blueprint, jsonify, session, request

from db import query


# ============================================================
# STUDENT BLUEPRINT
# ============================================================

# IMPORTANT:
# app.py already adds /api/students
# Therefore DO NOT add another url_prefix here.

student_bp = Blueprint(
    "student",
    __name__
)


# ============================================================
# GET CURRENT STUDENT
# ============================================================

def get_current_student():

    user_id = session.get("user_id")

    if not user_id:
        return None

    rows = query(
        """
        SELECT
            u.id AS user_id,
            u.username,
            u.email,
            u.role,
            u.profile_pic,

            s.id AS student_id,
            s.roll_number,
            s.full_name,
            s.course,
            s.branch,
            s.semester,
            s.phone

        FROM users u

        LEFT JOIN students s
            ON s.user_id = u.id

        WHERE u.id = %s
        """,
        (user_id,)
    )

    if not rows:
        return None

    return rows[0]


# ============================================================
# STUDENT PROFILE
# ============================================================

@student_bp.get("/profile")
def student_profile():

    student = get_current_student()

    if not student:
        return jsonify({
            "success": False,
            "error": "Student not logged in"
        }), 401

    if not student.get("student_id"):
        return jsonify({
            "success": False,
            "error": "Student profile not found"
        }), 404

    return jsonify({
        "success": True,
        "student": student
    })


@student_bp.route("/profile", methods=["PUT", "PATCH"])
def update_student_own_profile():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Student not logged in"}), 401

    student = get_current_student()
    if not student or not student.get("student_id"):
        return jsonify({"success": False, "error": "Student profile not found"}), 404

    data = request.get_json(silent=True) or {}

    full_name = (data.get("full_name") or "").strip()
    roll_number = (data.get("roll_number") or "").strip().upper()
    course = (data.get("course") or "").strip()
    branch = (data.get("branch") or "").strip().upper()
    semester = data.get("semester")
    phone = (data.get("phone") or "").strip()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()

    if not full_name:
        return jsonify({"success": False, "error": "Full name is required."}), 400
    if not roll_number:
        return jsonify({"success": False, "error": "Roll number is required."}), 400
    if not course:
        return jsonify({"success": False, "error": "Course is required."}), 400
    if not branch:
        return jsonify({"success": False, "error": "Branch is required."}), 400
    if not username or len(username) < 3:
        return jsonify({"success": False, "error": "Username must be at least 3 characters."}), 400
    if not email or "@" not in email or "." not in email:
        return jsonify({"success": False, "error": "Valid email is required."}), 400

    try:
        semester = int(semester)
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Semester must be a valid number."}), 400

    if semester < 1 or semester > 12:
        return jsonify({"success": False, "error": "Semester must be between 1 and 12."}), 400

    from models import user as user_model

    existing_user = user_model.get_user_by_username(username)
    if existing_user and existing_user["id"] != user_id:
        return jsonify({"success": False, "error": "Username is already in use."}), 409

    existing_email = user_model.get_user_by_email(email)
    if existing_email and existing_email["id"] != user_id:
        return jsonify({"success": False, "error": "Email is already in use."}), 409

    existing_roll = query(
        """
        SELECT id FROM students
        WHERE roll_number = ? AND id <> ?
        """,
        (roll_number, student["student_id"]),
        one=True,
    )
    if existing_roll:
        return jsonify({"success": False, "error": "Roll number is already in use."}), 409

    try:
        query(
            """
            UPDATE students
            SET full_name = ?, roll_number = ?, course = ?, branch = ?, semester = ?, phone = ?
            WHERE id = ?
            """,
            (full_name, roll_number, course, branch, semester, phone or None, student["student_id"]),
        )
        query(
            """
            UPDATE users
            SET username = ?, email = ?
            WHERE id = ?
            """,
            (username, email, user_id),
        )
    except Exception as exc:
        return jsonify({"success": False, "error": f"Update failed: {str(exc)}"}), 400

    return jsonify({
        "success": True,
        "message": "Profile updated successfully.",
        "student": {
            "user_id": user_id,
            "username": username,
            "email": email,
            "full_name": full_name,
            "roll_number": roll_number,
            "course": course,
            "branch": branch,
            "semester": semester,
            "phone": phone,
            "profile_pic": student.get("profile_pic"),
        },
    })


@student_bp.route("/account", methods=["DELETE"])
def delete_student_own_account():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Student not logged in"}), 401

    student = get_current_student()
    if not student or not student.get("student_id"):
        return jsonify({"success": False, "error": "Student profile not found"}), 404

    from db import execute

    try:
        execute("DELETE FROM attendance WHERE student_id = ?", (student["student_id"],))
        execute("DELETE FROM enrollments WHERE student_id = ?", (student["student_id"],))
        execute("DELETE FROM students WHERE id = ?", (student["student_id"],))
        execute("DELETE FROM users WHERE id = ?", (user_id,))
        session.clear()
    except Exception as exc:
        return jsonify({"success": False, "error": f"Delete failed: {str(exc)}"}), 400

    return jsonify({
        "success": True,
        "message": "Your account has been deleted successfully.",
    })


# ============================================================
# STUDENT DASHBOARD
# ============================================================

@student_bp.get("/dashboard")
def student_dashboard():

    student = get_current_student()

    if not student:
        return jsonify({
            "success": False,
            "error": "Student not logged in"
        }), 401

    student_id = student.get("student_id")

    if not student_id:
        return jsonify({
            "success": False,
            "error": "Student profile not found"
        }), 404


    # --------------------------------------------------------
    # OVERALL ATTENDANCE
    # --------------------------------------------------------

    attendance_rows = query(
        """
        SELECT

            COUNT(*) AS total_classes,

            COALESCE(
                SUM(
                    CASE
                        WHEN status = 'Present'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS classes_attended,

            COALESCE(
                SUM(
                    CASE
                        WHEN status = 'Absent'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS classes_absent

        FROM attendance

        WHERE student_id = %s
        """,
        (student_id,)
    )


    attendance = (
        attendance_rows[0]
        if attendance_rows
        else {}
    )


    total_classes = int(
        attendance.get("total_classes") or 0
    )

    classes_attended = int(
        attendance.get("classes_attended") or 0
    )

    classes_absent = int(
        attendance.get("classes_absent") or 0
    )


    if total_classes > 0:

        attendance_percentage = round(
            (classes_attended / total_classes) * 100,
            2
        )

    else:

        attendance_percentage = 0


    # --------------------------------------------------------
    # SUBJECT-WISE ATTENDANCE
    # --------------------------------------------------------

    subject_rows = query(
        """
        SELECT

            s.id AS subject_id,
            s.subject_code,
            s.subject_name,
            s.course,
            s.branch,
            s.semester,

            COUNT(a.id) AS total_classes,

            COALESCE(
                SUM(
                    CASE
                        WHEN a.status = 'Present'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS classes_attended,

            COALESCE(
                SUM(
                    CASE
                        WHEN a.status = 'Absent'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS classes_absent

        FROM attendance a

        INNER JOIN subjects s
            ON s.id = a.subject_id

        WHERE a.student_id = %s

        GROUP BY
            s.id,
            s.subject_code,
            s.subject_name,
            s.course,
            s.branch,
            s.semester

        ORDER BY s.subject_name
        """,
        (student_id,)
    )


    subjects = []


    for subject in subject_rows:

        subject_total = int(
            subject.get("total_classes") or 0
        )

        subject_attended = int(
            subject.get("classes_attended") or 0
        )

        subject_absent = int(
            subject.get("classes_absent") or 0
        )


        if subject_total > 0:

            percentage = round(
                (subject_attended / subject_total) * 100,
                2
            )

        else:

            percentage = 0


        subjects.append({

            "subject_id":
                subject.get("subject_id"),

            "subject_code":
                subject.get("subject_code"),

            "subject_name":
                subject.get("subject_name"),

            "course":
                subject.get("course"),

            "branch":
                subject.get("branch"),

            "semester":
                subject.get("semester"),

            "total_classes":
                subject_total,

            "classes_attended":
                subject_attended,

            "classes_absent":
                subject_absent,

            "attendance_percentage":
                percentage,

            # Frontend compatibility
            "total":
                subject_total,

            "attended":
                subject_attended,

            "absent":
                subject_absent,

            "percentage":
                percentage
        })


    from models import enrollment as enrollment_model
    my_enrollments = enrollment_model.get_student_enrollments(student_id)
    pending_count = sum(1 for e in my_enrollments if e.get("status") == "pending")
    approved_count = sum(1 for e in my_enrollments if e.get("status") == "approved")

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return jsonify({

        "success": True,

        "student": {

            "user_id":
                student.get("user_id"),

            "username":
                student.get("username"),

            "email":
                student.get("email"),

            "profile_pic":
                student.get("profile_pic"),

            "student_id":
                student.get("student_id"),

            "roll_number":
                student.get("roll_number"),

            "full_name":
                student.get("full_name"),

            "course":
                student.get("course"),

            "branch":
                student.get("branch"),

            "semester":
                student.get("semester"),

            "phone":
                student.get("phone")
        },


        "attendance": {

            "attendance_percentage":
                attendance_percentage,

            "total_classes":
                total_classes,

            "classes_attended":
                classes_attended,

            "classes_absent":
                classes_absent
        },


        # Frontend-friendly fields
        "total_subjects":
            len(subjects),

        "total_classes":
            total_classes,

        "attended":
            classes_attended,

        "absent":
            classes_absent,

        "percentage":
            attendance_percentage,

        "subjects":
            subjects,

        "enrollments":
            my_enrollments,

        "pending_enrollments_count":
            pending_count,

        "approved_enrollments_count":
            approved_count,
    })


# ============================================================
# DATE-WISE ATTENDANCE
# ============================================================

@student_bp.get("/attendance")
def student_attendance():

    student = get_current_student()

    if not student:
        return jsonify({
            "success": False,
            "error": "Student not logged in"
        }), 401


    student_id = student.get("student_id")

    if not student_id:
        return jsonify({
            "success": False,
            "error": "Student profile not found"
        }), 404


    rows = query(
        """
        SELECT

            a.id,
            a.date,
            a.status,

            s.id AS subject_id,
            s.subject_code,
            s.subject_name

        FROM attendance a

        INNER JOIN subjects s
            ON s.id = a.subject_id

        WHERE a.student_id = %s

        ORDER BY
            a.date DESC,
            s.subject_name
        """,
        (student_id,)
    )


    return jsonify(rows)


# ============================================================
# SUBJECT-WISE ATTENDANCE
# ============================================================

@student_bp.get("/subject-attendance")
def student_subject_attendance():

    student = get_current_student()

    if not student:
        return jsonify({
            "success": False,
            "error": "Student not logged in"
        }), 401


    student_id = student.get("student_id")

    if not student_id:
        return jsonify({
            "success": False,
            "error": "Student profile not found"
        }), 404


    rows = query(
        """
        SELECT

            s.id AS subject_id,
            s.subject_code,
            s.subject_name,
            s.course,
            s.branch,
            s.semester,

            COUNT(a.id) AS total,

            COALESCE(
                SUM(
                    CASE
                        WHEN a.status = 'Present'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS attended,

            COALESCE(
                SUM(
                    CASE
                        WHEN a.status = 'Absent'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS absent

        FROM attendance a

        INNER JOIN subjects s
            ON s.id = a.subject_id

        WHERE a.student_id = %s

        GROUP BY

            s.id,
            s.subject_code,
            s.subject_name,
            s.course,
            s.branch,
            s.semester

        ORDER BY s.subject_name
        """,
        (student_id,)
    )


    result = []


    for row in rows:

        total = int(row.get("total") or 0)

        attended = int(
            row.get("attended") or 0
        )

        absent = int(
            row.get("absent") or 0
        )


        percentage = (
            round((attended / total) * 100, 2)
            if total > 0
            else 0
        )


        result.append({

            "subject_id":
                row.get("subject_id"),

            "subject_code":
                row.get("subject_code"),

            "subject_name":
                row.get("subject_name"),

            "course":
                row.get("course"),

            "branch":
                row.get("branch"),

            "semester":
                row.get("semester"),

            "total":
                total,

            "attended":
                attended,

            "absent":
                absent,

            "percentage":
                percentage
        })


    return jsonify(result)


# ============================================================
# MONTHLY ATTENDANCE
# ============================================================

@student_bp.get("/monthly-attendance")
def student_monthly_attendance():

    student = get_current_student()

    if not student:
        return jsonify({
            "success": False,
            "error": "Student not logged in"
        }), 401


    student_id = student.get("student_id")


    if not student_id:
        return jsonify({
            "success": False,
            "error": "Student profile not found"
        }), 404


    rows = query(
        """
        SELECT

            TO_CHAR(
                a.date,
                'YYYY-MM'
            ) AS month,

            COUNT(*) AS total,

            COALESCE(
                SUM(
                    CASE
                        WHEN a.status = 'Present'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS attended,

            COALESCE(
                SUM(
                    CASE
                        WHEN a.status = 'Absent'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS absent

        FROM attendance a

        WHERE a.student_id = %s

        GROUP BY
            TO_CHAR(a.date, 'YYYY-MM')

        ORDER BY month DESC
        """,
        (student_id,)
    )


    result = []


    for row in rows:

        total = int(
            row.get("total") or 0
        )

        attended = int(
            row.get("attended") or 0
        )

        absent = int(
            row.get("absent") or 0
        )


        percentage = (
            round((attended / total) * 100, 2)
            if total > 0
            else 0
        )


        result.append({

            "month":
                row.get("month"),

            "total":
                total,

            "attended":
                attended,

            "absent":
                absent,

            "percentage":
                percentage
        })


    return jsonify(result)


# ============================================================
# AVAILABLE SUBJECTS FOR ENROLLMENT (BRANCH FILTERED)
# ============================================================

@student_bp.get("/available-subjects")
def student_available_subjects():
    student = get_current_student()
    if not student:
        return jsonify({"success": False, "error": "Student not logged in"}), 401

    student_id = student.get("student_id")
    student_branch = (student.get("branch") or "").strip()
    student_course = (student.get("course") or "").strip()

    from models import subject as subject_model
    from models import enrollment as enrollment_model

    all_subjects = subject_model.list_all_subjects()
    my_enrollments = {
        e["subject_id"]: e
        for e in enrollment_model.get_student_enrollments(student_id)
    }

    results = []
    for sub in all_subjects:
        teachers = subject_model.get_subject_teachers(sub["id"])
        teacher_names = ", ".join([t["full_name"] for t in teachers]) if teachers else "Unassigned"
        enrollment = my_enrollments.get(sub["id"])
        status = enrollment["status"] if enrollment else "not_enrolled"
        is_my_branch = (sub.get("branch") or "").strip().upper() == student_branch.upper()

        results.append({
            "id": sub["id"],
            "subject_code": sub["subject_code"],
            "subject_name": sub["subject_name"],
            "course": sub["course"],
            "branch": sub["branch"],
            "semester": sub["semester"],
            "teacher_names": teacher_names,
            "teachers": teachers,
            "enrollment_status": status,
            "enrollment_id": enrollment["id"] if enrollment else None,
            "is_my_branch": is_my_branch,
            "can_enroll": is_my_branch and status in ("not_enrolled", "rejected"),
        })

    return jsonify({
        "success": True,
        "student_branch": student_branch,
        "student_course": student_course,
        "subjects": results,
    })


# ============================================================
# REQUEST SUBJECT ENROLLMENT (STRICT BRANCH CHECK)
# ============================================================

@student_bp.post("/enroll")
def student_request_enrollment():
    from flask import request
    student = get_current_student()
    if not student:
        return jsonify({"success": False, "error": "Student not logged in"}), 401

    student_id = student.get("student_id")
    data = request.get_json(silent=True) or {}
    subject_id = data.get("subject_id")

    if not subject_id:
        return jsonify({"success": False, "error": "Subject ID is required"}), 400

    from models import subject as subject_model
    from models import enrollment as enrollment_model

    subject = subject_model.get_subject_by_id(subject_id)
    if not subject:
        return jsonify({"success": False, "error": "Subject not found"}), 404

    # ---- Strict Branch Restriction Check ----
    student_branch = (student.get("branch") or "").strip().upper()
    subject_branch = (subject.get("branch") or "").strip().upper()

    if student_branch != subject_branch:
        return jsonify({
            "success": False,
            "error": f"Branch mismatch: As a '{student.get('branch')}' student, you are not allowed to enroll in a '{subject.get('branch')}' subject."
        }), 403

    # ---- Check Existing Enrollment ----
    existing = enrollment_model.get_enrollment(student_id, subject_id)
    teachers = subject_model.get_subject_teachers(subject_id)
    teacher_name = ", ".join([t["full_name"] for t in teachers]) if teachers else "the subject teacher"

    if existing:
        if existing["status"] == "approved":
            return jsonify({
                "success": False,
                "error": f"You are already approved and enrolled in {subject['subject_name']}."
            }), 400
        elif existing["status"] == "pending":
            return jsonify({
                "success": False,
                "error": f"Your enrollment request for {subject['subject_name']} is already pending approval from {teacher_name}."
            }), 400
        elif existing["status"] == "rejected":
            # Re-request enrollment
            enrollment_model.update_enrollment_status(existing["id"], "pending")
            return jsonify({
                "success": True,
                "message": f"Enrollment re-requested for {subject['subject_name']}. Sent to {teacher_name} for approval."
            })

    # New enrollment request
    enrollment_model.create_enrollment(student_id, subject_id, status="pending")

    return jsonify({
        "success": True,
        "message": f"Enrollment request submitted! Approval has been sent to {teacher_name}."
    }), 201


# ============================================================
# MY ENROLLMENTS
# ============================================================

@student_bp.get("/enrollments")
def student_enrollments_list():
    student = get_current_student()
    if not student:
        return jsonify({"success": False, "error": "Student not logged in"}), 401

    student_id = student.get("student_id")
    from models import enrollment as enrollment_model
    records = enrollment_model.get_student_enrollments(student_id)
    return jsonify({"success": True, "enrollments": records})


# ============================================================
# OPTIONAL: FORM-STYLE PROFILE UPDATE HELPER FOR FRONTEND
# ============================================================

@student_bp.route("/profile/update", methods=["POST"])
def student_update_profile_form():
    return update_student_own_profile()


# END
