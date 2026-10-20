"""
migrate_sqlite_to_supabase.py

SmartCampus
SQLite -> Supabase PostgreSQL migration

Important:
- Original SQLite database is never modified.
- SQLite backup is never modified.
- Existing Supabase records are preserved.
- Duplicate username/email/roll number/etc. are reused.
"""

import os
import sqlite3

import psycopg
from psycopg.rows import dict_row

from config import DATABASE_URL, BASE_DIR


# ============================================================
# SQLITE DATABASE
# ============================================================

SQLITE_DB = os.path.join(
    BASE_DIR,
    "database",
    "smartcampus.db"
)


# ============================================================
# BASIC CHECKS
# ============================================================

if not os.path.exists(SQLITE_DB):

    print()
    print("ERROR: SQLite database not found.")
    print()
    print(SQLITE_DB)
    print()

    raise SystemExit(1)


if not DATABASE_URL:

    print()
    print("ERROR: DATABASE_URL is missing.")
    print("Check SmartCampus/.env")
    print()

    raise SystemExit(1)


# ============================================================
# SQLITE HELPER
# ============================================================

def get_sqlite_rows(cursor, table):

    cursor.execute(
        f"SELECT * FROM {table}"
    )

    return cursor.fetchall()


# ============================================================
# MAIN MIGRATION
# ============================================================

def migrate():

    print()
    print("=" * 65)
    print("      SmartCampus SQLite -> Supabase Migration")
    print("=" * 65)
    print()

    print("SQLite source:")
    print(SQLITE_DB)
    print()

    # --------------------------------------------------------
    # SQLite connection
    # --------------------------------------------------------

    sqlite_conn = sqlite3.connect(
        SQLITE_DB
    )

    sqlite_conn.row_factory = sqlite3.Row

    sqlite_cursor = sqlite_conn.cursor()

    # --------------------------------------------------------
    # PostgreSQL connection
    # --------------------------------------------------------

    print("Connecting to Supabase PostgreSQL...")

    postgres_conn = psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        sslmode="require",
    )

    print("Supabase connection successful.")
    print()

    # ========================================================
    # ID MAPS
    # ========================================================

    user_map = {}
    student_map = {}
    teacher_map = {}
    subject_map = {}

    try:

        # ====================================================
        # 1. USERS
        # ====================================================

        print("1/7  Migrating users...")

        users = get_sqlite_rows(
            sqlite_cursor,
            "users"
        )

        user_count = 0
        user_columns = {
            row[1]
            for row in sqlite_cursor.execute(
                "PRAGMA table_info(users)"
            ).fetchall()
        }

        for old_user in users:

            # ------------------------------------------------
            # Insert only if neither username nor email exists.
            #
            # DO NOTHING handles both unique constraints.
            # ------------------------------------------------

            postgres_conn.execute(
                """
                INSERT INTO users
                (
                    username,
                    email,
                    password_hash,
                    role,
                    account_status,
                    profile_pic,
                    created_at
                )
                VALUES
                (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    old_user["username"],
                    old_user["email"],
                    old_user["password_hash"],
                    old_user["role"],
                    old_user["account_status"]
                    if "account_status" in user_columns
                    else "approved",
                    old_user["profile_pic"]
                    if "profile_pic" in user_columns
                    else None,
                    old_user["created_at"],
                )
            )

            # ------------------------------------------------
            # Find existing/new user.
            #
            # First try username.
            # If not found, try email.
            # ------------------------------------------------

            new_user = postgres_conn.execute(
                """
                SELECT id
                FROM users
                WHERE username = %s
                LIMIT 1
                """,
                (
                    old_user["username"],
                )
            ).fetchone()

            if new_user is None:

                new_user = postgres_conn.execute(
                    """
                    SELECT id
                    FROM users
                    WHERE email = %s
                    LIMIT 1
                    """,
                    (
                        old_user["email"],
                    )
                ).fetchone()

            if new_user:

                user_map[
                    old_user["id"]
                ] = new_user["id"]

                user_count += 1

        postgres_conn.commit()

        print(
            f"   Users processed: {user_count}"
        )

        # ====================================================
        # 2. STUDENTS
        # ====================================================

        print("2/7  Migrating students...")

        students = get_sqlite_rows(
            sqlite_cursor,
            "students"
        )

        student_count = 0

        for old_student in students:

            new_user_id = user_map.get(
                old_student["user_id"]
            )

            if not new_user_id:

                print(
                    f"   Skipping student "
                    f"{old_student['id']}: user not found"
                )

                continue

            postgres_conn.execute(
                """
                INSERT INTO students
                (
                    user_id,
                    roll_number,
                    full_name,
                    course,
                    branch,
                    semester,
                    phone
                )
                VALUES
                (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    new_user_id,
                    old_student["roll_number"],
                    old_student["full_name"],
                    old_student["course"],
                    old_student["branch"],
                    old_student["semester"],
                    old_student["phone"],
                )
            )

            new_student = postgres_conn.execute(
                """
                SELECT id
                FROM students
                WHERE roll_number = %s
                LIMIT 1
                """,
                (
                    old_student["roll_number"],
                )
            ).fetchone()

            if new_student:

                student_map[
                    old_student["id"]
                ] = new_student["id"]

                student_count += 1

        postgres_conn.commit()

        print(
            f"   Students processed: {student_count}"
        )

        # ====================================================
        # 3. TEACHERS
        # ====================================================

        print("3/7  Migrating teachers...")

        teachers = get_sqlite_rows(
            sqlite_cursor,
            "teachers"
        )

        teacher_count = 0

        for old_teacher in teachers:

            new_user_id = user_map.get(
                old_teacher["user_id"]
            )

            if not new_user_id:

                print(
                    f"   Skipping teacher "
                    f"{old_teacher['id']}: user not found"
                )

                continue

            postgres_conn.execute(
                """
                INSERT INTO teachers
                (
                    user_id,
                    full_name,
                    department,
                    employee_id,
                    phone
                )
                VALUES
                (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    new_user_id,
                    old_teacher["full_name"],
                    old_teacher["department"],
                    old_teacher["employee_id"],
                    old_teacher["phone"],
                )
            )

            new_teacher = postgres_conn.execute(
                """
                SELECT id
                FROM teachers
                WHERE employee_id = %s
                LIMIT 1
                """,
                (
                    old_teacher["employee_id"],
                )
            ).fetchone()

            if new_teacher:

                teacher_map[
                    old_teacher["id"]
                ] = new_teacher["id"]

                teacher_count += 1

        postgres_conn.commit()

        print(
            f"   Teachers processed: {teacher_count}"
        )

        # ====================================================
        # 4. SUBJECTS
        # ====================================================

        print("4/7  Migrating subjects...")

        subjects = get_sqlite_rows(
            sqlite_cursor,
            "subjects"
        )

        subject_count = 0

        for old_subject in subjects:

            postgres_conn.execute(
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
                (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    old_subject["subject_code"],
                    old_subject["subject_name"],
                    old_subject["course"],
                    old_subject["branch"],
                    old_subject["semester"],
                )
            )

            new_subject = postgres_conn.execute(
                """
                SELECT id
                FROM subjects
                WHERE subject_code = %s
                LIMIT 1
                """,
                (
                    old_subject["subject_code"],
                )
            ).fetchone()

            if new_subject:

                subject_map[
                    old_subject["id"]
                ] = new_subject["id"]

                subject_count += 1

        postgres_conn.commit()

        print(
            f"   Subjects processed: {subject_count}"
        )

        # ====================================================
        # 5. TEACHER SUBJECTS
        # ====================================================

        print(
            "5/7  Migrating teacher-subject assignments..."
        )

        teacher_subjects = get_sqlite_rows(
            sqlite_cursor,
            "teacher_subjects"
        )

        assignment_count = 0

        for row in teacher_subjects:

            new_teacher_id = teacher_map.get(
                row["teacher_id"]
            )

            new_subject_id = subject_map.get(
                row["subject_id"]
            )

            if not new_teacher_id:
                continue

            if not new_subject_id:
                continue

            postgres_conn.execute(
                """
                INSERT INTO teacher_subjects
                (
                    teacher_id,
                    subject_id
                )
                VALUES
                (%s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    new_teacher_id,
                    new_subject_id,
                )
            )

            assignment_count += 1

        postgres_conn.commit()

        print(
            f"   Assignments processed: "
            f"{assignment_count}"
        )

        # ====================================================
        # 6. ATTENDANCE
        # ====================================================

        print("6/7  Migrating attendance...")

        attendance = get_sqlite_rows(
            sqlite_cursor,
            "attendance"
        )

        attendance_count = 0

        for row in attendance:

            new_student_id = student_map.get(
                row["student_id"]
            )

            new_subject_id = subject_map.get(
                row["subject_id"]
            )

            new_teacher_id = teacher_map.get(
                row["teacher_id"]
            )

            if not new_student_id:
                continue

            if not new_subject_id:
                continue

            if not new_teacher_id:
                continue

            postgres_conn.execute(
                """
                INSERT INTO attendance
                (
                    student_id,
                    subject_id,
                    teacher_id,
                    date,
                    status,
                    marked_at
                )
                VALUES
                (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    new_student_id,
                    new_subject_id,
                    new_teacher_id,
                    row["date"],
                    row["status"],
                    row["marked_at"],
                )
            )

            attendance_count += 1

        postgres_conn.commit()

        print(
            f"   Attendance records processed: "
            f"{attendance_count}"
        )

        # ====================================================
        # 7. ENROLLMENTS
        # ====================================================

        print("7/7  Migrating enrollments...")

        sqlite_tables = {
            row[0]
            for row in sqlite_cursor.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        enrollment_count = 0

        if "enrollments" in sqlite_tables:
            enrollments = get_sqlite_rows(
                sqlite_cursor,
                "enrollments"
            )

            for row in enrollments:
                new_student_id = student_map.get(row["student_id"])
                new_subject_id = subject_map.get(row["subject_id"])

                if not new_student_id or not new_subject_id:
                    continue

                postgres_conn.execute(
                    """
                    INSERT INTO enrollments
                    (
                        student_id,
                        subject_id,
                        status,
                        requested_at,
                        reviewed_at,
                        reviewed_by,
                        rejection_reason
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        new_student_id,
                        new_subject_id,
                        row["status"],
                        row["requested_at"],
                        row["reviewed_at"],
                        row["reviewed_by"],
                        row["rejection_reason"],
                    )
                )

                enrollment_count += 1

            postgres_conn.commit()

        print(
            f"   Enrollment records processed: {enrollment_count}"
        )

        # ====================================================
        # SUCCESS
        # ====================================================

        print()
        print("=" * 65)
        print("              MIGRATION COMPLETED")
        print("=" * 65)
        print()

        print(
            "Original SQLite database: SAFE"
        )

        print(
            "SQLite backup: SAFE"
        )

        print(
            "Supabase existing records: PRESERVED"
        )

        print()
        print(
            "Old SmartCampus data has been processed "
            "for Supabase."
        )
        print()

    except Exception as error:

        postgres_conn.rollback()

        print()
        print("=" * 65)
        print("              MIGRATION FAILED")
        print("=" * 65)
        print()

        print(error)
        print()

        raise

    finally:

        sqlite_cursor.close()
        sqlite_conn.close()

        postgres_conn.close()


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    migrate()