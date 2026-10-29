/* ============================================================
   teacher.js – powers all pages inside /teacher/
   Dispatches to a loader based on <body data-page="...">.
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    const user = await requireRole("teacher");

    if (!user) return;

    markActiveNav();
    renderTopBarUser(user);
    updateTeacherNavBadge();

    const page = document.body.dataset.page;

    if (page === "dashboard") {
        await loadDashboard(user);
    }

    if (page === "approvals") {
        await loadApprovalsPage();
    }

    if (page === "subjects") {
        await loadSubjects();
    }

    if (page === "mark") {
        await loadMarkPage();
    }

    if (page === "history") {
        await loadHistoryPage();
    }
});


/* ============================================================
   Teacher Dashboard
   ============================================================ */

async function loadDashboard(currentUser) {

    try {

        /*
         * IMPORTANT:
         * Backend routes are /api/teachers/...
         */

        const profile = await api("/api/teachers/profile");

        const subjects = await api("/api/teachers/subjects");


        /* ---------------- Teacher profile ---------------- */

        const teacherName = document.getElementById("teacherName");

        const deptInfo = document.getElementById("deptInfo");

        if (teacherName) {
            teacherName.textContent =
                profile.full_name || profile.username || "Teacher";
        }

        if (deptInfo) {

            const department =
                profile.department || "Department";

            const employeeId =
                profile.employee_id || "N/A";

            deptInfo.textContent =
                `${department} • Employee ID ${employeeId}`;
        }

        const teacherEmail = document.getElementById("teacherEmail");
        if (teacherEmail && profile.email) {
            teacherEmail.textContent = `📧 ${profile.email}`;
        }

        /* ---------------- Profile Picture Manager ---------------- */
        setupProfilePicManager({
            containerId: "teacherProfilePicContainer",
            fallbackInitial: (profile.full_name || profile.username || "T").charAt(0).toUpperCase(),
            currentPic: profile.profile_pic,
            onUpdate: (newPic) => {
                if (currentUser) {
                    currentUser.profile_pic = newPic;
                    renderTopBarUser(currentUser);
                }
            }
        });

        /* ---------------- Pending Approvals ---------------- */
        let pendingReqs = [];
        let pendingStudentRegistrations = [];
        try {
            const reqData = await api("/api/teachers/enrollment-requests?status=pending");
            pendingReqs = (reqData && reqData.requests) || [];
        } catch (e) {
            console.error("Could not load approvals:", e);
        }
        try {
            const registrationData = await api("/api/teachers/student-registrations");
            pendingStudentRegistrations = registrationData.registrations || [];
        } catch (e) {
            console.error("Could not load student registrations:", e);
        }
        const totalPendingApprovals = pendingReqs.length + pendingStudentRegistrations.length;

        const statPending = document.getElementById("statPendingApprovals");
        if (statPending) {
            statPending.textContent = totalPendingApprovals;
        }

        const navBadge = document.getElementById("navApprovalBadge");
        if (navBadge) {
            if (totalPendingApprovals > 0) {
                navBadge.textContent = totalPendingApprovals;
                navBadge.style.display = "inline-block";
            } else {
                navBadge.style.display = "none";
            }
        }

        const pendingBox = document.getElementById("pendingApprovalsList");
        if (pendingBox) {
            if (!pendingReqs.length) {
                pendingBox.innerHTML = `<p class="muted" style="padding:10px 0">No pending student approval requests for your subjects.</p>`;
            } else {
                pendingBox.innerHTML = `
                    <div style="overflow-x:auto">
                        <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                            <thead>
                                <tr style="border-bottom:1px solid var(--line);color:var(--muted);font-size:0.85rem">
                                    <th style="padding:10px">Roll Number</th>
                                    <th style="padding:10px">Student Name</th>
                                    <th style="padding:10px">Branch</th>
                                    <th style="padding:10px">Requested Subject</th>
                                    <th style="padding:10px">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pendingReqs.slice(0, 5).map(r => `
                                    <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                        <td style="padding:10px"><b>${esc(r.roll_number)}</b></td>
                                        <td style="padding:10px">${esc(r.student_name)}</td>
                                        <td style="padding:10px"><span class="badge badge-branch">${esc(r.student_branch)}</span></td>
                                        <td style="padding:10px"><b>${esc(r.subject_code)}</b> - ${esc(r.subject_name)}</td>
                                        <td style="padding:10px">
                                            <button class="btn btn-sm btn-primary" onclick="quickApproveEnrollment(${r.id})" style="background:#0d9488;margin-right:6px">
                                                ✅ Approve
                                            </button>
                                            <button class="btn btn-sm btn-ghost" onclick="quickRejectEnrollment(${r.id})" style="color:var(--danger)">
                                                ❌ Reject
                                            </button>
                                        </td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                        ${pendingReqs.length > 5 ? `<div style="text-align:right;margin-top:10px"><a href="approvals.html" style="font-size:0.85rem;color:var(--t-accent);font-weight:700">View all ${pendingReqs.length} enrollment requests</a></div>` : ''}
                    </div>
                `;
            }
        }


        /* ---------------- Count students ---------------- */

        let totalStudents = 0;

        for (const subject of subjects) {

            try {

                const data = await api(
                    `/api/teachers/subjects/${subject.id}/students`
                );

                if (data && Array.isArray(data.students)) {
                    totalStudents += data.students.length;
                }

            } catch (error) {

                console.error(
                    `Could not load students for subject ${subject.id}:`,
                    error
                );

            }
        }


        /* ---------------- Statistics ---------------- */

        const statSubjects =
            document.getElementById("statSubjects");

        const statStudents =
            document.getElementById("statStudents");

        if (statSubjects) {
            statSubjects.textContent = subjects.length;
        }

        if (statStudents) {
            statStudents.textContent = totalStudents;
        }


        /* ---------------- Subject cards ---------------- */

        const wrap =
            document.getElementById("subjectCards");

        if (!wrap) {
            return;
        }


        if (!subjects.length) {

            wrap.innerHTML = `
                <p class="muted">
                    You have no subjects yet.
                    <a
                        href="subjects.html"
                        style="color:var(--t-accent);font-weight:700"
                    >
                        Add one →
                    </a>
                </p>
            `;

            return;
        }


        wrap.innerHTML = subjects.map(subject => `

            <div class="subject-card">

                <div class="code">
                    ${esc(subject.subject_code)}
                </div>

                <h3>
                    ${esc(subject.subject_name)}
                </h3>

                <div class="meta">
                    ${esc(subject.course)}
                    •
                    ${esc(subject.branch)}
                    •
                    Semester ${subject.semester}
                </div>

                <div class="actions">

                    <a
                        href="mark-attendance.html?subject=${subject.id}"
                        style="
                            background:var(--t-accent);
                            color:#fff
                        "
                    >
                        Record Attendance
                    </a>

                    <a
                        href="attendance-history.html?subject=${subject.id}"
                        style="
                            background:var(--t-accent-light);
                            color:var(--t-accent-dark)
                        "
                    >
                        View Attendance History
                    </a>

                </div>

            </div>

        `).join("");

    } catch (error) {

        console.error(
            "Teacher dashboard error:",
            error
        );

        const wrap =
            document.getElementById("subjectCards");

        if (wrap) {

            wrap.innerHTML = `
                <p class="muted">
                    Unable to load teacher dashboard.
                </p>
            `;

        }

    }
}


/* ============================================================
   Subject Management
   ============================================================ */

async function loadSubjects() {

    const mine =
        await api("/api/teachers/subjects");

    const available =
        await api("/api/teachers/available-subjects");


    const wrap =
        document.getElementById("mySubjects");


    if (wrap) {

        wrap.innerHTML = mine.length

            ? mine.map(subject => `

                <div class="subject-card">

                    <div class="code">
                        ${esc(subject.subject_code)}
                    </div>

                    <h3>
                        ${esc(subject.subject_name)}
                    </h3>

                    <div class="meta">
                        ${esc(subject.course)}
                        •
                        ${esc(subject.branch)}
                        •
                        Semester ${subject.semester}
                    </div>

                    <div class="actions">

                        <a
                            href="mark-attendance.html?subject=${subject.id}"
                            style="
                                background:var(--t-accent);
                                color:#fff
                            "
                        >
                            Record Attendance
                        </a>

                        <button
                            data-id="${subject.id}"
                            class="remove-btn"
                            style="
                                background:var(--danger-light);
                                color:var(--danger)
                            "
                        >
                            Remove Subject
                        </button>

                    </div>

                </div>

            `).join("")

            : `<p class="muted">No subjects are currently assigned to your account.</p>`;


        wrap.querySelectorAll(".remove-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    async () => {

                        if (
                            !confirm(
                                "Remove this subject from your list?"
                            )
                        ) {
                            return;
                        }

                        await api(
                            `/api/teachers/subjects/${button.dataset.id}`,
                            {
                                method: "DELETE"
                            }
                        );

                        loadSubjects();

                    }
                );

            });

    }


    /* ---------------- Available subjects ---------------- */

    const select =
        document.getElementById("assignSelect");

    if (select) {

        select.innerHTML = `
            <option value="">
                Select a subject…
            </option>
        ` +

        available.map(subject => `

            <option value="${subject.id}">
                ${esc(subject.subject_code)}
                –
                ${esc(subject.subject_name)}
            </option>

        `).join("");

    }


    /* ---------------- Assign existing subject ---------------- */

    const assignButton =
        document.getElementById("assignBtn");

    if (assignButton) {

        assignButton.onclick = async () => {

            const alertBox =
                document.getElementById("alertBox");

            if (!select.value) {

                return showAlert(
                    alertBox,
                    "Choose a subject to continue.",
                    "error"
                );

            }

            try {

                await api(
                    "/api/teachers/subjects/assign",
                    {
                        method: "POST",
                        body: {
                            subject_id:
                                Number(select.value)
                        }
                    }
                );

                showAlert(
                    alertBox,
                    "Subject assigned successfully.",
                    "success"
                );

                loadSubjects();

            } catch (error) {

                showAlert(
                    alertBox,
                    error.message,
                    "error"
                );

            }

        };

    }


    /* ---------------- Create new subject ---------------- */

    const form =
        document.getElementById("newSubjectForm");

    if (form) {

        form.onsubmit = async event => {

            event.preventDefault();

            const alertBox =
                document.getElementById("alertBox");


            const payload = {

                subject_code:
                    form.subject_code.value.trim(),

                subject_name:
                    form.subject_name.value.trim(),

                course:
                    form.course.value.trim(),

                branch:
                    form.branch.value.trim(),

                semester:
                    form.semester.value

            };


            try {

                await api(
                    "/api/teachers/subjects",
                    {
                        method: "POST",
                        body: payload
                    }
                );

                showAlert(
                    alertBox,
                    "Subject created and assigned successfully.",
                    "success"
                );

                form.reset();

                loadSubjects();

            } catch (error) {

                showAlert(
                    alertBox,
                    error.message,
                    "error"
                );

            }

        };

    }

    /* ---------------- Enrolled Students Roster ---------------- */
    initSubjectRoster(mine);

}


/* ============================================================
   Subject Enrolled Students Roster
   ============================================================ */

function initSubjectRoster(mySubjects) {
    const select = document.getElementById("rosterSubjectSelect");
    const addBtn = document.getElementById("btnAddStudentByRoll");
    const rollInput = document.getElementById("addStudentRollInput");
    const alertBox = document.getElementById("rosterAlertBox");

    if (!select) return;

    if (!mySubjects || !mySubjects.length) {
        select.innerHTML = '<option value="">No subjects assigned</option>';
        const tableBox = document.getElementById("rosterStudentsTable");
        if (tableBox) tableBox.innerHTML = '<p class="muted">You have no subjects assigned yet.</p>';
        return;
    }

    select.innerHTML = mySubjects.map(s => `
        <option value="${s.id}">
            ${esc(s.subject_code)} – ${esc(s.subject_name)} (${esc(s.branch)})
        </option>
    `).join("");

    select.onchange = () => {
        loadSubjectRoster(select.value);
    };

    const nameInput = document.getElementById("addStudentNameInput");

    if (addBtn && rollInput) {
        addBtn.onclick = async () => {
            const subjectId = select.value;
            const rollNumber = rollInput.value.trim().toUpperCase();
            const fullName = nameInput ? nameInput.value.trim() : "";

            if (!subjectId) {
                if (alertBox) showAlert(alertBox, "Choose a subject to continue.", "error");
                return;
            }
            if (!rollNumber) {
                if (alertBox) showAlert(alertBox, "Enter a valid student roll number.", "error");
                return;
            }

            try {
                const res = await api(`/api/teachers/subjects/${subjectId}/students/add`, {
                    method: "POST",
                    body: { roll_number: rollNumber, full_name: fullName }
                });
                if (alertBox) showAlert(alertBox, res.message || "Student enrolled into subject!", "success");
                rollInput.value = "";
                if (nameInput) nameInput.value = "";
                await loadSubjectRoster(subjectId);
            } catch (err) {
                if (alertBox) showAlert(alertBox, err.message, "error");
            }
        };
    }

    if (mySubjects.length > 0) {
        loadSubjectRoster(mySubjects[0].id);
    }
}

async function loadSubjectRoster(subjectId) {
    const tableBox = document.getElementById("rosterStudentsTable");
    if (!tableBox || !subjectId) return;

    tableBox.innerHTML = '<p class="muted">Loading enrolled students…</p>';
    try {
        const data = await api(`/api/teachers/subjects/${subjectId}/students`);
        const students = (data && data.students) || [];
        const subject = data && data.subject;

        if (!students.length) {
            tableBox.innerHTML = `
                <div style="text-align:center;padding:25px 10px;background:#fff;border-radius:8px;border:1px dashed var(--line)">
                    <p class="muted" style="margin-bottom:6px">No students currently enrolled in ${esc((subject && subject.subject_code) || 'this subject')}.</p>
                    <small class="muted">Enter student's roll number and name above to enroll them directly.</small>
                </div>
            `;
            return;
        }

        tableBox.innerHTML = `
            <div style="overflow-x:auto">
                <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                    <thead>
                        <tr style="border-bottom:2px solid var(--line);color:var(--muted);font-size:0.85rem">
                            <th style="padding:10px">Roll Number</th>
                            <th style="padding:10px">Student Name</th>
                            <th style="padding:10px">Branch & Course</th>
                            <th style="padding:10px">Semester</th>
                            <th style="padding:10px">Account Status</th>
                            <th style="padding:10px;text-align:center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(st => `
                            <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                <td style="padding:10px"><b>${esc(st.roll_number)}</b></td>
                                <td style="padding:10px"><b>${esc(st.full_name)}</b></td>
                                <td style="padding:10px"><span class="badge badge-branch">${esc(st.branch)}</span> ${esc(st.course)}</td>
                                <td style="padding:10px">Semester ${esc(st.semester)}</td>
                                <td style="padding:10px">
                                    ${st.user_id ? '<span class="badge badge-approved">Registered</span>' : '<span class="badge badge-pending" title="Account not created yet. Attendance will auto-sync on register.">Pending Account</span>'}
                                </td>
                                <td style="padding:10px;text-align:center">
                                    <button class="btn btn-sm btn-ghost" onclick="quickRemoveStudentFromSubject(${subjectId}, ${st.id}, '${esc(st.full_name)}')" style="color:var(--danger);font-weight:600">
                                        🗑️ Remove
                                    </button>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        tableBox.innerHTML = `<p class="muted">Failed to load roster: ${esc(err.message)}</p>`;
    }
}

async function quickRemoveStudentFromSubject(subjectId, studentId, studentName) {
    if (!confirm(`Are you sure you want to remove ${studentName} from this subject?`)) return;
    const alertBox = document.getElementById("rosterAlertBox");
    try {
        const res = await api(`/api/teachers/subjects/${subjectId}/students/${studentId}/remove`, {
            method: "POST"
        });
        if (alertBox) showAlert(alertBox, res.message || "Student removed.", "success");
        await loadSubjectRoster(subjectId);
    } catch (err) {
        if (alertBox) showAlert(alertBox, err.message, "error");
    }
}


/* ============================================================
   Mark Attendance
   ============================================================ */

let markState = {
    subjectId: null,
    date: null,
    students: [],
    statuses: {}
};


async function loadMarkPage() {

    const subjects =
        await api("/api/teachers/subjects");


    const select =
        document.getElementById("subjectSelect");


    select.innerHTML = `
        <option value="">
            Select subject…
        </option>
    ` +

    subjects.map(subject => `

        <option value="${subject.id}">
            ${esc(subject.subject_code)}
            –
            ${esc(subject.subject_name)}
        </option>

    `).join("");


    const dateInput =
        document.getElementById("dateInput");


    dateInput.value =
        new Date()
            .toISOString()
            .slice(0, 10);


    /* ---------------- URL subject ---------------- */

    const params =
        new URLSearchParams(location.search);


    if (params.get("subject")) {
        select.value =
            params.get("subject");
    }


    select.addEventListener(
        "change",
        refreshStudents
    );


    dateInput.addEventListener(
        "change",
        refreshStudents
    );


    document
        .getElementById("saveBtn")
        .addEventListener(
            "click",
            saveAttendance
        );


    document
        .getElementById("markAllPresent")
        .addEventListener(
            "click",
            () => setAll("Present")
        );


    document
        .getElementById("markAllAbsent")
        .addEventListener(
            "click",
            () => setAll("Absent")
        );


    if (select.value) {
        refreshStudents();
    }

}


async function refreshStudents() {

    const subjectId =
        document.getElementById(
            "subjectSelect"
        ).value;


    const date =
        document.getElementById(
            "dateInput"
        ).value;


    const list =
        document.getElementById(
            "studentList"
        );


    if (!subjectId || !date) {

        list.innerHTML = `
            <p class="muted">
                Select a subject and date to view the class roster.
            </p>
        `;

        return;

    }


    const data =
        await api(
            `/api/teachers/subjects/${subjectId}/students`
        );


    const existing =
        await api(
            `/api/attendance/subject/${subjectId}/date/${date}`
        );


    const existingMap = {};


    existing.forEach(record => {

        existingMap[
            record.student_id
        ] = record.status;

    });


    markState = {

        subjectId,

        date,

        students:
            data.students,

        statuses: {}

    };


    data.students.forEach(student => {

        markState.statuses[student.id] =
            existingMap[student.id]
            || "Present";

    });


    if (!data.students.length) {

        list.innerHTML = `
            <p class="muted">
                No students are enrolled in
                ${esc(data.subject.course)}
                ${esc(data.subject.branch)}
                Semester ${data.subject.semester}.
            </p>
        `;

        return;

    }


    renderStudentRows();

}


function renderStudentRows() {

    const list =
        document.getElementById(
            "studentList"
        );


    list.innerHTML =
        markState.students.map(student => {

            const status =
                markState.statuses[
                    student.id
                ];


            return `

                <div class="student-row">

                    <div class="roll">
                        ${esc(student.roll_number)}
                    </div>

                    <div class="nm">
                        ${esc(student.full_name)}
                    </div>

                    <div
                        class="muted"
                        style="font-size:.85rem"
                    >
                        ${esc(student.course)}
                        •
                        ${esc(student.branch)}
                    </div>

                    <div class="toggle">

                        <button
                            class="present ${
                                status === "Present"
                                    ? "active"
                                    : ""
                            }"
                            data-id="${student.id}"
                            data-status="Present"
                        >
                            Present
                        </button>

                        <button
                            class="absent ${
                                status === "Absent"
                                    ? "active"
                                    : ""
                            }"
                            data-id="${student.id}"
                            data-status="Absent"
                        >
                            Absent
                        </button>

                    </div>

                </div>

            `;

        }).join("");


    list
        .querySelectorAll(".toggle button")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        Number(button.dataset.id);

                    markState.statuses[id] =
                        button.dataset.status;


                    const row =
                        button.closest(
                            ".student-row"
                        );


                    row
                        .querySelectorAll(
                            ".toggle button"
                        )
                        .forEach(
                            btn =>
                                btn.classList.remove(
                                    "active"
                                )
                        );


                    button.classList.add(
                        "active"
                    );

                }
            );

        });

}


function setAll(status) {

    markState.students.forEach(student => {

        markState.statuses[
            student.id
        ] = status;

    });

    renderStudentRows();

}


async function saveAttendance() {

    const alertBox =
        document.getElementById(
            "alertBox"
        );


    if (!markState.subjectId) {

        return showAlert(
            alertBox,
            "Select a subject first.",
            "error"
        );

    }


    const records =
        markState.students.map(student => ({

            student_id:
                student.id,

            status:
                markState.statuses[
                    student.id
                ]

        }));


    if (!records.length) {

        return showAlert(
            alertBox,
            "No students to save.",
            "error"
        );

    }


    try {

        const response =
            await api(
                "/api/attendance/mark",
                {
                    method: "POST",

                    body: {
                        subject_id:
                            Number(
                                markState.subjectId
                            ),

                        date:
                            markState.date,

                        records:
                            records
                    }
                }
            );


        showAlert(
            alertBox,
            response.message,
            "success"
        );

    } catch (error) {

        showAlert(
            alertBox,
            error.message,
            "error"
        );

    }

}


/* ============================================================
   Attendance History + Report
   ============================================================ */

let teacherHistoryRecords = [];
let teacherVisibleHistoryRecords = [];
let teacherSubjectReportRecords = [];

async function loadHistoryPage() {
    const select =
        document.getElementById("subjectSelect");
    const alertBox = document.getElementById("historyAlert");

    try {
        const subjects = await api("/api/teachers/subjects");
        const requestedSubject = new URLSearchParams(location.search).get("subject");

        select.innerHTML = `
            <option value="">Select subject…</option>
            ${subjects.map(subject => `
                <option value="${subject.id}">
                    ${esc(subject.subject_code)} – ${esc(subject.subject_name)}
                </option>
            `).join("")}
        `;

        if (!subjects.length) {
            select.disabled = true;
            showHistoryMessage("No subjects are assigned to your teacher account.", "muted");
            return;
        }

        select.disabled = false;
        select.value = subjects.some(subject => String(subject.id) === requestedSubject)
            ? requestedSubject
            : String(subjects[0].id);

        select.addEventListener("change", loadHistoryData);
        document.getElementById("historySearch").addEventListener("click", searchTeacherHistory);
        document.getElementById("historyView").addEventListener("change", updateTeacherHistoryFilters);
        document.getElementById("historyRollFilter").addEventListener("keydown", event => {
            if (event.key === "Enter") searchTeacherHistory();
        });
        ["Excel", "Pdf", "Csv"].forEach(formatName => {
            const format = formatName.toLowerCase();
            const historyButton = document.getElementById(`teacherHistoryExport${formatName}`);
            const reportButton = document.getElementById(`teacherReportExport${formatName}`);
            historyButton.addEventListener("click", () => exportTeacherHistory(format));
            reportButton.addEventListener("click", () => exportTeacherSubjectReport(format));
        });
        updateTeacherHistoryFilters();
        await loadHistoryData();
    } catch (error) {
        if (alertBox) showAlert(alertBox, error.message, "error");
        showHistoryMessage("Unable to load attendance history.", "muted");
    }
}


async function loadHistoryData() {
    const subjectId =
        document.getElementById("subjectSelect").value;
    if (!subjectId) {
        return;
    }

    teacherHistoryRecords = [];
    teacherVisibleHistoryRecords = [];
    teacherSubjectReportRecords = [];
    ["teacherHistoryExportExcel", "teacherHistoryExportPdf", "teacherHistoryExportCsv",
        "teacherReportExportExcel", "teacherReportExportPdf", "teacherReportExportCsv"]
        .forEach(id => { document.getElementById(id).disabled = true; });

    const alertBox = document.getElementById("historyAlert");
    if (alertBox) alertBox.className = "alert";
    showHistoryMessage("Loading attendance records…", "muted");

    try {
        const [data, report] = await Promise.all([
            api(`/api/teachers/subjects/${subjectId}/history`),
            api(
            `/api/teachers/subjects/${subjectId}/report`
            )
        ]);
        teacherHistoryRecords = Array.isArray(data.records) ? data.records : [];
        const studentFilter = document.getElementById("historyStudentFilter");
        const students = [...new Map(teacherHistoryRecords.map(record => [
            record.roll_number,
            record.full_name
        ])).entries()].sort((first, second) => first[0].localeCompare(second[0]));
        studentFilter.innerHTML = `
            <option value="">Choose a student</option>
            ${students.map(([rollNumber, fullName]) => `
                <option value="${esc(rollNumber)}">${esc(rollNumber)} – ${esc(fullName)}</option>
            `).join("")}
        `;
        const reportRecords = Array.isArray(report.report) ? report.report : [];
        teacherSubjectReportRecords = reportRecords;
        ["Excel", "Pdf", "Csv"].forEach(formatName => {
            document.getElementById(`teacherReportExport${formatName}`).disabled = reportRecords.length === 0;
        });

        renderTeacherHistory(teacherHistoryRecords);

        const reportBody = document.getElementById("reportBody");
        reportBody.innerHTML = reportRecords.length
        ? reportRecords.map(record => `
            <tr>
                <td>${esc(record.roll_number)}</td>
                <td>${esc(record.full_name)}</td>
                <td>${record.total}</td>
                <td>${record.attended}</td>
                <td>${record.absent}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div class="progress" style="width:90px">
                            <i class="${pctClass(record.percentage)}" style="width:${record.percentage}%"></i>
                        </div>
                        <b>${record.percentage}%</b>
                    </div>
                </td>
            </tr>
        `).join("")
        : `<tr><td colspan="6" class="muted">No attendance report available for this subject.</td></tr>`;
    } catch (error) {
        if (alertBox) showAlert(alertBox, error.message, "error");
        showHistoryMessage("Unable to load attendance records. Please try again.", "muted");
    }
}

function updateTeacherHistoryFilters() {
    const view = document.getElementById("historyView").value;
    document.getElementById("historyDateFilter").style.display =
        view === "date" ? "" : "none";
    document.getElementById("historyStudentFilter").style.display =
        view === "student" ? "" : "none";
    document.getElementById("historyRollFilter").style.display =
        view === "roll" ? "" : "none";
    document.getElementById("historyStartDate").style.display =
        view === "student" || view === "roll" ? "" : "none";
    document.getElementById("historyEndDate").style.display =
        view === "student" || view === "roll" ? "" : "none";
    teacherVisibleHistoryRecords = [];
    ["Excel", "Pdf", "Csv"].forEach(formatName => {
        document.getElementById(`teacherHistoryExport${formatName}`).disabled = true;
    });

    const hints = {
        date: "Choose an attendance date to view records.",
        student: "Choose a student or specify a date range.",
        roll: "Enter the exact roll number. Date range is optional."
    };
    document.getElementById("historyBody").innerHTML =
        `<tr><td colspan="4" class="muted">${hints[view]}</td></tr>`;
}

function teacherHistoryDateKey(value) {
    const dateString = String(value || "").trim();
    const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(dateString);
    if (isoDate) return isoDate[1];

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";

    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${date.getUTCFullYear()}-${month}-${day}`;
}

function searchTeacherHistory() {
    const view = document.getElementById("historyView").value;
    const student = document.getElementById("historyStudentFilter").value;
    const date = document.getElementById("historyDateFilter").value;
    const rollNumber = document.getElementById("historyRollFilter").value.trim();
    const startDate = document.getElementById("historyStartDate").value;
    const endDate = document.getElementById("historyEndDate").value;

    if (view === "date" && !date) {
        return showTeacherHistoryFilterMessage("Choose a date before applying the filter.");
    }
    if (view === "student" && !student && !startDate && !endDate) {
        return showTeacherHistoryFilterMessage("Choose a student or specify a date range before applying the filter.");
    }
    if (view === "roll" && !/^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,99}$/.test(rollNumber)) {
        return showTeacherHistoryFilterMessage("Enter a valid roll number using letters, numbers, spaces, dots, hyphens, underscores or slashes.");
    }
    if (startDate && endDate && startDate > endDate) {
        return showTeacherHistoryFilterMessage("Start date must be on or before end date.");
    }

    const filteredRecords = teacherHistoryRecords.filter(record => {
        const recordDate = teacherHistoryDateKey(record.date);
        if (view === "date" && recordDate !== date) return false;
        if (view === "student" && student && record.roll_number !== student) return false;
        if (view === "roll" &&
            record.roll_number.toLocaleLowerCase() !== rollNumber.toLocaleLowerCase()) return false;
        if ((view === "student" || view === "roll") &&
            ((startDate && recordDate < startDate) || (endDate && recordDate > endDate))) return false;
        return true;
    });
    renderTeacherHistory(filteredRecords);
}

function showTeacherHistoryFilterMessage(message) {
    teacherVisibleHistoryRecords = [];
    ["Excel", "Pdf", "Csv"].forEach(formatName => {
        document.getElementById(`teacherHistoryExport${formatName}`).disabled = true;
    });
    document.getElementById("historyBody").innerHTML =
        `<tr><td colspan="4" class="muted">${esc(message)}</td></tr>`;
}

function renderTeacherHistory(records) {
    teacherVisibleHistoryRecords = records;
    ["Excel", "Pdf", "Csv"].forEach(formatName => {
        document.getElementById(`teacherHistoryExport${formatName}`).disabled = records.length === 0;
    });
    const historyBody = document.getElementById("historyBody");
    historyBody.innerHTML = records.length
        ? records.map(record => `
            <tr>
                <td>${prettyDate(teacherHistoryDateKey(record.date) || record.date)}</td>
                <td>${esc(record.roll_number)}</td>
                <td>${esc(record.full_name)}</td>
                <td><span class="badge badge-${record.status === "Present" ? "present" : "absent"}">${esc(record.status)}</span></td>
            </tr>
        `).join("")
        : `<tr><td colspan="4" class="muted">No attendance records found for the selected filters.</td></tr>`;
}

function exportTeacherHistory(format) {
    const subjectId = document.getElementById("subjectSelect").value;
    AttendanceExport.download(
        format,
        "Teacher Attendance History",
        ["Date", "Roll Number", "Name", "Status"],
        teacherVisibleHistoryRecords.map(record => [
            teacherHistoryDateKey(record.date),
            record.roll_number,
            record.full_name,
            record.status
        ]),
        `teacher-attendance-history-${subjectId}`
    );
}

function exportTeacherSubjectReport(format) {
    const subjectId = document.getElementById("subjectSelect").value;
    AttendanceExport.download(
        format,
        "Subject Attendance Report",
        ["Roll Number", "Name", "Total Classes", "Present", "Absent", "Attendance Percentage"],
        teacherSubjectReportRecords.map(record => [
            record.roll_number,
            record.full_name,
            Number(record.total),
            Number(record.attended),
            Number(record.absent),
            `${record.percentage}%`
        ]),
        `teacher-subject-report-${subjectId}`
    );
}

function showHistoryMessage(message, className) {
    const historyBody = document.getElementById("historyBody");
    const reportBody = document.getElementById("reportBody");
    if (historyBody) {
        historyBody.innerHTML = `<tr><td colspan="4" class="${className}">${esc(message)}</td></tr>`;
    }
    if (reportBody) {
        reportBody.innerHTML = `<tr><td colspan="6" class="${className}">${esc(message)}</td></tr>`;
    }
}


/* ============================================================
   TEACHER NAV BADGE
   ============================================================ */

async function updateTeacherNavBadge() {
    try {
        const [reqData, studentData] = await Promise.all([
            api("/api/teachers/enrollment-requests?status=pending"),
            api("/api/teachers/student-registrations")
        ]);
        const count = (reqData.requests || []).length + (studentData.registrations || []).length;
        const navBadge = document.getElementById("navApprovalBadge");
        if (navBadge) {
            if (count > 0) {
                navBadge.textContent = count;
                navBadge.style.display = "inline-block";
            } else {
                navBadge.style.display = "none";
            }
        }
    } catch (error) {
        console.error("Could not update teacher approval badge:", error);
    }
}

async function quickApproveEnrollment(id) {
    try {
        const res = await api(`/api/teachers/enrollment-requests/${id}/approve`, { method: "POST" });
        alert(res.message || "Enrollment approved successfully!");
        const page = document.body.dataset.page;
        if (page === "dashboard") await loadDashboard();
        if (page === "approvals") await loadApprovalsPage();
        updateTeacherNavBadge();
    } catch (err) {
        alert(err.message || "Failed to approve enrollment.");
    }
}

async function quickRejectEnrollment(id) {
    if (!confirm("Are you sure you want to reject this student's enrollment request?")) return;
    try {
        const res = await api(`/api/teachers/enrollment-requests/${id}/reject`, { method: "POST" });
        alert(res.message || "Enrollment rejected.");
        const page = document.body.dataset.page;
        if (page === "dashboard") await loadDashboard();
        if (page === "approvals") await loadApprovalsPage();
        updateTeacherNavBadge();
    } catch (err) {
        alert(err.message || "Failed to reject enrollment.");
    }
}


/* ============================================================
   STUDENT APPROVALS PAGE
   ============================================================ */

async function loadApprovalsPage() {
    const container = document.getElementById("approvalsTableContainer");
    const alertBox = document.getElementById("alertBox");
    const tabPendingBtn = document.getElementById("tabPendingBtn");
    const tabAllBtn = document.getElementById("tabAllBtn");
    const searchInput = document.getElementById("searchInput");

    await loadPendingStudentRegistrations();

    let currentFilter = "pending";
    let requestsData = [];

    async function fetchData() {
        if (!container) return;
        container.innerHTML = `<p class="muted" style="padding:20px 0">Loading requests…</p>`;
        try {
            const data = await api(`/api/teachers/enrollment-requests?status=${currentFilter}`);
            requestsData = (data && data.requests) || [];
            renderTable();
        } catch (err) {
            console.error("loadApprovalsPage error:", err);
            container.innerHTML = `<p class="muted">Failed to load approval requests: ${esc(err.message)}</p>`;
        }
    }

    function renderTable() {
        const query = (searchInput && searchInput.value || "").toLowerCase().trim();
        const filtered = requestsData.filter(r => {
            if (!query) return true;
            return (
                (r.student_name || "").toLowerCase().includes(query) ||
                (r.roll_number || "").toLowerCase().includes(query) ||
                (r.subject_code || "").toLowerCase().includes(query) ||
                (r.subject_name || "").toLowerCase().includes(query) ||
                (r.student_branch || "").toLowerCase().includes(query)
            );
        });

        if (!filtered.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:40px 20px">
                    <p class="muted" style="font-size:1.05rem">No ${currentFilter === "pending" ? "pending" : ""} student enrollment requests found.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="overflow-x:auto">
                <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                    <thead>
                        <tr style="border-bottom:2px solid var(--line);color:var(--muted);font-size:0.85rem">
                            <th style="padding:12px 10px">Roll Number</th>
                            <th style="padding:12px 10px">Student Name</th>
                            <th style="padding:12px 10px">Branch & Semester</th>
                            <th style="padding:12px 10px">Requested Subject</th>
                            <th style="padding:12px 10px">Date Requested</th>
                            <th style="padding:12px 10px">Status</th>
                            <th style="padding:12px 10px;text-align:center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(r => {
                            let statusBadge = "";
                            if (r.status === "approved") {
                                statusBadge = '<span class="badge badge-approved">✅ Approved</span>';
                            } else if (r.status === "pending") {
                                statusBadge = '<span class="badge badge-pending">⏳ Pending Review</span>';
                            } else {
                                statusBadge = '<span class="badge badge-rejected">❌ Rejected</span>';
                            }

                            return `
                                <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                    <td style="padding:12px 10px"><b>${esc(r.roll_number)}</b></td>
                                    <td style="padding:12px 10px">
                                        <div style="font-weight:700">${esc(r.student_name)}</div>
                                        <div style="font-size:0.78rem;color:var(--muted)">${esc(r.student_email || "")}</div>
                                    </td>
                                    <td style="padding:12px 10px">
                                        <span class="badge badge-branch">${esc(r.student_branch)}</span>
                                        <span style="font-size:0.8rem;color:var(--muted);margin-left:4px">Semester ${esc(r.semester)}</span>
                                    </td>
                                    <td style="padding:12px 10px">
                                        <b>${esc(r.subject_code)}</b> – ${esc(r.subject_name)}
                                    </td>
                                    <td style="padding:12px 10px;color:var(--muted);font-size:0.85rem">
                                        ${prettyDate(r.requested_at ? r.requested_at.split(' ')[0] : '')}
                                    </td>
                                    <td style="padding:12px 10px">${statusBadge}</td>
                                    <td style="padding:12px 10px;text-align:center">
                                        ${r.status === "pending" ? `
                                            <button class="btn btn-sm btn-primary" onclick="quickApproveEnrollment(${r.id})" style="background:#0d9488;margin-right:6px">
                                                ✅ Approve
                                            </button>
                                            <button class="btn btn-sm btn-ghost" onclick="quickRejectEnrollment(${r.id})" style="color:var(--danger)">
                                                ❌ Reject
                                            </button>
                                        ` : `
                                            <span style="font-size:0.85rem;color:var(--muted)">Reviewed</span>
                                        `}
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    if (tabPendingBtn && tabAllBtn) {
        tabPendingBtn.onclick = () => {
            currentFilter = "pending";
            tabPendingBtn.style.fontWeight = "700";
            tabPendingBtn.style.color = "var(--t-accent)";
            tabAllBtn.style.fontWeight = "400";
            tabAllBtn.style.color = "inherit";
            fetchData();
        };

        tabAllBtn.onclick = () => {
            currentFilter = "all";
            tabPendingBtn.style.fontWeight = "400";
            tabPendingBtn.style.color = "inherit";
            tabAllBtn.style.fontWeight = "700";
            tabAllBtn.style.color = "var(--t-accent)";
            fetchData();
        };
    }

    if (searchInput) {
        searchInput.oninput = () => renderTable();
    }

    /* Setup Direct Add Student form */
    const directSelect = document.getElementById("directAddSubjectSelect");
    const directRoll = document.getElementById("directAddRollInput");
    const directName = document.getElementById("directAddNameInput");
    const directBtn = document.getElementById("btnDirectAddStudent");

    if (directSelect) {
        try {
            const mine = await api("/api/teachers/subjects");
            directSelect.innerHTML = (mine || []).map(s => `
                <option value="${s.id}">${esc(s.subject_code)} – ${esc(s.subject_name)} (${esc(s.branch)})</option>
            `).join("");
        } catch (e) {
            console.error("Failed to load subjects for direct add:", e);
        }
    }

    if (directBtn && directRoll) {
        directBtn.onclick = async () => {
            const subId = directSelect ? directSelect.value : null;
            const roll = directRoll.value.trim().toUpperCase();
            const name = directName ? directName.value.trim() : "";
            if (!subId) {
                showAlert(alertBox, "Please select a subject.", "error");
                return;
            }
            if (!roll) {
                showAlert(alertBox, "Please enter student's roll number.", "error");
                return;
            }
            try {
                const res = await api(`/api/teachers/subjects/${subId}/students/add`, {
                    method: "POST",
                    body: { roll_number: roll, full_name: name }
                });
                showAlert(alertBox, res.message || "Student enrolled successfully!", "success");
                directRoll.value = "";
                if (directName) directName.value = "";
                await fetchData();
                updateTeacherNavBadge();
            } catch (err) {
                showAlert(alertBox, err.message, "error");
            }
        };
    }

    await fetchData();
}

async function loadPendingStudentRegistrations() {
    const container = document.getElementById("studentRegistrationsTable");
    if (!container) return;
    try {
        const data = await api("/api/teachers/student-registrations");
        const registrations = data.registrations || [];
        if (!registrations.length) {
            container.innerHTML = '<p class="muted">No student accounts are waiting for approval.</p>';
            return;
        }
        container.innerHTML = `
            <div style="overflow-x:auto">
                <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                    <thead><tr>
                        <th style="padding:10px">Name</th>
                        <th style="padding:10px">Username</th>
                        <th style="padding:10px">Email</th>
                        <th style="padding:10px">Roll Number</th>
                        <th style="padding:10px">Branch</th>
                        <th style="padding:10px;text-align:center">Actions</th>
                    </tr></thead>
                    <tbody>${registrations.map(user => `
                        <tr style="border-top:1px solid var(--line)">
                            <td style="padding:10px">${esc(user.full_name || "—")}</td>
                            <td style="padding:10px">${esc(user.username)}</td>
                            <td style="padding:10px">${esc(user.email)}</td>
                            <td style="padding:10px">${esc(user.roll_number || "—")}</td>
                            <td style="padding:10px">${esc(user.branch || "—")}</td>
                            <td style="padding:10px;text-align:center">
                                <button class="btn btn-sm btn-primary" onclick="reviewStudentRegistration(${user.id}, 'approve')">Approve</button>
                                <button class="btn btn-sm btn-ghost" onclick="reviewStudentRegistration(${user.id}, 'reject')" style="color:var(--danger)">Reject</button>
                            </td>
                        </tr>
                    `).join("")}</tbody>
                </table>
            </div>`;
    } catch (error) {
        container.innerHTML = `<p class="muted">Failed to load student registrations: ${esc(error.message)}</p>`;
    }
}

async function reviewStudentRegistration(userId, action) {
    if (action === "reject" && !confirm("Reject this student account?")) return;
    try {
        const result = await api(`/api/teachers/student-registrations/${userId}/${action}`, { method: "POST" });
        showAlert(document.getElementById("alertBox"), result.message, "success");
        await loadPendingStudentRegistrations();
        await updateTeacherNavBadge();
    } catch (error) {
        showAlert(document.getElementById("alertBox"), error.message, "error");
    }
}