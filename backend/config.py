import os
from dotenv import load_dotenv

# Project root directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from project root
ENV_FILE = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_FILE)

# Server
PORT = int(os.environ.get("PORT", "5000"))

# Database
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

# Initial administrator credentials must be provided outside source control.
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "user457sk@gmail.com").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD must be configured in the environment.")

# Database schema
SCHEMA_PATH = os.path.join(BASE_DIR, "database", "database.sql")

# Frontend
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
UPLOAD_DIR = os.path.join(FRONTEND_DIR, "uploads", "avatars")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Secret key
SECRET_KEY = os.environ.get(
    "SMARTCAMPUS_SECRET",
    "smartcampus-dev-secret-change-me"
)

# Session lifetime: 8 hours
SESSION_LIFETIME = 60 * 60 * 8

# Environment
SMARTCAMPUS_ENV = os.environ.get(
    "SMARTCAMPUS_ENV", "development"
).strip().lower()

# Debug mode
DEBUG = os.environ.get("DEBUG", "1").strip() == "1"

# Production checks
if SMARTCAMPUS_ENV == "production":
    DEBUG = False

    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured.")

    if SECRET_KEY == "smartcampus-dev-secret-change-me":
        raise RuntimeError(
            "SMARTCAMPUS_SECRET must be changed in production."
        )
