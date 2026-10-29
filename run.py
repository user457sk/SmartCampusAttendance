"""
run.py
------
Root runner for SmartCampus.
Allows running the server with:
    python run.py
from the project root directory.
"""

import os
import sys

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

if __name__ == "__main__":
    from app import create_app
    from config import PORT, DEBUG, SMARTCAMPUS_ENV

    app = create_app()
    port = int(os.environ.get("PORT", PORT))

    print("==================================================")
    print("       SMARTCAMPUS SYSTEM RUNNING")
    print("==================================================")
    print(f" Local URL:    http://127.0.0.1:{port}")
    print(f" Health Check: http://127.0.0.1:{port}/health")
    print(f" Environment:  {SMARTCAMPUS_ENV}")
    print("==================================================")
    print(" Press CTRL+C to stop the server.\n")

    app.run(
        host="0.0.0.0",
        port=port,
        debug=DEBUG,
    )
