"""student.py – database logic for the `students` table (student profiles)."""

from db import query, execute


def create_student_profile(user_id, roll_number, full_name, course, branch, semester, phone):
    return execute(
        "INSERT INTO students (user_id, roll_number, full_name, course, branch, semester, phone) "
        "VALUES (?,?,?,?,?,?,?)",
        (user_id, roll_number, full_name, course, branch, semester, phone),
    )


def get_student_by_user_id(user_id):
    return query("SELECT * FROM students WHERE user_id = ?", (user_id,), one=True)


def get_student_by_id(student_id):
    return query("SELECT * FROM students WHERE id = ?", (student_id,), one=True)


def get_student_by_roll(roll_number):
    return query("SELECT * FROM students WHERE roll_number = ?", (roll_number,), one=True)


def create_or_get_unregistered_student(roll_number, full_name, course=None, branch=None, semester=1, phone=None):
    """
    Find or create a placeholder student record when a teacher enrolls a student
    who has not yet registered an account on the portal.
    """
    existing = get_student_by_roll(roll_number)
    if existing:
        # If existing record has no full_name or placeholder name, update it
        if full_name and (not existing.get("full_name") or existing.get("full_name") == roll_number):
            execute("UPDATE students SET full_name = ? WHERE id = ?", (full_name, existing["id"]))
            existing["full_name"] = full_name
        return existing

    student_id = execute(
        "INSERT INTO students (user_id, roll_number, full_name, course, branch, semester, phone) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (None, roll_number, full_name, course, branch, semester, phone)
    )
    return get_student_by_id(student_id)


def link_student_user(student_id, user_id, full_name=None, course=None, branch=None, semester=None, phone=None):
    """
    Link a newly registered user account to an existing placeholder student record.
    Preserves all previous teacher-marked attendance and subject enrollments!
    """
    execute(
        """
        UPDATE students
        SET user_id = ?,
            full_name = COALESCE(?, full_name),
            course = COALESCE(?, course),
            branch = COALESCE(?, branch),
            semester = COALESCE(?, semester),
            phone = COALESCE(?, phone)
        WHERE id = ?
        """,
        (user_id, full_name, course, branch, semester, phone, student_id)
    )
    return get_student_by_id(student_id)


def list_students_for_subject(course, branch, semester, subject_id=None):
    """Return students who have an approved enrollment in the subject."""
    if subject_id:
        return query(
            """
            SELECT s.*
            FROM students s
            JOIN enrollments e ON e.student_id = s.id
            WHERE e.subject_id = ? AND e.status = 'approved'
            ORDER BY s.roll_number
            """,
            (subject_id,),
        )
    return query(
        "SELECT * FROM students WHERE course = ? AND branch = ? AND semester = ? "
        "ORDER BY roll_number",
        (course, branch, semester),
    )


def delete_student(student_id):
    """Delete student profile, attendance, enrollments, and their user account."""
    student = get_student_by_id(student_id)
    if not student:
        return False
    user_id = student.get("user_id")
    execute("DELETE FROM attendance WHERE student_id = ?", (student_id,))
    execute("DELETE FROM enrollments WHERE student_id = ?", (student_id,))
    execute("DELETE FROM students WHERE id = ?", (student_id,))
    if user_id:
        execute("DELETE FROM users WHERE id = ?", (user_id,))
    return True

