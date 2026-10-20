"""user.py – database logic for the `users` table (authentication records)."""

from db import query, execute
from auth import hash_password


def create_user(username, email, password, role, account_status="approved"):
    """Insert a new user and return its id. Password is hashed first."""
    return execute(
        "INSERT INTO users (username, email, password_hash, role, account_status) VALUES (?,?,?,?,?)",
        (username, email, hash_password(password), role, account_status),
    )


def get_user_by_username(username):
    return query("SELECT * FROM users WHERE username = ?", (username,), one=True)


def get_user_by_email(email):
    return query("SELECT * FROM users WHERE email = ?", (email,), one=True)


def get_user_by_id(user_id):
    return query("SELECT * FROM users WHERE id = ?", (user_id,), one=True)


def get_pending_users(role=None):
    sql = """
        SELECT u.id, u.username, u.email, u.role, u.created_at,
               COALESCE(s.full_name, t.full_name) AS full_name,
               s.roll_number, s.branch
        FROM users u
        LEFT JOIN students s ON s.user_id = u.id
        LEFT JOIN teachers t ON t.user_id = u.id
        WHERE u.account_status = 'pending'
    """
    params = ()
    if role:
        sql += " AND u.role = ?"
        params = (role,)
    return query(sql + " ORDER BY u.created_at", params)


def update_account_status(user_id, status):
    return execute(
        "UPDATE users SET account_status = ? WHERE id = ? AND account_status = 'pending'",
        (status, user_id),
    )


def update_profile_pic(user_id, profile_pic_url):
    return execute("UPDATE users SET profile_pic = ? WHERE id = ?", (profile_pic_url, user_id))


def remove_profile_pic(user_id):
    return execute("UPDATE users SET profile_pic = NULL WHERE id = ?", (user_id,))
