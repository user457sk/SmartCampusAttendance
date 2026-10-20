"""
db.py
-----
SmartCampus database helpers.

Supports:
- PostgreSQL / Supabase
- SQLite (automatic fallback when PostgreSQL is unavailable or unconfigured)

This file handles:
- Connection management
- SELECT queries
- INSERT / UPDATE / DELETE
- Flask request database connection
- Database initialization & migrations (profile_pic, enrollments)
- Administrator account initialization
"""

import os
import sqlite3
import psycopg
from psycopg.rows import dict_row
from flask import g, has_app_context
from werkzeug.security import generate_password_hash

from config import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    DATABASE_URL,
    SCHEMA_PATH,
    BASE_DIR,
    SMARTCAMPUS_ENV,
)

SQLITE_DB_PATH = os.path.join(BASE_DIR, "database", "smartcampus.db")
_ENGINE = None  # "postgres" or "sqlite"


def get_engine():
    """Determine whether to use PostgreSQL or SQLite fallback."""
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE

    if DATABASE_URL:
        try:
            conn = psycopg.connect(
                DATABASE_URL,
                row_factory=dict_row,
                sslmode="require",
                connect_timeout=3,
            )
            conn.close()
            _ENGINE = "postgres"
            return _ENGINE
        except Exception as e:
            print(f"[SmartCampus DB] PostgreSQL connection error ({e}).")
            if SMARTCAMPUS_ENV == "production":
                raise RuntimeError(
                    "PostgreSQL connection failed in production; "
                    "refusing to fall back to local SQLite."
                ) from e
            print(f"[SmartCampus DB] Falling back to local SQLite: {SQLITE_DB_PATH}")

    _ENGINE = "sqlite"
    return _ENGINE


# ============================================================
# REQUEST DATABASE CONNECTION
# ============================================================

def get_db():
    """Get a database connection (manages Flask g context or direct standalone)."""
    if has_app_context():
        if "db" not in g:
            engine = get_engine()
            if engine == "postgres":
                g.db = psycopg.connect(
                    DATABASE_URL,
                    row_factory=dict_row,
                    sslmode="require",
                )
                g.db_engine = "postgres"
            else:
                conn = sqlite3.connect(SQLITE_DB_PATH)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA foreign_keys = ON")
                g.db = conn
                g.db_engine = "sqlite"
        return g.db
    else:
        engine = get_engine()
        if engine == "postgres":
            return psycopg.connect(
                DATABASE_URL,
                row_factory=dict_row,
                sslmode="require",
            )
        else:
            conn = sqlite3.connect(SQLITE_DB_PATH)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            return conn


# ============================================================
# CLOSE REQUEST CONNECTION
# ============================================================

def close_db(exception=None):
    """Close the request database connection."""
    if has_app_context():
        db = g.pop("db", None)
        if db is not None:
            db.close()


# ============================================================
# SQL PREPARATION
# ============================================================

def _prepare_sql(sql, engine="postgres"):
    """Normalize placeholders: convert ? to %s for PostgreSQL, or %s to ? for SQLite."""
    if engine == "postgres":
        return sql.replace("?", "%s")
    else:
        return sql.replace("%s", "?")


# ============================================================
# SELECT
# ============================================================

def query(sql, params=(), one=False):
    """Execute SELECT query."""
    outside = not has_app_context()
    db = get_db()
    engine = getattr(g, "db_engine", get_engine()) if has_app_context() else get_engine()

    try:
        prepared_sql = _prepare_sql(sql, engine)
        if engine == "postgres":
            with db.cursor() as cursor:
                cursor.execute(prepared_sql, params)
                rows = cursor.fetchall()
            if one:
                return rows[0] if rows else None
            return rows
        else:
            cursor = db.cursor()
            cursor.execute(prepared_sql, params)
            raw_rows = cursor.fetchall()
            rows = [dict(r) for r in raw_rows]
            cursor.close()
            if one:
                return rows[0] if rows else None
            return rows
    finally:
        if outside:
            db.close()


# ============================================================
# INSERT / UPDATE / DELETE
# ============================================================

def execute(sql, params=()):
    """Execute INSERT / UPDATE / DELETE."""
    outside = not has_app_context()
    db = get_db()
    engine = getattr(g, "db_engine", get_engine()) if has_app_context() else get_engine()

    try:
        prepared_sql = _prepare_sql(sql, engine)
        if engine == "postgres":
            is_insert = prepared_sql.lstrip().upper().startswith("INSERT")
            with db.cursor() as cursor:
                if is_insert:
                    if "RETURNING" not in prepared_sql.upper():
                        prepared_sql = prepared_sql.rstrip()
                        if prepared_sql.endswith(";"):
                            prepared_sql = prepared_sql[:-1]
                        prepared_sql += " RETURNING id"

                    cursor.execute(prepared_sql, params)
                    row = cursor.fetchone()
                    db.commit()
                    return row["id"] if row else None

                cursor.execute(prepared_sql, params)
            db.commit()
            return None
        else:
            cursor = db.cursor()
            is_insert = prepared_sql.lstrip().upper().startswith("INSERT")
            cursor.execute(prepared_sql, params)
            last_id = cursor.lastrowid if is_insert else None
            db.commit()
            cursor.close()
            return last_id
    finally:
        if outside:
            db.close()


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

def init_db():
    """Create database tables, run migrations, and initialize the administrator."""
    engine = get_engine()

    if engine == "postgres":
        with open(SCHEMA_PATH, "r", encoding="utf-8") as file:
            schema = file.read()

        with psycopg.connect(
            DATABASE_URL,
            row_factory=dict_row,
            sslmode="require",
        ) as connection:
            try:
                with connection.cursor() as cursor:
                    statements = [
                        s.strip() for s in schema.split(";") if s.strip()
                    ]
                    for statement in statements:
                        cursor.execute(statement)
                connection.commit()
            except Exception:
                connection.rollback()
                raise

            ensure_admin_account(connection)
    else:
        init_sqlite_db()


def init_sqlite_db():
    """Ensure SQLite tables, migrations, and administrator account."""
    os.makedirs(os.path.dirname(SQLITE_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF")
    c = conn.cursor()

    # Users table
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(120) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(10) NOT NULL CHECK (role IN ('student','teacher','admin')),
        profile_pic TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Check columns in users
    user_cols = [r[1] for r in c.execute("PRAGMA table_info(users)").fetchall()]
    if "profile_pic" not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN profile_pic TEXT")
    if "account_status" not in user_cols:
        c.execute(
            "ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NOT NULL "
            "DEFAULT 'approved' CHECK (account_status IN ('pending', 'approved', 'rejected'))"
        )

    # Students table
    c.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        roll_number VARCHAR(20) NOT NULL UNIQUE,
        full_name VARCHAR(100) NOT NULL,
        course VARCHAR(50) NOT NULL,
        branch VARCHAR(50) NOT NULL,
        semester INTEGER NOT NULL DEFAULT 1,
        phone VARCHAR(20),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Teachers table
    c.execute("""
    CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        full_name VARCHAR(100) NOT NULL,
        department VARCHAR(50) NOT NULL,
        employee_id VARCHAR(20) NOT NULL UNIQUE,
        phone VARCHAR(20),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Subjects table
    c.execute("""
    CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_code VARCHAR(20) NOT NULL UNIQUE,
        subject_name VARCHAR(100) NOT NULL,
        course VARCHAR(50) NOT NULL,
        branch VARCHAR(50) NOT NULL,
        semester INTEGER NOT NULL DEFAULT 1
    )
    """)

    # Teacher subjects table
    c.execute("""
    CREATE TABLE IF NOT EXISTS teacher_subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        UNIQUE (teacher_id, subject_id),
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
    """)

    # Attendance table
    c.execute("""
    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        date DATE NOT NULL,
        status VARCHAR(10) NOT NULL CHECK (status IN ('Present','Absent')),
        marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (student_id, subject_id, date),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
    """)

    # Enrollments table
    c.execute("""
    CREATE TABLE IF NOT EXISTS enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER,
        rejection_reason TEXT,
        UNIQUE (student_id, subject_id),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
    """)

    # Auto-seed existing attendance into approved enrollments
    c.execute("""
    INSERT OR IGNORE INTO enrollments (student_id, subject_id, status, requested_at, reviewed_at, reviewed_by)
    SELECT DISTINCT a.student_id, a.subject_id, 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, a.teacher_id
    FROM attendance a
    """)

    # Ensure the configured administrator exists and migrate the old demo login.
    c.execute("SELECT id, email FROM users WHERE username = ?", (ADMIN_USERNAME,))
    admin_user = c.fetchone()
    if not admin_user:
        c.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (ADMIN_USERNAME, ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD), "admin")
        )
    elif admin_user[1] != ADMIN_EMAIL:
        c.execute(
            "UPDATE users SET email = ?, password_hash = ?, account_status = 'approved' WHERE id = ?",
            (ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD), admin_user[0])
        )
    else:
        c.execute(
            "UPDATE users SET account_status = 'approved' WHERE id = ?",
            (admin_user[0],)
        )

    conn.commit()
    conn.close()


# ============================================================
# POSTGRES ADMIN ACCOUNT
# ============================================================

def ensure_admin_account(connection):
    """Create or migrate the configured administrator in PostgreSQL."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, email FROM users WHERE username = %s",
                (ADMIN_USERNAME,)
            )
            admin_user = cursor.fetchone()
            if admin_user is None:
                cursor.execute(
                    "INSERT INTO users (username, email, password_hash, role) VALUES (%s, %s, %s, %s)",
                    (ADMIN_USERNAME, ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD), "admin")
                )
            elif admin_user["email"] != ADMIN_EMAIL:
                cursor.execute(
                    "UPDATE users SET email = %s, password_hash = %s, account_status = 'approved' WHERE id = %s",
                    (ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD), admin_user["id"])
                )
            else:
                cursor.execute(
                    "UPDATE users SET account_status = 'approved' WHERE id = %s",
                    (admin_user["id"],)
                )

        connection.commit()
    except Exception:
        connection.rollback()
        raise