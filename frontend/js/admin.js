/* ============================================================
   admin.js – Powers the Administrator Control Center
   Full control: Subjects, Teachers, Students, Enrollments
   ============================================================ */

let adminUser = null;
let allEnrollmentsList = [];
let cachedTeachersList = [];
let cachedSubjectsList = [];
let adminAttendancePage = 1;
let adminAttendancePages = 0;
let adminAttendanceExportQuery = "";
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
                        <th style="padding:12px 10px">Roll Number</th>
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
    document.getElementById("viewEnrollments").style.display = "none";
    document.getElementById("viewSubjects").style.display = "none";
    document.getElementById("viewTeachers").style.display = "none";
    document.getElementById("viewStudents").style.display = "none";
    document.getElementById("viewAttendance").style.display = "none";

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
        await loadAdminAttendance();
    }
}

async function loadAdminAttendance() {
    adminAttendancePage = 1;
    adminAttendancePages = 0;
    adminAttendanceExportQuery = "";
    const box = document.getElementById("adminAttendanceTable");
    const studentFilter = document.getElementById("adminAttendanceStudentFilter");
    const subjectFilter = document.getElementById("adminAttendanceSubjectFilter");
    const viewFilter = document.getElementById("adminAttendanceView");
    const searchButton = document.getElementById("adminAttendanceSearch");
    const previousButton = document.getElementById("adminAttendancePrevious");
    const nextButton = document.getElementById("adminAttendanceNext");
    const pagination = document.getElementById("adminAttendancePagination");
    const summary = document.getElementById("adminAttendanceSummary");
    box.innerHTML = `<p class="muted">Choose the report criteria, then select Apply Filters.</p>`;
    summary.innerHTML = "";
    pagination.style.display = "none";
    setAdminAttendanceExportEnabled(false);

    try {
        const [studentsData, subjectsData] = await Promise.all([
            api("/api/admin/students"),
            api("/api/admin/subjects")
        ]);

        const students = studentsData.students || [];
        const subjects = subjectsData.subjects || [];

        studentFilter.innerHTML = `
            <option value="">Select student</option>
            ${students.map(student => `
                <option value="${student.id}">${esc(student.roll_number)} – ${esc(student.full_name)}</option>
            `).join("")}
        `;
        subjectFilter.innerHTML = `
            ${subjects.length ? subjects.map(subject => `
                <option value="${subject.id}">${esc(subject.subject_code)} – ${esc(subject.subject_name)}</option>
            `).join("") : '<option value="" disabled selected>No subjects available</option>'}
        `;
        searchButton.disabled = subjects.length === 0;
        ["Excel", "Pdf", "Csv"].forEach(formatName => {
            document.getElementById(`adminAttendanceExport${formatName}`).onclick =
                () => downloadAdminAttendance(formatName.toLowerCase());
        });
        subjectFilter.onchange = () => {
            adminAttendanceExportQuery = "";
            setAdminAttendanceExportEnabled(false);
        };

        viewFilter.onchange = () => {
            adminAttendancePage = 1;
            updateAdminAttendanceFilters();
        };
        searchButton.onclick = () => {
            adminAttendancePage = 1;
            searchAdminAttendance();
        };
        document.getElementById("adminAttendanceRollFilter").onkeydown = event => {
            if (event.key === "Enter") {
                adminAttendancePage = 1;
                searchAdminAttendance();
            }
        };
        previousButton.onclick = () => {
            if (adminAttendancePage > 1) {
                adminAttendancePage -= 1;
                searchAdminAttendance();
            }
        };
        nextButton.onclick = () => {
            if (adminAttendancePage < adminAttendancePages) {
                adminAttendancePage += 1;
                searchAdminAttendance();
            }
        };
        updateAdminAttendanceFilters();
    } catch (error) {
        box.innerHTML = `<p class="muted">Failed to load attendance: ${esc(error.message)}</p>`;
    }
}

function updateAdminAttendanceFilters() {
    adminAttendanceExportQuery = "";
    setAdminAttendanceExportEnabled(false);
    const view = document.getElementById("adminAttendanceView").value;
    document.getElementById("adminAttendanceDateFilter").style.display =
        view === "date" ? "" : "none";
    document.getElementById("adminAttendanceStudentFilter").style.display =
        view === "student" ? "" : "none";
    document.getElementById("adminAttendanceRollFilter").style.display =
        view === "roll" ? "" : "none";
    document.getElementById("adminAttendanceStartDate").style.display =
        view === "student" || view === "roll" ? "" : "none";
    document.getElementById("adminAttendanceEndDate").style.display =
        view === "student" || view === "roll" ? "" : "none";

    const hints = {
        date: "Choose an attendance date to view records.",
        student: "Choose a student or specify a date range.",
        roll: "Enter the exact roll number. Date range is optional."
    };
    document.getElementById("adminAttendanceTable").innerHTML =
        `<p class="muted">${hints[view]}</p>`;
    document.getElementById("adminAttendanceSummary").innerHTML = "";
    document.getElementById("adminAttendancePagination").style.display = "none";
}

async function searchAdminAttendance() {
    adminAttendanceExportQuery = "";
    setAdminAttendanceExportEnabled(false);
    const box = document.getElementById("adminAttendanceTable");
    const summaryBox = document.getElementById("adminAttendanceSummary");
    const view = document.getElementById("adminAttendanceView").value;
    const studentId = document.getElementById("adminAttendanceStudentFilter").value;
    const subjectId = document.getElementById("adminAttendanceSubjectFilter").value;
    const date = document.getElementById("adminAttendanceDateFilter").value;
    const rollNumber = document.getElementById("adminAttendanceRollFilter").value.trim();
    const startDate = document.getElementById("adminAttendanceStartDate").value;
    const endDate = document.getElementById("adminAttendanceEndDate").value;

    if (!subjectId) {
        box.innerHTML = `<p class="muted">Choose a subject before applying the filters.</p>`;
        return;
    }
    if (view === "date" && !date) {
        box.innerHTML = `<p class="muted">Choose a date before applying the filters.</p>`;
        return;
    }
    if (view === "student" && !studentId && !startDate && !endDate) {
        box.innerHTML = `<p class="muted">Choose a student or specify a date range before applying the filters.</p>`;
        return;
    }
    if (view === "roll" && !/^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,99}$/.test(rollNumber)) {
        box.innerHTML = `<p class="muted">Enter a valid roll number using letters, numbers, spaces, dots, hyphens, underscores or slashes.</p>`;
        return;
    }
    if (startDate && endDate && startDate > endDate) {
        box.innerHTML = `<p class="muted">Start date must be on or before end date.</p>`;
        return;
    }

    const params = new URLSearchParams({ mode: view, page: String(adminAttendancePage) });
    if (view === "date") params.set("date", date);
    if (view === "student") {
        if (studentId) params.set("student_id", studentId);
        if (startDate) params.set("start_date", startDate);
        if (endDate) params.set("end_date", endDate);
    }
    if (view === "roll") {
        params.set("roll_number", rollNumber);
        if (startDate) params.set("start_date", startDate);
        if (endDate) params.set("end_date", endDate);
    }
    if (subjectId) params.set("subject_id", subjectId);
    box.innerHTML = `<p class="muted">Loading attendance records…</p>`;
    summaryBox.innerHTML = "";
    document.getElementById("adminAttendancePagination").style.display = "none";

    const searchButton = document.getElementById("adminAttendanceSearch");
    searchButton.disabled = true;
    try {
        const data = await api(`/api/admin/attendance?${params.toString()}`);
        adminAttendancePages = data.pages || 0;
        adminAttendanceExportQuery = params.toString();
        setAdminAttendanceExportEnabled(data.total > 0);
        renderAdminAttendance(data, view);
    } catch (error) {
        summaryBox.innerHTML = "";
        box.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    } finally {
        searchButton.disabled = false;
    }
}

function setAdminAttendanceExportEnabled(enabled) {
    ["Excel", "Pdf", "Csv"].forEach(formatName => {
        const button = document.getElementById(`adminAttendanceExport${formatName}`);
        if (button) button.disabled = !enabled;
    });
}

async function downloadAdminAttendance(format) {
    if (!adminAttendanceExportQuery) return;

    const buttons = ["Excel", "Pdf", "Csv"].map(formatName =>
        document.getElementById(`adminAttendanceExport${formatName}`)
    );
    buttons.forEach(button => { button.disabled = true; });
    try {
        const params = new URLSearchParams(adminAttendanceExportQuery);
        params.set("page", "1");
        const firstPage = await api(`/api/admin/attendance?${params.toString()}`);
        const records = [...(firstPage.records || [])];
        for (let page = 2; page <= firstPage.pages; page += 1) {
            params.set("page", String(page));
            const data = await api(`/api/admin/attendance?${params.toString()}`);
            records.push(...(data.records || []));
        }

        const selectedSubject = document.getElementById("adminAttendanceSubjectFilter").selectedOptions[0];
        const subjectName = selectedSubject ? selectedSubject.textContent.trim() : "Subject";
        AttendanceExport.download(
            format,
            `Admin Attendance Report - ${subjectName}`,
            ["Date", "Roll Number", "Student", "Course", "Branch", "Semester", "Subject Code", "Subject", "Teacher", "Status"],
            records.map(record => [
                AttendanceExport.dateKey(record.date),
                record.roll_number,
                record.student_name,
                record.course,
                record.branch,
                record.semester,
                record.subject_code,
                record.subject_name,
                record.teacher_name || "",
                record.status
            ]),
            `admin-attendance-report-${params.get("subject_id")}`
        );
    } catch (error) {
        window.alert(`Unable to download attendance report: ${error.message}`);
    } finally {
        const enabled = Boolean(adminAttendanceExportQuery);
        buttons.forEach(button => { button.disabled = !enabled; });
    }
}

function renderAdminAttendance(data, view) {
    const box = document.getElementById("adminAttendanceTable");
    const summaryBox = document.getElementById("adminAttendanceSummary");
    const records = data.records || [];
    const summary = data.summary || { total: 0, present: 0, absent: 0, leave: 0, percentage: 0 };

    if (view === "student" || view === "roll") {
        const student = data.student;
        if (student) {
            summaryBox.innerHTML = `
                <h3>${esc(student.full_name)} <span class="muted">(${esc(student.roll_number)})</span></h3>
                <p class="muted">${esc(student.course || "—")} · ${esc(student.branch || "—")} · Semester ${esc(student.semester || "—")}</p>
                ${attendanceSummaryMarkup(summary)}
            `;
        } else {
            summaryBox.innerHTML = "";
        }
    } else {
        summaryBox.innerHTML = "";
    }

    if (!records.length) {
        const emptyMessage = view === "roll" && !data.student
            ? "No student matches the specified roll number."
            : "No attendance records match the selected criteria.";
        box.innerHTML = `<p class="muted">${emptyMessage}</p>`;
        updateAdminAttendancePagination(data);
        return;
    }

    box.innerHTML = `
        <p class="muted" style="margin-bottom:12px">${data.total} attendance record(s)</p>
        <div style="overflow-x:auto">
            <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                <thead>
                    <tr>
                        <th style="padding:10px">Date</th>
                        <th style="padding:10px">Roll Number</th>
                        <th style="padding:10px">Student</th>
                        <th style="padding:10px">Class / Semester</th>
                        <th style="padding:10px">Subject</th>
                        <th style="padding:10px">Teacher</th>
                        <th style="padding:10px">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(record => `
                        <tr style="border-bottom:1px solid var(--line)">
                            <td style="padding:10px">${prettyDate(record.date)}</td>
                            <td style="padding:10px">${esc(record.roll_number)}</td>
                            <td style="padding:10px">${esc(record.student_name)}</td>
                            <td style="padding:10px">${esc(record.course || "—")} · ${esc(record.branch || "—")} · Semester ${esc(record.semester || "—")}</td>
                            <td style="padding:10px">${esc(record.subject_code)} – ${esc(record.subject_name)}</td>
                            <td style="padding:10px">${esc(record.teacher_name || "—")}</td>
                            <td style="padding:10px"><span class="badge ${attendanceStatusClass(record.status)}">${esc(record.status)}</span></td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
    updateAdminAttendancePagination(data);
}

function attendanceSummaryMarkup(summary) {
    return `
        <div class="stat-grid" style="margin:16px 0 0">
            <div class="stat c-primary"><div class="val">${summary.total}</div><div class="lbl">Applicable classes</div></div>
            <div class="stat c-success"><div class="val">${summary.present}</div><div class="lbl">Present</div></div>
            <div class="stat c-danger"><div class="val">${summary.absent}</div><div class="lbl">Absent</div></div>
            <div class="stat c-warning"><div class="val">${summary.leave}</div><div class="lbl">Leave</div></div>
            <div class="stat c-primary"><div class="val">${summary.percentage}%</div><div class="lbl">Attendance</div></div>
        </div>
        <p class="muted" style="margin-top:10px">Percentage = Present ÷ recorded classes. Leave is not an allowed status in the current attendance database, so its count is 0.</p>
    `;
}

function attendanceStatusClass(status) {
    if (status === "Present") return "badge-present";
    if (status === "Absent") return "badge-absent";
    if (status === "Leave") return "badge-info";
    return "badge-info";
}

function updateAdminAttendancePagination(data) {
    const pagination = document.getElementById("adminAttendancePagination");
    const info = document.getElementById("adminAttendancePageInfo");
    const previous = document.getElementById("adminAttendancePrevious");
    const next = document.getElementById("adminAttendanceNext");
    const pages = data.pages || 0;
    pagination.style.display = pages > 1 ? "flex" : "none";
    info.textContent = pages ? `Page ${data.page} of ${pages} · ${data.total} records` : "";
    previous.disabled = data.page <= 1;
    next.disabled = data.page >= pages;
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
            box.innerHTML = `<p class="muted">No subjects are available. Create a subject to get started.</p>`;
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
                                <td style="padding:10px">Semester ${esc(s.semester)}</td>
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
            box.innerHTML = `<p class="muted">No teacher accounts are available. Create a teacher account to get started.</p>`;
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
            box.innerHTML = `<p class="muted">No student accounts are available. Create a student account to get started.</p>`;
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
                                <td style="padding:10px">Semester ${esc(s.semester)}</td>
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
