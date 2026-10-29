"""
enrollment.py
-------------
Database logic for student enrollments and approval workflow.

Rules:
- Students can only enroll in subjects matching their branch.
- Approval requests go ONLY to the teacher(s) assigned to that specific subject.
- Admin has global access to view and manage all enrollments.
"""

from db import query, execute


def create_enrollment(student_id, subject_id, status="pending"):
    """Create a new enrollment request for a student in a subject."""
    return execute(
        """
        INSERT INTO enrollments (student_id, subject_id, status)
        VALUES (?, ?, ?)
        """,
        (student_id, subject_id, status),
    )


def get_enrollment(student_id, subject_id):
    """Get existing enrollment record between a student and subject."""
    return query(
        """
        SELECT *
        FROM enrollments
        WHERE student_id = ? AND subject_id = ?
        """,
        (student_id, subject_id),
        one=True,
    )


def get_enrollment_by_id(enrollment_id):
    """Get single enrollment record with student and subject details."""
    return query(
        """
        SELECT e.*, s.full_name AS student_name, s.roll_number, s.branch AS student_branch,
               sub.subject_code, sub.subject_name, sub.branch AS subject_branch
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        JOIN subjects sub ON sub.id = e.subject_id
        WHERE e.id = ?
        """,
        (enrollment_id,),
        one=True,
    )


def get_student_enrollments(student_id):
    """List all enrollments for a specific student with teacher details."""
    return query(
        """
        SELECT e.id, e.student_id, e.subject_id, e.status, e.requested_at, e.reviewed_at, e.rejection_reason,
               sub.subject_code, sub.subject_name, sub.course, sub.branch, sub.semester,
               t.full_name AS teacher_name, t.department AS teacher_department
        FROM enrollments e
        JOIN subjects sub ON sub.id = e.subject_id
        LEFT JOIN teacher_subjects ts ON ts.subject_id = sub.id
        LEFT JOIN teachers t ON t.id = ts.teacher_id
        WHERE e.student_id = ?
        ORDER BY sub.subject_code
        """,
        (student_id,),
    )


def get_pending_enrollments_for_teacher(teacher_id):
    """
    Get pending student enrollment requests for subjects taught by this teacher ONLY.
    Guarantees approval request goes to the correct teacher.
    """
    return query(
        """
        SELECT e.id, e.student_id, e.subject_id, e.status, e.requested_at,
               s.roll_number, s.full_name AS student_name, s.course, s.branch AS student_branch,
               s.semester, s.phone,
               u.email AS student_email,
               sub.subject_code, sub.subject_name, sub.branch AS subject_branch
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        LEFT JOIN users u ON u.id = s.user_id
        JOIN subjects sub ON sub.id = e.subject_id
        JOIN teacher_subjects ts ON ts.subject_id = sub.id
        WHERE ts.teacher_id = ? AND e.status = 'pending'
        ORDER BY e.requested_at DESC
        """,
        (teacher_id,),
    )


def get_all_enrollments_for_teacher(teacher_id):
    """Get all enrollment requests (pending/approved/rejected) for this teacher's subjects."""
    return query(
        """
        SELECT e.id, e.student_id, e.subject_id, e.status, e.requested_at, e.reviewed_at,
               s.roll_number, s.full_name AS student_name, s.course, s.branch AS student_branch,
               s.semester, s.phone,
               u.email AS student_email,
               sub.subject_code, sub.subject_name, sub.branch AS subject_branch
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        LEFT JOIN users u ON u.id = s.user_id
        JOIN subjects sub ON sub.id = e.subject_id
        JOIN teacher_subjects ts ON ts.subject_id = sub.id
        WHERE ts.teacher_id = ?
        ORDER BY e.requested_at DESC
        """,
        (teacher_id,),
    )


def get_all_enrollments_for_admin():
    """Admin access: get all student enrollments across all subjects and branches."""
    return query(
        """
        SELECT e.id, e.student_id, e.subject_id, e.status, e.requested_at, e.reviewed_at, e.rejection_reason,
               s.roll_number, s.full_name AS student_name, s.course, s.branch AS student_branch,
               s.semester, s.phone,
               u.email AS student_email,
               sub.subject_code, sub.subject_name, sub.branch AS subject_branch,
               t.full_name AS teacher_name
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        LEFT JOIN users u ON u.id = s.user_id
        JOIN subjects sub ON sub.id = e.subject_id
        LEFT JOIN teacher_subjects ts ON ts.subject_id = sub.id
        LEFT JOIN teachers t ON t.id = ts.teacher_id
        ORDER BY e.requested_at DESC
        """
    )


def update_enrollment_status(enrollment_id, status, reviewed_by=None, rejection_reason=None):
    """Update status of an enrollment request (approved or rejected)."""
    return execute(
        """
        UPDATE enrollments
        SET status = ?, reviewed_by = ?, rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (status, reviewed_by, rejection_reason, enrollment_id),
    )


def list_approved_students_for_subject(subject_id):
    """List only students whose enrollment in this subject has been APPROVED."""
    return query(
        """
        SELECT s.*, e.id AS enrollment_id, e.status AS enrollment_status, e.requested_at, e.reviewed_at
        FROM students s
        JOIN enrollments e ON e.student_id = s.id
        WHERE e.subject_id = ? AND e.status = 'approved'
        ORDER BY s.roll_number
        """,
        (subject_id,),
    )


def remove_student_enrollment(student_id, subject_id):
    """Remove student enrollment record completely from subject."""
    return execute(
        "DELETE FROM enrollments WHERE student_id = ? AND subject_id = ?",
        (student_id, subject_id),
    )


def direct_enroll_student(student_id, subject_id, reviewed_by=None):
    """Directly enroll and approve student in subject."""
    existing = query(
        "SELECT id, status FROM enrollments WHERE student_id = ? AND subject_id = ?",
        (student_id, subject_id),
        one=True,
    )
    if existing:
        execute(
            "UPDATE enrollments SET status = 'approved', reviewed_by = ?, rejection_reason = NULL, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (reviewed_by, existing["id"]),
        )
        return existing["id"]
    else:
        return execute(
            "INSERT INTO enrollments (student_id, subject_id, status, reviewed_by, reviewed_at) VALUES (?, ?, 'approved', ?, CURRENT_TIMESTAMP)",
            (student_id, subject_id, reviewed_by),
        )
