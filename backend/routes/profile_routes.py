"""
profile_routes.py
-----------------
API endpoints for managing user profile picture:
- POST   /api/profile/picture   -> Upload or update profile picture
- DELETE /api/profile/picture   -> Remove profile picture
"""

import os
import time
import base64
from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from auth import login_required, current_user_id
from config import UPLOAD_DIR
from models import user as user_model

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@profile_bp.route("/picture", methods=["POST"])
@login_required
def upload_picture():
    user_id = current_user_id()
    user = user_model.get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found."}), 404

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_to_save = None
    file_ext = "png"

    # 1. Handle multipart/form-data file upload
    if "picture" in request.files or "file" in request.files:
        upload = request.files.get("picture") or request.files.get("file")
        if upload and upload.filename:
            if not allowed_file(upload.filename):
                return jsonify({"error": "Invalid image format. Allowed: JPG, PNG, WEBP, GIF."}), 400
            file_ext = upload.filename.rsplit(".", 1)[1].lower()
            file_to_save = upload

    # 2. Handle Base64 Data URL (fallback)
    elif request.is_json:
        data = request.get_json(silent=True) or {}
        picture_data = data.get("picture_data") or data.get("image")
        if picture_data and ";base64," in picture_data:
            header, encoded = picture_data.split(";base64,", 1)
            if "jpeg" in header or "jpg" in header:
                file_ext = "jpg"
            elif "webp" in header:
                file_ext = "webp"
            elif "gif" in header:
                file_ext = "gif"
            else:
                file_ext = "png"
            try:
                decoded_bytes = base64.b64decode(encoded)
                filename = f"user_{user_id}_{int(time.time())}.{file_ext}"
                filepath = os.path.join(UPLOAD_DIR, filename)
                with open(filepath, "wb") as f:
                    f.write(decoded_bytes)
                web_url = f"/uploads/avatars/{filename}"
                _cleanup_old_avatar(user.get("profile_pic"))
                user_model.update_profile_pic(user_id, web_url)
                return jsonify({
                    "success": True,
                    "message": "Profile picture updated successfully.",
                    "profile_pic": web_url,
                })
            except Exception as e:
                return jsonify({"error": f"Failed to process image: {str(e)}"}), 400

    if not file_to_save:
        return jsonify({"error": "No image file provided."}), 400

    filename = f"user_{user_id}_{int(time.time())}.{file_ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    try:
        file_to_save.save(filepath)
    except Exception as e:
        return jsonify({"error": f"Failed to save image: {str(e)}"}), 500

    # Delete previous picture file if exists
    _cleanup_old_avatar(user.get("profile_pic"))

    web_url = f"/uploads/avatars/{filename}"
    user_model.update_profile_pic(user_id, web_url)

    return jsonify({
        "success": True,
        "message": "Profile picture updated successfully.",
        "profile_pic": web_url,
    })


@profile_bp.route("/picture", methods=["DELETE"])
@login_required
def remove_picture():
    user_id = current_user_id()
    user = user_model.get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found."}), 404

    _cleanup_old_avatar(user.get("profile_pic"))
    user_model.remove_profile_pic(user_id)

    return jsonify({
        "success": True,
        "message": "Profile picture removed successfully.",
        "profile_pic": None,
    })


def _cleanup_old_avatar(old_pic_path):
    """Remove previous avatar from filesystem if safe."""
    if not old_pic_path:
        return
    try:
        # e.g. /uploads/avatars/user_1_123.png -> extract user_1_123.png
        basename = os.path.basename(old_pic_path)
        disk_path = os.path.join(UPLOAD_DIR, basename)
        if os.path.isfile(disk_path):
            os.remove(disk_path)
    except Exception:
        pass
