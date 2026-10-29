import os
import sys
import json
import io

# Ensure backend can be imported
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

# Use local SQLite for immediate execution without network timeout
os.environ["DATABASE_URL"] = ""

from app import create_app

def run_tests():
    app = create_app()
    client = app.test_client()

    print("==================================================")
    print("      SMARTCAMPUS VERIFICATION SUITE")
    print("==================================================")

    # --------------------------------------------------------
    # 1. Student Aarav Login & Profile Picture Management
    # --------------------------------------------------------
    print("\n--- 1. Testing Student Login & Profile Picture ---")
    res = client.post("/api/auth/login", json={"username": "aarav", "password": "student123"})
    assert res.status_code == 200, f"Student login failed: {res.data}"
    login_info = json.loads(res.data)
    print(f"[PASS] Student '{login_info['username']}' logged in successfully. Role: {login_info['role']}")

    # Upload avatar (multipart/form-data)
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    res = client.post(
        "/api/profile/picture",
        data={"file": (io.BytesIO(fake_png), "avatar.png")},
        content_type="multipart/form-data"
    )
    assert res.status_code == 200, f"Profile pic upload failed: {res.data}"
    pic_info = json.loads(res.data)
    assert pic_info["success"] is True and pic_info["profile_pic"]
    print(f"[PASS] Profile picture uploaded successfully: {pic_info['profile_pic']}")

    # Verify /api/auth/me reflects the new picture
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    assert json.loads(res.data)["profile_pic"] == pic_info["profile_pic"]
    print("[PASS] /api/auth/me correctly returns uploaded profile picture.")

    # Delete profile picture
    res = client.delete("/api/profile/picture")
    assert res.status_code == 200, f"Profile pic removal failed: {res.data}"
    print("[PASS] Profile picture removed successfully.")

    # Verify /api/auth/me reflects null
    res = client.get("/api/auth/me")
    assert json.loads(res.data)["profile_pic"] is None
    print("[PASS] /api/auth/me verified profile picture is cleared.")

    # --------------------------------------------------------
    # 2. Student Available Subjects & Branch Restrictions
    # --------------------------------------------------------
    print("\n--- 2. Testing Branch Restrictions & Enrollment ---")
    res = client.get("/api/students/available-subjects")
    assert res.status_code == 200
    subj_data = json.loads(res.data)
    student_branch = subj_data["student_branch"]
    print(f"[INFO] Student branch: {student_branch}")

    subjects = subj_data["subjects"]
    cse_subjects = [s for s in subjects if s["branch"].upper() == "CSE"]
    other_subjects = [s for s in subjects if s["branch"].upper() != "CSE"]

    assert len(cse_subjects) > 0, "No CSE subjects found."
    assert len(other_subjects) > 0, "No non-CSE subjects found to test branch protection."

    # Attempt to enroll in non-CSE subject (e.g. History in BA) -> MUST FAIL with 403
    foreign_subj = other_subjects[0]
    print(f"[TEST] Attempting cross-branch enrollment into: {foreign_subj['subject_code']} (Branch: {foreign_subj['branch']})...")
    res = client.post("/api/students/enroll", json={"subject_id": foreign_subj["id"]})
    assert res.status_code == 403, f"Expected 403 Forbidden for cross-branch enrollment, got: {res.status_code} ({res.data})"
    print(f"[PASS] Cross-branch enrollment strictly blocked with 403 Forbidden! Error: {json.loads(res.data)['error']}")

    # Check enrollment status for CSE subject
    target_cse = cse_subjects[0]
    print(f"[TEST] Enrolling in own branch subject: {target_cse['subject_code']} ({target_cse['subject_name']})...")
    res = client.post("/api/students/enroll", json={"subject_id": target_cse["id"]})
    enrollment_id = None
    if res.status_code == 201:
        enrollment_id = json.loads(res.data)["enrollment_id"]
        print(f"[PASS] Successfully submitted enrollment request #{enrollment_id} (pending teacher approval).")
    elif res.status_code == 409:
        print(f"[PASS] Enrollment already exists ({json.loads(res.data)['error']}).")

    # Logout student
    client.post("/api/auth/logout")

    # --------------------------------------------------------
    # 3. Teacher Login, Profile Pic & Subject-Scoped Approvals
    # --------------------------------------------------------
    print("\n--- 3. Testing Teacher Approvals (Subject-Specific Routing) ---")
    res = client.post("/api/auth/login", json={"username": "prof.sharma", "password": "teacher123"})
    assert res.status_code == 200, f"Teacher login failed: {res.data}"
    teacher_login = json.loads(res.data)
    print(f"[PASS] Teacher '{teacher_login['username']}' logged in successfully.")

    # Upload teacher avatar
    res = client.post(
        "/api/profile/picture",
        data={"file": (io.BytesIO(fake_png), "prof_avatar.png")},
        content_type="multipart/form-data"
    )
    assert res.status_code == 200
    teacher_pic = json.loads(res.data)["profile_pic"]
    print(f"[PASS] Teacher profile picture uploaded: {teacher_pic}")

    # Check teacher pending requests (ONLY for subjects taught by prof.sharma)
    res = client.get("/api/teachers/enrollment-requests?status=all")
    assert res.status_code == 200
    t_requests = json.loads(res.data)["requests"]
    print(f"[PASS] Teacher enrollment requests fetched: {len(t_requests)} records.")
    for req in t_requests:
        print(f"       -> Request #{req['id']}: Student: {req['student_name']} ({req['roll_number']}), Subject: {req['subject_code']} - {req['subject_name']}, Status: {req['status']}")

    # If there is a pending request for prof.sharma's subjects, approve it
    pending = [r for r in t_requests if r["status"] == "pending"]
    if pending:
        req_to_approve = pending[0]
        res = client.post(f"/api/teachers/enrollment-requests/{req_to_approve['id']}/approve")
        assert res.status_code == 200, f"Approval failed: {res.data}"
        print(f"[PASS] Teacher successfully approved request #{req_to_approve['id']} for {req_to_approve['subject_code']}!")

    # Verify teacher dashboard stats
    res = client.get("/api/teachers/dashboard-stats")
    assert res.status_code == 200
    stats = json.loads(res.data)
    print(f"[PASS] Teacher dashboard stats: Subjects: {stats['subjects_count']}, Students: {stats['total_students']}, Pending: {stats['pending_approvals_count']}")

    # Teacher direct add student by roll number
    t_subs = json.loads(client.get("/api/teachers/subjects").data)
    test_sub_id = t_subs[0]["id"]
    print(f"[TEST] Teacher directly adding student by roll number (CSE-2023-001) to subject {test_sub_id}...")
    res = client.post(f"/api/teachers/subjects/{test_sub_id}/students/add", json={"roll_number": "CSE-2023-001"})
    assert res.status_code == 200, f"Teacher add by roll failed: {res.data}"
    added_info = json.loads(res.data)
    aarav_sid = added_info["student_id"]
    print(f"[PASS] Teacher directly enrolled student: {added_info['message']}")

    # Teacher removes student from subject
    print("[TEST] Teacher removing student from subject...")
    res = client.post(f"/api/teachers/subjects/{test_sub_id}/students/{aarav_sid}/remove")
    assert res.status_code == 200, f"Teacher remove student failed: {res.data}"
    print(f"[PASS] Teacher successfully removed student: {json.loads(res.data)['message']}")

    # Re-add student for clean state
    client.post(f"/api/teachers/subjects/{test_sub_id}/students/add", json={"roll_number": "CSE-2023-001"})

    # Logout teacher
    client.post("/api/auth/logout")

    # --------------------------------------------------------
    # 4. Admin Full Access & System Management
    # --------------------------------------------------------
    print("\n--- 4. Testing Admin Global Access & Controls ---")
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200, f"Admin login failed: {res.data}"
    admin_login = json.loads(res.data)
    print(f"[PASS] Admin '{admin_login['username']}' logged in successfully.")

    # Upload admin avatar
    res = client.post(
        "/api/profile/picture",
        data={"file": (io.BytesIO(fake_png), "admin_avatar.png")},
        content_type="multipart/form-data"
    )
    assert res.status_code == 200
    print(f"[PASS] Admin profile picture uploaded.")

    # Admin stats
    res = client.get("/api/admin/stats")
    assert res.status_code == 200
    admin_stats = json.loads(res.data)
    print(f"[PASS] Admin global stats: {admin_stats}")

    # Admin global enrollments
    res = client.get("/api/admin/enrollments")
    assert res.status_code == 200
    all_enrollments = json.loads(res.data)["enrollments"]
    print(f"[PASS] Admin viewed all system enrollments: {len(all_enrollments)} records.")

    # Admin: Create New Subject
    print("[TEST] Admin creating new subject (CS399 - Cloud Computing)...")
    res = client.post("/api/admin/subjects", json={
        "subject_code": "CS399",
        "subject_name": "Cloud Computing",
        "course": "B.Tech",
        "branch": "CSE",
        "semester": 4
    })
    assert res.status_code == 201, f"Admin create subject failed: {res.data}"
    new_sub_id = json.loads(res.data)["subject_id"]
    print(f"[PASS] Admin created subject CS399 with ID: {new_sub_id}")

    # Admin: Create New Teacher
    print("[TEST] Admin creating new faculty member (Dr. Mehta)...")
    res = client.post("/api/admin/teachers", json={
        "full_name": "Dr. Rohit Mehta",
        "employee_id": "EMP-999",
        "department": "Computer Science",
        "username": "rohit.mehta",
        "email": "rohit.mehta@smartcampus.edu",
        "password": "teacher123",
        "phone": "9998887776"
    })
    assert res.status_code == 201, f"Admin create teacher failed: {res.data}"
    new_teacher_id = json.loads(res.data)["teacher_id"]
    print(f"[PASS] Admin created teacher with ID: {new_teacher_id}")

    # Admin: Assign Teacher to Subject
    print("[TEST] Admin assigning teacher to new subject...")
    res = client.post(f"/api/admin/subjects/{new_sub_id}/assign-teacher", json={"teacher_id": new_teacher_id})
    assert res.status_code == 200, f"Assign teacher failed: {res.data}"
    print(f"[PASS] Admin assigned teacher to subject successfully.")

    # Admin: Create New Student
    print("[TEST] Admin creating new student (Sneha Rao)...")
    res = client.post("/api/admin/students", json={
        "full_name": "Sneha Rao",
        "roll_number": "CSE-2023-099",
        "branch": "CSE",
        "course": "B.Tech",
        "semester": 4,
        "username": "sneha.rao",
        "email": "sneha@smartcampus.edu",
        "password": "student123",
        "phone": "9876500000"
    })
    assert res.status_code == 201, f"Admin create student failed: {res.data}"
    new_student_id = json.loads(res.data)["student_id"]
    print(f"[PASS] Admin created student with ID: {new_student_id}")

    # Admin: Direct Enroll Student
    print("[TEST] Admin direct enrolling student into CS399...")
    res = client.post("/api/admin/enroll-student", json={
        "roll_number": "CSE-2023-099",
        "subject_id": new_sub_id
    })
    assert res.status_code == 200, f"Admin direct enroll failed: {res.data}"
    print(f"[PASS] Admin enrolled student into subject: {json.loads(res.data)['message']}")

    # Admin: Clean up test records (Delete Student, Delete Teacher, Delete Subject)
    print("[TEST] Admin deleting test records to keep database clean...")
    assert client.delete(f"/api/admin/students/{new_student_id}").status_code == 200
    assert client.delete(f"/api/admin/teachers/{new_teacher_id}").status_code == 200
    assert client.delete(f"/api/admin/subjects/{new_sub_id}").status_code == 200
    print("[PASS] Admin delete student, teacher, and subject all completed successfully!")

    # --------------------------------------------------------
    # 5. Teacher Enrolls Unregistered Student & Auto-Sync on Registration
    # --------------------------------------------------------
    print("\n--- 5. Testing Teacher Direct Enrollment of Unregistered Student & Auto-Sync ---")
    client.post("/api/auth/logout")

    # Clean up any leftover test records for full repeatability
    from db import execute
    execute("DELETE FROM attendance WHERE student_id IN (SELECT id FROM students WHERE roll_number = ?)", ("CSE-2023-777",))
    execute("DELETE FROM enrollments WHERE student_id IN (SELECT id FROM students WHERE roll_number = ?)", ("CSE-2023-777",))
    execute("DELETE FROM users WHERE username = ?", ("karan.verma",))
    execute("DELETE FROM students WHERE roll_number = ?", ("CSE-2023-777",))

    # A. Teacher login
    res = client.post("/api/auth/login", json={"username": "prof.sharma", "password": "teacher123"})
    assert res.status_code == 200

    # Get teacher's subjects
    res = client.get("/api/teachers/subjects")
    assert res.status_code == 200
    my_subs = json.loads(res.data)
    target_subject_id = my_subs[0]["id"]
    target_subject_code = my_subs[0]["subject_code"]
    print(f"[INFO] Teacher using subject {target_subject_code} (ID: {target_subject_id})")

    # B. Teacher directly enrolls an unregistered student using only Roll Number & Full Name
    unreg_roll = "CSE-2023-777"
    unreg_name = "Karan Verma"
    print(f"[TEST] Teacher enrolling unregistered student {unreg_name} ({unreg_roll})...")
    res = client.post(f"/api/teachers/subjects/{target_subject_id}/students/add", json={
        "roll_number": unreg_roll,
        "full_name": unreg_name
    })
    assert res.status_code == 200, f"Enroll failed: {res.data}"
    enroll_info = json.loads(res.data)
    karan_student_id = enroll_info["student_id"]
    print(f"[PASS] Unregistered student enrolled! Student ID: {karan_student_id}, Message: {enroll_info['message']}")

    # C. Verify student appears in subject students list
    res = client.get(f"/api/teachers/subjects/{target_subject_id}/students")
    assert res.status_code == 200
    sub_students = json.loads(res.data)["students"]
    matching = [s for s in sub_students if s["roll_number"] == unreg_roll]
    assert len(matching) > 0, "Student not found in subject roster!"
    print(f"[PASS] Student '{matching[0]['full_name']}' confirmed in teacher's subject roster!")

    # D. Teacher marks attendance for Karan Verma
    print("[TEST] Teacher marking attendance for unregistered student Karan Verma...")
    res = client.post("/api/attendance/mark", json={
        "subject_id": target_subject_id,
        "date": "2026-10-15",
        "records": [
            {"student_id": karan_student_id, "status": "Present"}
        ]
    })
    assert res.status_code == 200, f"Attendance mark failed: {res.data}"
    print(f"[PASS] Attendance marked: {json.loads(res.data)['message']}")

    # Teacher logs out
    client.post("/api/auth/logout")

    # E. Karan Verma creates account on the portal using his roll number
    print("[TEST] Student Karan Verma registers his account on the portal with roll number CSE-2023-777...")
    res = client.post("/api/auth/register", json={
        "role": "student",
        "username": "karan.verma",
        "email": "karan.verma@smartcampus.edu",
        "password": "student123",
        "full_name": unreg_name,
        "roll_number": unreg_roll,
        "course": "B.Tech",
        "branch": "CSE",
        "semester": 3,
        "phone": "9876543210"
    })
    assert res.status_code == 201, f"Registration failed: {res.data}"
    print(f"[PASS] Registration succeeded and seamlessly linked to existing profile!")

    # F. Karan Verma logs into his student dashboard
    print("[TEST] Student Karan Verma logging into portal...")
    res = client.post("/api/auth/login", json={"username": "karan.verma", "password": "student123"})
    assert res.status_code == 200, f"Karan login failed: {res.data}"

    # Check dashboard
    res = client.get("/api/students/dashboard")
    assert res.status_code == 200, f"Get dashboard failed: {res.data}"
    dash_data = json.loads(res.data)
    assert dash_data["success"] is True

    # Verify enrolled subjects & attendance
    subjects_list = dash_data.get("subjects", [])
    sub_att = [a for a in subjects_list if a.get("subject_id") == target_subject_id]
    assert len(sub_att) > 0, f"Enrolled subject not found in Karan's dashboard subjects: {dash_data}"
    karan_subject_stat = sub_att[0]
    print(f"[PASS] Karan's Dashboard verified: Subject: {karan_subject_stat.get('subject_name')}, Total: {karan_subject_stat.get('total')}, Attended: {karan_subject_stat.get('attended')}, Percentage: {karan_subject_stat.get('percentage')}%")
    assert karan_subject_stat.get("attended") == 1
    assert karan_subject_stat.get("percentage") == 100.0

    # G. Clean up test user & student
    client.post("/api/auth/logout")
    # Admin login to clean up Karan
    client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    res = client.delete(f"/api/admin/students/{karan_student_id}")
    assert res.status_code == 200
    print("[PASS] Test student Karan cleaned up cleanly.")
    client.post("/api/auth/logout")

    print("\n==================================================")
    print("  ALL REQUIREMENTS FULLY TESTED AND VERIFIED! ***")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
