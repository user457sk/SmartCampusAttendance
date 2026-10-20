# 🎓 SmartCampus – Student Attendance Management System

A complete, modern, responsive and **fully runnable** attendance management system.
Teachers log in and manage attendance **only for the subjects assigned to them**, while
students view their **own** attendance records and percentages.

Built with a beginner-friendly **Flask (Python)** backend, a **relational SQLite**
database, and a clean **HTML5 / CSS3 / JavaScript** frontend.

---

## ✨ Features

| Student module | Teacher module |
| --- | --- |
| Registration & login | Registration & login |
| Dashboard with statistics | Dashboard with statistics |
| Profile information | Profile information |
| Subject-wise attendance | Subject management (add / assign / remove) |
| Date-wise attendance | Mark attendance (Present / Absent) |
| Monthly attendance | Edit attendance |
| Overall attendance % | Attendance history |
| Visual progress bars | Subject-wise & date-wise reports |

**Attendance percentage formula:** `(Classes Attended / Total Classes) × 100`

---

## 🗂️ Project Structure

```
SmartCampus/
│
├── frontend/                 # All static HTML/CSS/JS (served by Flask)
│   ├── index.html            # Landing / home page
│   ├── login.html            # Student (and general) login
│   ├── register.html         # Registration (student or teacher)
│   ├── student/
│   │   ├── dashboard.html
│   │   ├── attendance.html
│   │   ├── subject-attendance.html
│   │   └── monthly-attendance.html
│   ├── teacher/
│   │   ├── login.html
│   │   ├── dashboard.html
│   │   ├── subjects.html
│   │   ├── mark-attendance.html
│   │   └── attendance-history.html
│   ├── css/
│   │   ├── style.css         # Global styles (nav, hero, cards, forms)
│   │   ├── login.css         # Auth pages
│   │   ├── student.css       # Student dashboard layout
│   │   └── teacher.css       # Teacher dashboard layout
│   └── js/
│       ├── script.js         # Shared helpers (api, auth guard, etc.)
│       ├── login.js          # Login + register logic
│       ├── student.js        # Student pages logic
│       └── teacher.js        # Teacher pages logic
│
├── backend/                  # Flask application
│   ├── app.py                # Entry point (run this)
│   ├── config.py             # Settings (paths, secret key)
│   ├── db.py                 # DB connection + schema init + seed data
│   ├── auth.py               # Hashing, sessions, role guards, validation
│   ├── models/               # Database logic per entity
│   │   ├── user.py
│   │   ├── student.py
│   │   ├── teacher.py
│   │   ├── subject.py
│   │   └── attendance.py
│   └── routes/               # API endpoints (Flask blueprints)
│       ├── auth_routes.py
│       ├── student_routes.py
│       ├── teacher_routes.py
│       └── attendance_routes.py
│
├── database/
│   ├── database.sql          # Full schema (tables, keys, indexes)
│   └── smartcampus.db        # Created automatically on first run
│
├── requirements.txt
└── README.md
```

---

## 🚀 How to Run

### 1. Install dependencies
```bash
pip install -r requirements.txt
```
> Requires Python 3.8+ and Flask. The database uses Python's built-in `sqlite3`,
> so **no database server is needed**.

### 2. Start the backend
```bash
cd backend
python app.py
```
On the first run the app automatically:
* creates `database/smartcampus.db`
* builds all tables from `database/database.sql`
* creates the configured administrator account

### 3. Open the app
Visit **http://localhost:5000** in your browser.

---

## ☁️ Deploy to Render + Supabase

The repository includes a Render Blueprint (`render.yaml`). The app requires
PostgreSQL in production; it will refuse to silently use local SQLite if the
database connection fails.

1. Create a Supabase project and copy its PostgreSQL connection URI. Prefer the
   **Session pooler** URI if the direct connection is not reachable from Render.
2. In Supabase, keep the database password private. Do not commit it or paste it
   into chat.
3. Push this repository to GitHub, then in Render choose **New > Blueprint** and
   select the repository. Render reads `render.yaml` and prompts for
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `DATABASE_URL`. Enter those values in
   Render's private environment-variable form. `SMARTCAMPUS_SECRET` is generated
   automatically.
4. Deploy and wait for `/health` to report `status: ok`. The first service start
   creates the PostgreSQL schema and configured administrator account.
5. To migrate existing local SQLite records, first ensure the service has
   initialized the Supabase schema. On your computer, set `DATABASE_URL` in the
   root `.env` to the same Supabase URI, then run:

   ```powershell
   pip install -r requirements.txt
   python backend/migrate_sqlite_to_supabase.py
   ```

   The migration leaves the local SQLite database unchanged and is safe to
   rerun. It transfers user, student, teacher, subject, assignment, attendance,
   and enrollment records. Profile image files are not transferred; Render's
   default filesystem is temporary, so uploaded avatars need persistent storage
   configured separately if they must survive redeploys.

Never put `.env` or database credentials in GitHub. Change the administrator
password in Render's environment settings if you ever need to rotate it.

---

## 🔑 Administrator and registration approval

The initial administrator username is `admin` and the account email is
`user457sk@gmail.com`. The initial password is `admin@457`; set `ADMIN_USERNAME`,
`ADMIN_EMAIL`, and `ADMIN_PASSWORD` environment variables before deployment to
choose your own values. The administrator password is stored as a hash.

New student and teacher registrations start in a pending state and cannot log in
until approved. Administrators can approve students and teachers; teachers can
approve student registrations from **Student Approvals**.

---

## 🗄️ Database Design

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Authentication and approval state | `id` (PK), `username`, `email`, `password_hash`, `role`, `account_status` |
| `students` | Student profile | `id` (PK), `user_id` (FK→users), `roll_number`, `course`, `branch`, `semester` |
| `teachers` | Teacher profile | `id` (PK), `user_id` (FK→users), `department`, `employee_id` |
| `subjects` | Subjects offered | `id` (PK), `subject_code`, `course`, `branch`, `semester` |
| `teacher_subjects` | Which teacher teaches which subject | `teacher_id` (FK), `subject_id` (FK), UNIQUE pair |
| `attendance` | One row per student/subject/date | `student_id`, `subject_id`, `teacher_id`, `date`, `status`, **UNIQUE(student, subject, date)** |

The `UNIQUE (student_id, subject_id, date)` constraint guarantees **no duplicate
attendance** for the same student, subject and date.

---

## 🔐 Security

* **Password hashing** with `werkzeug` PBKDF2 — plain passwords are never stored.
* **Session management** via signed cookies.
* **Role-based access** — every API route is guarded by `@role_required('student' | 'teacher')`.
* **Ownership checks** — a teacher can only manage subjects assigned to them
  (`teacher_owns_subject`), and a student can only read their own records.
* **Input validation** on every registration / attendance request.
* **Duplicate protection** enforced at the database level.

---

## 🔌 API Overview

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | Submit student/teacher account for approval |
| GET | `/api/admin/registrations` | admin | List pending registrations |
| POST | `/api/admin/registrations/<id>/approve` | admin | Approve a registration |
| GET | `/api/teachers/student-registrations` | teacher | List pending student registrations |
| POST | `/api/teachers/student-registrations/<id>/approve` | teacher | Approve a student registration |
| POST | `/api/auth/login` | public | Log in |
| POST | `/api/auth/logout` | any | Log out |
| GET | `/api/auth/me` | any | Current user |
| GET | `/api/student/dashboard` | student | Dashboard statistics |
| GET | `/api/student/attendance` | student | Date-wise records |
| GET | `/api/student/subject-attendance` | student | Subject-wise summary |
| GET | `/api/student/monthly-attendance` | student | Month-wise summary |
| GET | `/api/teacher/subjects` | teacher | My subjects |
| POST | `/api/teacher/subjects` | teacher | Create + assign subject |
| POST | `/api/teacher/subjects/assign` | teacher | Assign existing subject |
| DELETE | `/api/teacher/subjects/<id>` | teacher | Remove my subject |
| GET | `/api/teacher/subjects/<id>/students` | teacher | Students in the class |
| GET | `/api/teacher/subjects/<id>/history` | teacher | Attendance history |
| GET | `/api/teacher/subjects/<id>/report` | teacher | Per-student report |
| POST | `/api/attendance/mark` | teacher | Save/update attendance |
| GET | `/api/attendance/subject/<id>/date/<date>` | teacher | Existing records for a date |

---

## 🧪 Quick Test (after starting the server)

```bash
# Login as teacher
curl -c cookies.txt -X POST localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"your-approved-teacher-username","password":"your-password"}'

# Mark attendance
curl -b cookies.txt -X POST localhost:5000/api/attendance/mark \
     -H "Content-Type: application/json" \
     -d '{"subject_id":1,"date":"2025-01-15","records":[{"student_id":1,"status":"Present"}]}'
```

---

## 📱 Responsive Design

The UI adapts to **mobile, tablet and desktop** using CSS media queries, a collapsible
navigation bar on the landing page and a slide-in sidebar on the dashboards.

---

## 📄 License

This project is provided for educational purposes. Free to use and modify.
