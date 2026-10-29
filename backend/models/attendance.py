"""
attendance.py – all database logic for the `attendance` table.

This is the heart of the system. It contains:
    * marking / editing attendance (with duplicate protection)
    * student-wise, subject-wise, date-wise and month-wise summaries
    * the overall attendance percentage calculation
"""

from db import query, execute


# ------------------------------------------------------------------
# Marking / editing attendance
# ------------------------------------------------------------------
def save_attendance(student_id, subject_id, teacher_id, date, status):
    """
    Insert attendance for a student. If a record already exists for the same
    (student, subject, date) it is UPDATED instead – this is how we both
    prevent duplicates AND allow a teacher to edit a saved record.
    """
    existing = query(
        "SELECT id FROM attendance WHERE student_id = ? AND subject_id = ? AND date = ?",
        (student_id, subject_id, date),
        one=True,
    )
    if existing:
        execute(
            "UPDATE attendance SET status = ?, teacher_id = ?, marked_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (status, teacher_id, existing["id"]),
        )
        return existing["id"]
    return execute(
        "INSERT INTO attendance (student_id, subject_id, teacher_id, date, status) "
        "VALUES (?,?,?,?,?)",
        (student_id, subject_id, teacher_id, date, status),
    )


def get_attendance_for_date(subject_id, date):
    """Existing records for a subject on a given date (used to pre-fill the form)."""
    return query(
        "SELECT student_id, status FROM attendance WHERE subject_id = ? AND date = ?",
        (subject_id, date),
    )


# ------------------------------------------------------------------
# Student-facing summaries
# ------------------------------------------------------------------
def get_student_records(student_id):
    """Every attendance record for a student, joined with subject info."""
    return query(
        """
        SELECT a.id, a.date, a.status, a.marked_at,
               s.subject_code, s.subject_name
        FROM attendance a
        JOIN subjects s ON s.id = a.subject_id
        WHERE a.student_id = ?
        ORDER BY a.date DESC
        """,
        (student_id,),
    )


def get_subject_wise_summary(student_id):
    """
    For every subject the student has records in, return total classes,
    attended, absent and percentage.
    """
    rows = query(
        """
        SELECT s.subject_code, s.subject_name,
               COUNT(*) AS total,
               SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS attended,
               SUM(CASE WHEN a.status = 'Absent'  THEN 1 ELSE 0 END) AS absent
        FROM attendance a
        JOIN subjects s ON s.id = a.subject_id
        WHERE a.student_id = ?
        GROUP BY a.subject_id
        ORDER BY s.subject_code
        """,
        (student_id,),
    )
    return [_with_percentage(r) for r in rows]


def get_monthly_summary(student_id):
    """Month-wise totals for a student (YYYY-MM)."""
    rows = query(
        """
        SELECT substr(a.date, 1, 7) AS month,
               COUNT(*) AS total,
               SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS attended,
               SUM(CASE WHEN a.status = 'Absent'  THEN 1 ELSE 0 END) AS absent
        FROM attendance a
        WHERE a.student_id = ?
        GROUP BY substr(a.date, 1, 7)
        ORDER BY month DESC
        """,
        (student_id,),
    )
    return [_with_percentage(r) for r in rows]


def get_overall_summary(student_id):
    """Overall totals and percentage across all subjects."""
    row = query(
        """
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS attended,
               SUM(CASE WHEN status = 'Absent'  THEN 1 ELSE 0 END) AS absent
        FROM attendance
        WHERE student_id = ?
        """,
        (student_id,),
        one=True,
    ) or {}
    total = row.get("total") or 0
    attended = row.get("attended") or 0
    absent = row.get("absent") or 0
    return {
        "total": total,
        "attended": attended,
        "absent": absent,
        "percentage": round((attended / total) * 100, 1) if total else 0.0,
    }


# ------------------------------------------------------------------
# Teacher-facing summaries / reports
# ------------------------------------------------------------------
def get_history_for_subject(subject_id, start_date=None, end_date=None):
    """Attendance rows for a subject, optionally restricted to a date range."""
    clauses = ["a.subject_id = ?"]
    params = [subject_id]
    if start_date:
        clauses.append("a.date >= ?")
        params.append(start_date)
    if end_date:
        clauses.append("a.date <= ?")
        params.append(end_date)

    return query(
        f"""
        SELECT a.date, a.status,
               st.roll_number, st.full_name
        FROM attendance a
        JOIN students st ON st.id = a.student_id
        WHERE {" AND ".join(clauses)}
        ORDER BY a.date DESC, st.roll_number
        """,
        params,
    )


def get_subject_report(subject_id):
    """Per-student totals for a subject (teacher report)."""
    rows = query(
        """
        SELECT st.roll_number, st.full_name,
               COUNT(*) AS total,
               SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS attended,
               SUM(CASE WHEN a.status = 'Absent'  THEN 1 ELSE 0 END) AS absent
        FROM attendance a
        JOIN students st ON st.id = a.student_id
        WHERE a.subject_id = ?
        GROUP BY a.student_id, st.roll_number, st.full_name
        ORDER BY st.roll_number
        """,
        (subject_id,),
    )
    return [_with_percentage(r) for r in rows]


def get_distinct_dates_for_subject(subject_id):
    return query(
        "SELECT DISTINCT date FROM attendance WHERE subject_id = ? ORDER BY date DESC",
        (subject_id,),
    )


def get_admin_attendance(filters, page=1, page_size=100):
    """Return paginated attendance rows and totals for validated admin filters."""
    clauses = []
    params = []

    for key, column, operator in (
        ("date", "a.date", "="),
        ("date_from", "a.date", ">="),
        ("date_to", "a.date", "<="),
        ("student_id", "a.student_id", "="),
        ("subject_id", "a.subject_id", "="),
    ):
        value = filters.get(key)
        if value is not None:
            clauses.append(f"{column} {operator} ?")
            params.append(value)

    roll_number = filters.get("roll_number")
    if roll_number:
        clauses.append("LOWER(st.roll_number) = LOWER(?)")
        params.append(roll_number)

    where_sql = " WHERE " + " AND ".join(clauses) if clauses else ""
    from_sql = """
        FROM attendance a
        JOIN students st ON st.id = a.student_id
        JOIN subjects sub ON sub.id = a.subject_id
        LEFT JOIN teachers t ON t.id = a.teacher_id
    """

    records = query(
        f"""
        SELECT a.id, a.student_id, a.subject_id, a.date, a.status,
               st.roll_number, st.full_name AS student_name,
               st.course, st.branch, st.semester,
               sub.subject_code, sub.subject_name,
               t.full_name AS teacher_name
        {from_sql}
        {where_sql}
        ORDER BY a.date DESC, st.roll_number, sub.subject_code
        LIMIT ? OFFSET ?
        """,
        (*params, page_size, (page - 1) * page_size),
    )
    totals = query(
        f"""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present,
               SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent,
               SUM(CASE WHEN a.status = 'Leave' THEN 1 ELSE 0 END) AS leave_count
        {from_sql}
        {where_sql}
        """,
        params,
        one=True,
    ) or {}

    student = None
    student_id = filters.get("student_id")
    if student_id is not None:
        student = query(
            """
            SELECT id, roll_number, full_name, course, branch, semester
            FROM students
            WHERE id = ?
            """,
            (student_id,),
            one=True,
        )
    elif roll_number:
        student = query(
            """
            SELECT id, roll_number, full_name, course, branch, semester
            FROM students
            WHERE LOWER(roll_number) = LOWER(?)
            """,
            (roll_number,),
            one=True,
        )

    total = int(totals.get("total") or 0)
    present = int(totals.get("present") or 0)
    absent = int(totals.get("absent") or 0)
    leave_count = int(totals.get("leave_count") or 0)

    return {
        "records": records,
        "total": total,
        "pages": (total + page_size - 1) // page_size,
        "page": page,
        "page_size": page_size,
        "student": student,
        "summary": {
            "total": total,
            "present": present,
            "absent": absent,
            "leave": leave_count,
            "percentage": round(present * 100 / total, 1) if total else 0.0,
        },
    }


# ------------------------------------------------------------------
# Helper
# ------------------------------------------------------------------
def _with_percentage(row):
    total = row.get("total") or 0
    attended = row.get("attended") or 0
    row["total"] = total
    row["attended"] = attended
    row["absent"] = row.get("absent") or 0
    row["percentage"] = round((attended / total) * 100, 1) if total else 0.0
    return row
