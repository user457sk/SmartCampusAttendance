/* ============================================================
   admin.js – Powers the Administrator Control Center
   Full control: Subjects, Teachers, Students, Enrollments
   ============================================================ */

let adminUser = null;
let allEnrollmentsList = [];
let cachedTeachersList = [];
let cachedSubjectsList = [];
let currentEnrollmentFilter = "pending";

document.addEventListener("DOMContentLoaded", async () => {
    adminUser = await requireRole("admin");
    if (!adminUser) return;

    markActiveNav();
    renderTopBarUser(adminUser);

    const emailEl = document.getElementById("adminEmail");
    if (emailEl && adminUser.email) {
        emailEl.textContent = adminUser.email;
    }

    // Profile picture manager for admin
    setupProfilePicManager({
        containerId: "adminProfilePicContainer",
        fallbackInitial: "A",
        currentPic: adminUser.profile_pic,
        onUpdate: (newPic) => {
            adminUser.profile_pic = newPic;
            renderTopBarUser(adminUser);
        }
    });

    initAdminForms();
    await loadAdminDashboard();
});

// Modal helpers
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = "flex";
        populateModalDropdowns();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = "none";
    }
}

// Close modal on click outside box
window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
        e.target.style.display = "none";
    }
});

async function loadAdminDashboard() {
    await loadStats();
    await loadRegistrations();
    await loadEnrollments();
    await refreshCachedData();
}

async function refreshCachedData() {
    try {
        const [tData, sData] = await Promise.all([
            api("/api/admin/teachers"),
            api("/api/admin/subjects")
        ]);
        cachedTeachersList = (tData && tData.teachers) || [];
        cachedSubjectsList = (sData && sData.subjects) || [];
        populateModalDropdowns();
    } catch (e) {
        console.error("refreshCachedData error:", e);
    }
}

function populateModalDropdowns() {
    // 1. Initial teacher in Add Subject modal
    const subTeacherSel = document.getElementById("modalSubjectTeacherSelect");
    if (subTeacherSel) {
        subTeacherSel.innerHTML = '<option value="">-- No initial teacher --</option>' +
            cachedTeachersList.map(t => `<option value="${t.id}">${esc(t.full_name)} (${esc(t.department || 'Faculty')})</option>`).join("");
    }

    // 2. Subjects in Direct Enroll modal
    const enrollSubSel = document.getElementById("modalEnrollSubjectSelect");
    if (enrollSubSel) {
        enrollSubSel.innerHTML = '<option value="">-- Choose Subject --</option>' +
            cachedSubjectsList.map(s => `<option value="${s.id}">${esc(s.subject_code)} – ${esc(s.subject_name)} [${esc(s.branch)}]</option>`).join("");
    }

    // 3. Teachers in Assign Faculty modal
    const assignTeacherSel = document.getElementById("modalAssignTeacherSelect");
    if (assignTeacherSel) {
        assignTeacherSel.innerHTML = '<option value="">-- Select Teacher --</option>' +
            cachedTeachersList.map(t => `<option value="${t.id}">${esc(t.full_name)} (${esc(t.department || 'Faculty')})</option>`).join("");
    }
}

/* ---------------- STATS ---------------- */
async function loadStats() {
    try {
        const stats = await api("/api/admin/stats");
        if (stats.success) {
            const stTeachers = document.getElementById("statTeachers");
            const stStudents = document.getElementById("statStudents");
            const stSubjects = document.getElementById("statSubjects");
            const stPending = document.getElementById("statPending");
            const pendingBadge = document.getElementById("adminPendingBadge");

            if (stTeachers) stTeachers.textContent = stats.teachers_count;
            if (stStudents) stStudents.textContent = stats.students_count;
            if (stSubjects) stSubjects.textContent = stats.subjects_count;
            const pendingCount = stats.pending_approvals + (stats.pending_registrations || 0);
            if (stPending) stPending.textContent = pendingCount;

            if (pendingBadge) {
                if (pendingCount > 0) {
                    pendingBadge.textContent = pendingCount;
                    pendingBadge.style.display = "inline-block";
                } else {
                    pendingBadge.style.display = "none";
                }
            }
        }
    } catch (err) {
        console.error("Failed to load admin stats:", err);
    }
}

async function loadRegistrations() {
    const tableBox = document.getElementById("adminRegistrationsTable");
    if (!tableBox) return;

    try {
        const data = await api("/api/admin/registrations");
        const registrations = data.registrations || [];
        if (!registrations.length) {
            tableBox.innerHTML = '<p class="muted">No account registrations are waiting for approval.</p>';
            return;
        }
        tableBox.innerHTML = `
            <div style="overflow-x:auto">
                <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                    <thead><tr>
                        <th style="padding:10px">Name</th>
                        <th style="padding:10px">Username</th>
                        <th style="padding:10px">Email</th>
                        <th style="padding:10px">Role</th>
                        <th style="padding:10px;text-align:center">Actions</th>
                    </tr></thead>
                    <tbody>${registrations.map(user => `
                        <tr style="border-top:1px solid var(--line)">
                            <td style="padding:10px">${esc(user.full_name || "—")}</td>
                            <td style="padding:10px">${esc(user.username)}</td>
                            <td style="padding:10px">${esc(user.email)}</td>
                            <td style="padding:10px">${esc(user.role)}</td>
                            <td style="padding:10px;text-align:center">
                                <button class="btn btn-sm btn-primary" onclick="reviewRegistration(${user.id}, 'approve')">Approve</button>
                                <button class="btn btn-sm btn-ghost" onclick="reviewRegistration(${user.id}, 'reject')" style="color:var(--danger)">Reject</button>
                            </td>
                        </tr>
                    `).join("")}</tbody>
                </table>
            </div>`;
    } catch (err) {
        tableBox.innerHTML = `<p class="muted">Failed to load registrations: ${esc(err.message)}</p>`;
    }
}

async function reviewRegistration(userId, action) {
    const label = action === "approve" ? "approve" : "reject";
    if (action === "reject" && !confirm("Reject this account registration?")) return;
    try {
        await api(`/api/admin/registrations/${userId}/${action}`, { method: "POST" });
        await Promise.all([loadRegistrations(), loadStats()]);
    } catch (err) {
        const alertBox = document.getElementById("alertBox");
        showAlert(alertBox, `Could not ${label} registration: ${err.message}`, "error");
    }
}

/* ---------------- ENROLLMENTS & APPROVALS ---------------- */
async function loadEnrollments() {
    const tableBox = document.getElementById("adminEnrollmentsTable");
    if (!tableBox) return;

    try {
        const data = await api("/api/admin/enrollments");
        allEnrollmentsList = (data && data.enrollments) || [];
        renderEnrollmentsTable();
    } catch (err) {
        tableBox.innerHTML = `<p class="muted">Failed to load enrollments: ${esc(err.message)}</p>`;
    }
}

function filterAdminEnrollments(mode) {
    currentEnrollmentFilter = mode;
    const btnPending = document.getElementById("adminFilterPending");
    const btnAll = document.getElementById("adminFilterAll");

    if (btnPending && btnAll) {
        if (mode === "pending") {
            btnPending.style.fontWeight = "700";
            btnPending.style.color = "var(--primary)";
            btnAll.style.fontWeight = "400";
            btnAll.style.color = "inherit";
        } else {
            btnPending.style.fontWeight = "400";
            btnPending.style.color = "inherit";
            btnAll.style.fontWeight = "700";
            btnAll.style.color = "var(--primary)";
        }
    }

    renderEnrollmentsTable();
}

function renderEnrollmentsTable() {
    const tableBox = document.getElementById("adminEnrollmentsTable");
    if (!tableBox) return;

    const list = currentEnrollmentFilter === "pending"
        ? allEnrollmentsList.filter(e => e.status === "pending")
        : allEnrollmentsList;

    if (!list.length) {
        tableBox.innerHTML = `
            <div style="text-align:center;padding:30px 10px">
                <p class="muted">No ${currentEnrollmentFilter === "pending" ? "pending" : ""} enrollment requests found.</p>
            </div>
        `;
        return;
    }

    tableBox.innerHTML = `
        <div style="overflow-x:auto">
            <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                <thead>
                    <tr style="border-bottom:2px solid var(--line);color:var(--muted);font-size:0.85rem">
                        <th style="padding:12px 10px">Roll No</th>
                        <th style="padding:12px 10px">Student</th>
                        <th style="padding:12px 10px">Branch Match</th>
                        <th style="padding:12px 10px">Subject</th>
                        <th style="padding:12px 10px">Assigned Teacher</th>
                        <th style="padding:12px 10px">Status</th>
                        <th style="padding:12px 10px;text-align:center">Admin Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map(e => {
                        let statusBadge = "";
                        if (e.status === "approved") {
                            statusBadge = '<span class="badge badge-approved">✅ Approved</span>';
                        } else if (e.status === "pending") {
                            statusBadge = '<span class="badge badge-pending">⏳ Pending Review</span>';
                        } else {
                            statusBadge = '<span class="badge badge-rejected">❌ Rejected</span>';
                        }

                        const match = (e.student_branch || "").trim().toUpperCase() === (e.subject_branch || "").trim().toUpperCase();

                        return `
                            <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                <td style="padding:12px 10px"><b>${esc(e.roll_number)}</b></td>
                                <td style="padding:12px 10px">
                                    <div style="font-weight:700">${esc(e.student_name)}</div>
                                    <div style="font-size:0.78rem;color:var(--muted)">${esc(e.student_email || "")}</div>
                                </td>
                                <td style="padding:12px 10px">
                                    <span class="badge ${match ? 'badge-branch' : 'badge-rejected'}">
                                        ${esc(e.student_branch)} → ${esc(e.subject_branch)}
                                    </span>
                                </td>
                                <td style="padding:12px 10px">
                                    <b>${esc(e.subject_code)}</b> – ${esc(e.subject_name)}
                                </td>
                                <td style="padding:12px 10px">
                                    ${esc(e.teacher_name || "Unassigned")}
                                </td>
                                <td style="padding:12px 10px">${statusBadge}</td>
                                <td style="padding:12px 10px;text-align:center">
                                    ${e.status !== 'approved' ? `
                                        <button class="btn btn-sm btn-primary" onclick="adminApproveEnrollment(${e.id})" style="background:#15803d;margin-right:4px">
                                            ✅ Approve
                                        </button>
                                    ` : ''}
                                    ${e.status !== 'rejected' ? `
                                        <button class="btn btn-sm btn-ghost" onclick="adminRejectEnrollment(${e.id})" style="color:var(--danger);margin-right:4px">
                                            ❌ Reject
                                        </button>
                                    ` : ''}
                                    <button class="btn btn-sm btn-ghost" onclick="adminDeleteEnrollment(${e.id})" style="color:#64748b" title="Delete Enrollment Record">
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function adminApproveEnrollment(id) {
    try {
        const res = await api(`/api/admin/enrollments/${id}/approve`, { method: "POST" });
        alert(res.message || "Enrollment approved by Admin!");
        await loadAdminDashboard();
    } catch (err) {
        alert(err.message || "Approval failed");
    }
}

async function adminRejectEnrollment(id) {
    if (!confirm("Are you sure you want to reject this student enrollment request?")) return;
    try {
        const res = await api(`/api/admin/enrollments/${id}/reject`, { method: "POST" });
        alert(res.message || "Enrollment rejected by Admin.");
        await loadAdminDashboard();
    } catch (err) {
        alert(err.message || "Rejection failed");
    }
}

async function adminDeleteEnrollment(id) {
    if (!confirm("Are you sure you want to permanently delete this enrollment record?")) return;
    try {
        const res = await api(`/api/admin/enrollments/${id}`, { method: "DELETE" });
        alert(res.message || "Enrollment record deleted.");
        await loadAdminDashboard();
    } catch (err) {
        alert(err.message || "Deletion failed");
    }
}

/* ---------------- TAB NAVIGATION ---------------- */
async function switchAdminTab(tabName) {
    document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
    ["viewEnrollments", "viewSubjects", "viewTeachers", "viewStudents", "viewAttendance"].forEach(id => {
        const panel = document.getElementById(id);
        if (panel) panel.style.display = "none";
    });
    if (tabName === "overview" || tabName === "enrollments") {
        document.getElementById("btnTabOverview").classList.add("active");
        document.getElementById("viewEnrollments").style.display = "block";
        await loadEnrollments();
    } else if (tabName === "subjects") {
        document.getElementById("btnTabSubjects").classList.add("active");
        document.getElementById("viewSubjects").style.display = "block";
        await loadSubjectsView();
    } else if (tabName === "teachers") {
        document.getElementById("btnTabTeachers").classList.add("active");
        document.getElementById("viewTeachers").style.display = "block";
        await loadTeachersView();
    } else if (tabName === "students") {
        document.getElementById("btnTabStudents").classList.add("active");
        document.getElementById("viewStudents").style.display = "block";
        await loadStudentsView();
    } else if (tabName === "attendance") {
        document.getElementById("btnTabAttendance").classList.add("active");
        document.getElementById("viewAttendance").style.display = "block";
        await loadAttendanceView();
    }
}

let cachedAttendanceRecords = [];

async function loadAttendanceView() {
    const box = document.getElementById("adminAttendanceTable");
    if (!box) return;
    box.innerHTML = '<p class="muted">Loading attendance records…</p>';
    try {
        const [attendanceData, teacherData, subjectData] = await Promise.all([
            api("/api/admin/attendance"), api("/api/admin/teachers"), api("/api/admin/subjects")
        ]);
        cachedAttendanceRecords = Array.isArray(attendanceData.records) ? attendanceData.records : [];
        const teacherSelect = document.getElementById("adminAttendanceTeacher");
        const subjectSelect = document.getElementById("adminAttendanceSubject");
        const previousTeacher = teacherSelect.value, previousSubject = subjectSelect.value;
        const teachers = (teacherData && teacherData.teachers) || [];
        const subjects = (subjectData && subjectData.subjects) || [];
        teacherSelect.innerHTML = '<option value="">All teachers</option>' + teachers.map(t => `<option value="${t.id}">${esc(t.full_name)}</option>`).join("");
        subjectSelect.innerHTML = '<option value="">All subjects</option>' + subjects.map(s => `<option value="${s.id}">${esc(s.subject_code)} – ${esc(s.subject_name)}</option>`).join("");
        if (teachers.some(t => String(t.id) === previousTeacher)) teacherSelect.value = previousTeacher;
        if (subjects.some(s => String(s.id) === previousSubject)) subjectSelect.value = previousSubject;
        filterAttendanceView();
    } catch (error) {
        console.error("Failed to load admin attendance:", error);
        box.innerHTML = `<p class="muted">Could not load attendance records: ${esc(error.message)}</p>`;
    }
}

function filterAttendanceView() {
    const box = document.getElementById("adminAttendanceTable");
    if (!box) return;
    const teacherId = document.getElementById("adminAttendanceTeacher").value;
    const subjectId = document.getElementById("adminAttendanceSubject").value;
    const from = document.getElementById("adminAttendanceFrom").value;
    const to = document.getElementById("adminAttendanceTo").value;
    const status = document.getElementById("adminAttendanceStatus").value;
    const records = cachedAttendanceRecords.filter(record =>
        (!teacherId || String(record.teacher_id) === teacherId) &&
        (!subjectId || String(record.subject_id) === subjectId) &&
        (!from || String(record.date) >= from) && (!to || String(record.date) <= to) &&
        (!status || record.status === status)
    );
    if (!records.length) { box.innerHTML = '<p class="muted">No attendance records match these filters.</p>'; return; }
    box.innerHTML = `
        <div style="overflow-x:auto"><table class="table" style="width:100%;text-align:left;border-collapse:collapse">
        <thead><tr style="border-bottom:2px solid var(--line);color:var(--muted);font-size:0.85rem">
        <th style="padding:10px">Date</th><th style="padding:10px">Student</th><th style="padding:10px">Roll No</th><th style="padding:10px">Subject</th><th style="padding:10px">Teacher</th><th style="padding:10px">Status</th></tr></thead><tbody>
        ${records.map(record => `<tr style="border-bottom:1px solid var(--line);font-size:0.9rem"><td style="padding:10px">${esc(record.date)}</td><td style="padding:10px">${esc(record.student_name)}</td><td style="padding:10px"><b>${esc(record.roll_number)}</b></td><td style="padding:10px"><b>${esc(record.subject_code)}</b> – ${esc(record.subject_name)}</td><td style="padding:10px">${esc(record.teacher_name)}</td><td style="padding:10px"><span class="badge badge-${record.status === "Present" ? "present" : "absent"}">${esc(record.status)}</span></td></tr>`).join("")}
        </tbody></table><p class="muted" style="margin-top:12px">Showing ${records.length} of ${cachedAttendanceRecords.length} attendance records.</p></div>`;
}

/* ---------------- SUBJECTS VIEW & CRUD ---------------- */
async function loadSubjectsView() {
    const box = document.getElementById("adminSubjectsTable");
    box.innerHTML = `<p class="muted">Loading subjects…</p>`;
    try {
        const data = await api("/api/admin/subjects");
        const subjects = (data && data.subjects) || [];
        cachedSubjectsList = subjects;

        if (!subjects.length) {
            box.innerHTML = `<p class="muted">No subjects registered yet. Click '+ Create New Subject' above.</p>`;
            return;
        }

        box.innerHTML = `
            <div style="overflow-x:auto">
                <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                    <thead>
                        <tr style="border-bottom:2px solid var(--line);color:var(--muted);font-size:0.85rem">
                            <th style="padding:10px">Code</th>
                            <th style="padding:10px">Subject Name</th>
                            <th style="padding:10px">Course & Branch</th>
                            <th style="padding:10px">Semester</th>
                            <th style="padding:10px">Assigned Faculty</th>
                            <th style="padding:10px">Enrolled</th>
                            <th style="padding:10px;text-align:center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${subjects.map(s => `
                            <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                <td style="padding:10px"><b>${esc(s.subject_code)}</b></td>
                                <td style="padding:10px"><b>${esc(s.subject_name)}</b></td>
                                <td style="padding:10px"><span class="badge badge-branch">${esc(s.branch)}</span> ${esc(s.course)}</td>
                                <td style="padding:10px">Sem ${esc(s.semester)}</td>
                                <td style="padding:10px">
                                    ${(s.teachers && s.teachers.length) ? s.teachers.map(t => `
                                        <span class="badge badge-approved" style="margin-right:4px;display:inline-flex;align-items:center;gap:4px">
                                            🧑‍🏫 ${esc(t.full_name)}
                                            <span onclick="adminUnassignTeacher(${s.id}, ${t.id}, '${esc(t.full_name)}')" style="cursor:pointer;color:red;font-weight:bold" title="Unassign">×</span>
                                        </span>
                                    `).join("") : '<span class="muted" style="font-size:0.85rem">Unassigned</span>'}
                                    <button class="btn btn-sm btn-ghost" onclick="openAssignFacultyModal(${s.id}, '${esc(s.subject_code)} - ${esc(s.subject_name)}')" style="color:var(--primary);font-size:0.75rem;padding:2px 6px">
                                        + Assign
                                    </button>
                                </td>
                                <td style="padding:10px"><span class="badge badge-approved">${esc(s.enrolled_students || 0)} enrolled</span></td>
                                <td style="padding:10px;text-align:center">
                                    <button class="btn btn-sm btn-ghost" onclick="adminDeleteSubject(${s.id}, '${esc(s.subject_code)}')" style="color:var(--danger);font-weight:600">
                                        🗑️ Delete
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        box.innerHTML = `<p class="muted">Failed to load subjects: ${esc(err.message)}</p>`;
    }
}

async function adminDeleteSubject(id, code) {
    if (!confirm(`Are you sure you want to permanently delete subject ${code} and all its enrollments and attendance records?`)) return;
    try {
        const res = await api(`/api/admin/subjects/${id}`, { method: "DELETE" });
        alert(res.message || "Subject deleted.");
        await loadSubjectsView();
        await loadStats();
    } catch (err) {
        alert(err.message || "Failed to delete subject.");
    }
}

function openAssignFacultyModal(subjectId, subjectLabel) {
    document.getElementById("assignSubjectIdInput").value = subjectId;
    document.getElementById("assignSubjectLabel").textContent = `Subject: ${subjectLabel}`;
    openModal("modalAssignFaculty");
}

async function adminUnassignTeacher(subjectId, teacherId, teacherName) {
    if (!confirm(`Unassign ${teacherName} from this subject?`)) return;
    try {
        await api(`/api/admin/subjects/${subjectId}/unassign-teacher`, {
            method: "POST",
            body: { teacher_id: teacherId }
        });
        await loadSubjectsView();
    } catch (err) {
        alert(err.message || "Failed to unassign teacher.");
    }
}

/* ---------------- TEACHERS VIEW & CRUD ---------------- */
async function loadTeachersView() {
    const box = document.getElementById("adminTeachersTable");
    box.innerHTML = `<p class="muted">Loading teachers…</p>`;
    try {
        const data = await api("/api/admin/teachers");
        const teachers = (data && data.teachers) || [];
        cachedTeachersList = teachers;

        if (!teachers.length) {
            box.innerHTML = `<p class="muted">No teachers registered. Click '+ Add New Teacher' above.</p>`;
            return;
        }

        box.innerHTML = `
            <div style="overflow-x:auto">
                <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                    <thead>
                        <tr style="border-bottom:2px solid var(--line);color:var(--muted);font-size:0.85rem">
                            <th style="padding:10px">Employee ID</th>
                            <th style="padding:10px">Full Name</th>
                            <th style="padding:10px">Department</th>
                            <th style="padding:10px">Email</th>
                            <th style="padding:10px">Phone</th>
                            <th style="padding:10px">Subjects</th>
                            <th style="padding:10px;text-align:center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teachers.map(t => `
                            <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                <td style="padding:10px"><b>${esc(t.employee_id || '-')}</b></td>
                                <td style="padding:10px">
                                    <div style="font-weight:700">${esc(t.full_name)}</div>
                                    <div style="font-size:0.78rem;color:var(--muted)">@${esc(t.username)}</div>
                                </td>
                                <td style="padding:10px">${esc(t.department || '-')}</td>
                                <td style="padding:10px">${esc(t.email || '-')}</td>
                                <td style="padding:10px">${esc(t.phone || '-')}</td>
                                <td style="padding:10px"><span class="badge badge-branch">${esc(t.total_subjects || 0)} subjects</span></td>
                                <td style="padding:10px;text-align:center">
                                    <button class="btn btn-sm btn-ghost" onclick="adminDeleteTeacher(${t.id}, '${esc(t.full_name)}')" style="color:var(--danger);font-weight:600">
                                        🗑️ Delete
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        box.innerHTML = `<p class="muted">Failed to load teachers: ${esc(err.message)}</p>`;
    }
}

async function adminDeleteTeacher(id, name) {
    if (!confirm(`Are you sure you want to delete teacher '${name}' and their account?`)) return;
    try {
        const res = await api(`/api/admin/teachers/${id}`, { method: "DELETE" });
        alert(res.message || "Teacher deleted.");
        await loadTeachersView();
        await loadStats();
    } catch (err) {
        alert(err.message || "Failed to delete teacher.");
    }
}

/* ---------------- STUDENTS VIEW & CRUD ---------------- */
async function loadStudentsView() {
    const box = document.getElementById("adminStudentsTable");
    box.innerHTML = `<p class="muted">Loading students…</p>`;
    try {
        const data = await api("/api/admin/students");
        const students = (data && data.students) || [];

        if (!students.length) {
            box.innerHTML = `<p class="muted">No students registered. Click '+ Add New Student' above.</p>`;
            return;
        }

        box.innerHTML = `
            <div style="overflow-x:auto">
                <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                    <thead>
                        <tr style="border-bottom:2px solid var(--line);color:var(--muted);font-size:0.85rem">
                            <th style="padding:10px">Roll Number</th>
                            <th style="padding:10px">Full Name</th>
                            <th style="padding:10px">Branch & Course</th>
                            <th style="padding:10px">Semester</th>
                            <th style="padding:10px">Email</th>
                            <th style="padding:10px">Enrollments</th>
                            <th style="padding:10px;text-align:center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(s => `
                            <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                <td style="padding:10px"><b>${esc(s.roll_number)}</b></td>
                                <td style="padding:10px">
                                    <div style="font-weight:700">${esc(s.full_name)}</div>
                                    <div style="font-size:0.78rem;color:var(--muted)">@${esc(s.username)}</div>
                                </td>
                                <td style="padding:10px"><span class="badge badge-branch">${esc(s.branch)}</span> ${esc(s.course)}</td>
                                <td style="padding:10px">Sem ${esc(s.semester)}</td>
                                <td style="padding:10px">${esc(s.email || '-')}</td>
                                <td style="padding:10px"><span class="badge badge-approved">${esc(s.total_enrolled || 0)} enrolled</span></td>
                                <td style="padding:10px;text-align:center">
                                    <button class="btn btn-sm btn-ghost" onclick="quickOpenEnrollModalForRoll('${esc(s.roll_number)}')" style="color:var(--primary);margin-right:4px">
                                        ⚡ Enroll
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="adminDeleteStudent(${s.id}, '${esc(s.full_name)}')" style="color:var(--danger);font-weight:600">
                                        🗑️ Delete
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        box.innerHTML = `<p class="muted">Failed to load students: ${esc(err.message)}</p>`;
    }
}

function quickOpenEnrollModalForRoll(roll) {
    const rollInput = document.querySelector("#formDirectEnroll input[name='roll_number']");
    if (rollInput) rollInput.value = roll;
    openModal("modalEnrollStudent");
}

async function adminDeleteStudent(id, name) {
    if (!confirm(`Are you sure you want to delete student '${name}', their account, enrollments and attendance records?`)) return;
    try {
        const res = await api(`/api/admin/students/${id}`, { method: "DELETE" });
        alert(res.message || "Student deleted.");
        await loadStudentsView();
        await loadStats();
    } catch (err) {
        alert(err.message || "Failed to delete student.");
    }
}

/* ---------------- FORM SUBMISSION HANDLERS ---------------- */
function initAdminForms() {
    // 1. Create Subject
    const formAddSubject = document.getElementById("formAddSubject");
    if (formAddSubject) {
        formAddSubject.onsubmit = async (e) => {
            e.preventDefault();
            const payload = {
                subject_code: formAddSubject.subject_code.value.trim().toUpperCase(),
                subject_name: formAddSubject.subject_name.value.trim(),
                course: formAddSubject.course.value.trim(),
                branch: formAddSubject.branch.value.trim().toUpperCase(),
                semester: Number(formAddSubject.semester.value),
                teacher_id: formAddSubject.teacher_id.value ? Number(formAddSubject.teacher_id.value) : null,
            };
            try {
                const res = await api("/api/admin/subjects", { method: "POST", body: payload });
                alert(res.message || "Subject created successfully!");
                formAddSubject.reset();
                closeModal("modalAddSubject");
                await refreshCachedData();
                await loadSubjectsView();
                await loadStats();
            } catch (err) {
                alert(err.message || "Failed to create subject.");
            }
        };
    }

    // 2. Create Student
    const formAddStudent = document.getElementById("formAddStudent");
    if (formAddStudent) {
        formAddStudent.onsubmit = async (e) => {
            e.preventDefault();
            const payload = {
                full_name: formAddStudent.full_name.value.trim(),
                roll_number: formAddStudent.roll_number.value.trim().toUpperCase(),
                branch: formAddStudent.branch.value.trim().toUpperCase(),
                course: formAddStudent.course.value.trim(),
                semester: Number(formAddStudent.semester.value),
                phone: formAddStudent.phone.value.trim(),
                username: formAddStudent.username.value.trim(),
                email: formAddStudent.email.value.trim().toLowerCase(),
                password: formAddStudent.password.value,
            };
            try {
                const res = await api("/api/admin/students", { method: "POST", body: payload });
                alert(res.message || "Student created successfully!");
                formAddStudent.reset();
                closeModal("modalAddStudent");
                await loadStudentsView();
                await loadStats();
            } catch (err) {
                alert(err.message || "Failed to create student.");
            }
        };
    }

    // 3. Create Teacher
    const formAddTeacher = document.getElementById("formAddTeacher");
    if (formAddTeacher) {
        formAddTeacher.onsubmit = async (e) => {
            e.preventDefault();
            const payload = {
                full_name: formAddTeacher.full_name.value.trim(),
                employee_id: formAddTeacher.employee_id.value.trim().toUpperCase(),
                department: formAddTeacher.department.value.trim(),
                phone: formAddTeacher.phone.value.trim(),
                username: formAddTeacher.username.value.trim(),
                email: formAddTeacher.email.value.trim().toLowerCase(),
                password: formAddTeacher.password.value,
            };
            try {
                const res = await api("/api/admin/teachers", { method: "POST", body: payload });
                alert(res.message || "Teacher created successfully!");
                formAddTeacher.reset();
                closeModal("modalAddTeacher");
                await refreshCachedData();
                await loadTeachersView();
                await loadStats();
            } catch (err) {
                alert(err.message || "Failed to create teacher.");
            }
        };
    }

    // 4. Direct Enroll Student
    const formDirectEnroll = document.getElementById("formDirectEnroll");
    if (formDirectEnroll) {
        formDirectEnroll.onsubmit = async (e) => {
            e.preventDefault();
            const payload = {
                roll_number: formDirectEnroll.roll_number.value.trim().toUpperCase(),
                full_name: formDirectEnroll.full_name ? formDirectEnroll.full_name.value.trim() : "",
                subject_id: Number(formDirectEnroll.subject_id.value),
            };
            try {
                const res = await api("/api/admin/enroll-student", { method: "POST", body: payload });
                alert(res.message || "Student enrolled and approved!");
                formDirectEnroll.reset();
                closeModal("modalEnrollStudent");
                await loadAdminDashboard();
            } catch (err) {
                alert(err.message || "Enrollment failed.");
            }
        };
    }

    // 5. Assign Faculty to Subject
    const formAssignFaculty = document.getElementById("formAssignFaculty");
    if (formAssignFaculty) {
        formAssignFaculty.onsubmit = async (e) => {
            e.preventDefault();
            const subjectId = formAssignFaculty.subject_id.value;
            const teacherId = formAssignFaculty.teacher_id.value;
            try {
                const res = await api(`/api/admin/subjects/${subjectId}/assign-teacher`, {
                    method: "POST",
                    body: { teacher_id: Number(teacherId) }
                });
                alert(res.message || "Faculty assigned!");
                closeModal("modalAssignFaculty");
                await loadSubjectsView();
            } catch (err) {
                alert(err.message || "Failed to assign faculty.");
            }
        };
    }
}
