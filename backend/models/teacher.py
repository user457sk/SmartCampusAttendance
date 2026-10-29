"""teacher.py – database logic for the `teachers` table (teacher profiles)."""

from db import query, execute


def create_teacher_profile(user_id, full_name, department, employee_id, phone):
    return execute(
        "INSERT INTO teachers (user_id, full_name, department, employee_id, phone) "
        "VALUES (?,?,?,?,?)",
        (user_id, full_name, department, employee_id, phone),
    )


def get_teacher_by_user_id(user_id):
    return query("SELECT * FROM teachers WHERE user_id = ?", (user_id,), one=True)


def get_teacher_by_id(teacher_id):
    return query("SELECT * FROM teachers WHERE id = ?", (teacher_id,), one=True)


def delete_teacher(teacher_id):
    """Delete teacher profile, assignments, and user account."""
    teacher = get_teacher_by_id(teacher_id)
    if not teacher:
        return False
    user_id = teacher.get("user_id")
    execute("DELETE FROM teacher_subjects WHERE teacher_id = ?", (teacher_id,))
    execute("DELETE FROM teachers WHERE id = ?", (teacher_id,))
    if user_id:
        execute("DELETE FROM users WHERE id = ?", (user_id,))
    return True
