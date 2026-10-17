"""
subject.py
----------
Database logic for:

- subjects
- teacher_subjects
"""

from db import query, execute


# ============================================================
# CREATE SUBJECT
# ============================================================

def create_subject(
    subject_code,
    subject_name,
    course,
    branch,
    semester
):
    """
    Create a new subject and return its ID.
    """

    return execute(
        """
        INSERT INTO subjects
        (
            subject_code,
            subject_name,
            course,
            branch,
            semester
        )
        VALUES
        (?, ?, ?, ?, ?)
        """,
        (
            subject_code,
            subject_name,
            course,
            branch,
            semester
        )
    )


# ============================================================
# GET SUBJECT BY ID
# ============================================================

def get_subject_by_id(subject_id):

    return query(
        """
        SELECT *
        FROM subjects
        WHERE id = ?
        """,
        (subject_id,),
        one=True
    )


# ============================================================
# GET SUBJECT BY CODE
# ============================================================

def get_subject_by_code(subject_code):

    return query(
        """
        SELECT *
        FROM subjects
        WHERE subject_code = ?
        """,
        (subject_code,),
        one=True
    )


# ============================================================
# LIST ALL SUBJECTS
# ============================================================

def list_all_subjects():

    return query(
        """
        SELECT *
        FROM subjects
        ORDER BY subject_code
        """
    )


# ============================================================
# SUBJECTS FOR STUDENT
# ============================================================

def list_subjects_for_student(
    course,
    branch,
    semester
):
    """
    Return subjects matching the student's
    course, branch and semester.
    """

    return query(
        """
        SELECT *
        FROM subjects

        WHERE course = ?
        AND branch = ?
        AND semester = ?

        ORDER BY subject_code
        """,
        (
            course,
            branch,
            semester
        )
    )


# ============================================================
# ASSIGN SUBJECT TO TEACHER
# ============================================================

def assign_subject_to_teacher(
    teacher_id,
    subject_id
):
    """
    Assign a subject to a teacher.

    PostgreSQL-safe implementation.

    If the teacher is already assigned to
    the subject, nothing is inserted.
    """

    existing = query(
        """
        SELECT id
        FROM teacher_subjects

        WHERE teacher_id = ?
        AND subject_id = ?

        LIMIT 1
        """,
        (
            teacher_id,
            subject_id
        ),
        one=True
    )


    # Already assigned
    if existing:

        return existing["id"]


    # New assignment
    return execute(
        """
        INSERT INTO teacher_subjects
        (
            teacher_id,
            subject_id
        )
        VALUES
        (?, ?)
        """,
        (
            teacher_id,
            subject_id
        )
    )


# ============================================================
# REMOVE SUBJECT FROM TEACHER
# ============================================================

def unassign_subject(
    teacher_id,
    subject_id
):

    execute(
        """
        DELETE FROM teacher_subjects

        WHERE teacher_id = ?
        AND subject_id = ?
        """,
        (
            teacher_id,
            subject_id
        )
    )


# ============================================================
# GET TEACHER SUBJECTS
# ============================================================

def get_teacher_subjects(
    teacher_id
):
    """
    Return all subjects assigned to a teacher.
    """

    return query(
        """
        SELECT
            s.*

        FROM subjects s

        INNER JOIN teacher_subjects ts
            ON ts.subject_id = s.id

        WHERE ts.teacher_id = ?

        ORDER BY s.subject_code
        """,
        (teacher_id,)
    )


# ============================================================
# CHECK TEACHER OWNERSHIP
# ============================================================

def teacher_owns_subject(
    teacher_id,
    subject_id
):
    """
    Check whether a subject belongs to
    the given teacher.
    """

    row = query(
        """
        SELECT 1 AS ok

        FROM teacher_subjects

        WHERE teacher_id = ?
        AND subject_id = ?

        LIMIT 1
        """,
        (
            teacher_id,
            subject_id
        ),
        one=True
    )

    return bool(row)


def list_subjects_by_branch(branch, course=None):
    """Return all subjects offered for a specific branch."""
    if course:
        return query(
            "SELECT * FROM subjects WHERE branch = ? AND course = ? ORDER BY subject_code",
            (branch, course)
        )
    return query(
        "SELECT * FROM subjects WHERE branch = ? ORDER BY subject_code",
        (branch,)
    )


def get_subject_teachers(subject_id):
    """Return teachers teaching this subject."""
    return query(
        """
        SELECT t.id, t.full_name, t.department, t.employee_id, t.phone, u.email
        FROM teachers t
        JOIN users u ON u.id = t.user_id
        JOIN teacher_subjects ts ON ts.teacher_id = t.id
        WHERE ts.subject_id = ?
        """,
        (subject_id,)
    )


def delete_subject(subject_id):
    """Delete subject and its related attendance, enrollments, and teacher assignments."""
    execute("DELETE FROM attendance WHERE subject_id = ?", (subject_id,))
    execute("DELETE FROM enrollments WHERE subject_id = ?", (subject_id,))
    execute("DELETE FROM teacher_subjects WHERE subject_id = ?", (subject_id,))
    return execute("DELETE FROM subjects WHERE id = ?", (subject_id,))