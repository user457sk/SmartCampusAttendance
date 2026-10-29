/* ============================================================
   student.js
   SmartCampus - Student Panel

   Handles:
   - Student Dashboard
   - Date-wise Attendance
   - Subject-wise Attendance
   - Monthly Attendance

   Backend prefix:
   /api/students
   ============================================================ */


document.addEventListener("DOMContentLoaded", async () => {

    const user = await requireRole("student");

    if (!user) {
        return;
    }

    markActiveNav();
    renderTopBarUser(user);

    const page = document.body.dataset.page;

    try {

        if (page === "dashboard") {
            await loadDashboard(user);
        }

        if (page === "enroll") {
            await loadEnrollPage();
        }

        if (page === "attendance") {
            await loadAttendance();
        }

        if (page === "subject") {
            await loadSubjectAttendance();
        }

        if (page === "monthly") {
            await loadMonthly();
        }

    } catch (error) {

        console.error("Student page error:", error);

        showPageError(
            "We couldn't load this page. Refresh and try again."
        );
    }
});


/* ============================================================
   STUDENT DASHBOARD
   ============================================================ */

async function loadDashboard(currentUser) {

    const d = await api("/api/students/dashboard");

    if (!d || d.success === false) {

        throw new Error(
            d?.error || "Unable to load the student dashboard."
        );
    }


    /* --------------------------------------------------------
       Student information
       -------------------------------------------------------- */

    const student = d.student || {};

    const studentName =
        student.full_name ||
        student.username ||
        "Student";

    const rollNumber =
        student.roll_number ||
        "-";

    const course =
        student.course ||
        "-";

    const branch =
        student.branch ||
        "-";

    const semester =
        student.semester ??
        "-";


    const studentNameEl =
        document.getElementById("studentName");

    if (studentNameEl) {
        studentNameEl.textContent = studentName;
    }


    const rollEl =
        document.getElementById("rollNumber");

    if (rollEl) {
        rollEl.textContent = rollNumber;
    }


    const courseEl =
        document.getElementById("courseInfo");

    if (courseEl) {

        courseEl.textContent =
            `${course} • ${branch} • Semester ${semester}`;
    }

    /* --------------------------------------------------------
       Setup Profile Picture Manager
       -------------------------------------------------------- */
    setupProfilePicManager({
        containerId: "profilePicContainer",
        fallbackInitial: (studentName || "S").charAt(0).toUpperCase(),
        currentPic: student.profile_pic,
        onUpdate: (newPic) => {
            if (currentUser) {
                currentUser.profile_pic = newPic;
                renderTopBarUser(currentUser);
            }
        }
    });


    /* --------------------------------------------------------
       Attendance data
       -------------------------------------------------------- */

    const attendance =
        d.attendance || {};


    const totalClasses =
        Number(attendance.total_classes || 0);

    const attended =
        Number(attendance.classes_attended || 0);

    const absent =
        Number(attendance.classes_absent || 0);

    let percentage =
        Number(
            attendance.attendance_percentage || 0
        );


    if (
        !Number.isFinite(percentage) ||
        percentage < 0
    ) {

        percentage =
            totalClasses > 0
                ? (attended / totalClasses) * 100
                : 0;
    }


    percentage =
        Math.max(
            0,
            Math.min(
                100,
                Number(percentage.toFixed(2))
            )
        );


    /* --------------------------------------------------------
       Subjects
       -------------------------------------------------------- */

    const subjects =
        Array.isArray(d.subjects)
            ? d.subjects
            : [];


    /* --------------------------------------------------------
       Dashboard statistics
       -------------------------------------------------------- */

    const statSubjects =
        document.getElementById("statSubjects");

    if (statSubjects) {
        statSubjects.textContent = subjects.length;
    }


    const statTotal =
        document.getElementById("statTotal");

    if (statTotal) {
        statTotal.textContent = totalClasses;
    }


    const statAttended =
        document.getElementById("statAttended");

    if (statAttended) {
        statAttended.textContent = attended;
    }


    const statAbsent =
        document.getElementById("statAbsent");

    if (statAbsent) {
        statAbsent.textContent = absent;
    }


    /* --------------------------------------------------------
       Percentage Ring
       -------------------------------------------------------- */

    const ring =
        document.getElementById("ring");

    if (ring) {

        ring.style.setProperty(
            "--val",
            percentage
        );
    }


    const ringVal =
        document.getElementById("ringVal");

    if (ringVal) {
        ringVal.textContent = percentage + "%";
    }


    /* --------------------------------------------------------
       Overall attendance message
       -------------------------------------------------------- */

    const overallText =
        document.getElementById("overallText");

    if (overallText) {

        if (totalClasses === 0) {

            overallText.textContent =
                "No attendance has been recorded yet.";

        } else if (percentage >= 75) {

            overallText.textContent =
                "Attendance is above the 75% requirement.";

        } else if (percentage >= 50) {

            overallText.textContent =
                "Attendance is approaching the minimum requirement. Attend upcoming classes regularly.";

        } else {

            overallText.textContent =
                "Attendance is below the 50% threshold. Attend upcoming classes regularly.";
        }
    }


    /* --------------------------------------------------------
       Subject-wise progress
       -------------------------------------------------------- */

    const list =
        document.getElementById("subjectList");

    if (!list) {
        return;
    }


    if (!subjects.length) {

        list.innerHTML = `
            <p class="muted">
                No attendance recorded yet.
            </p>
        `;

        return;
    }


    list.innerHTML =
        subjects.map(subject => {

            const subjectTotal =
                Number(
                    subject.total_classes ??
                    subject.total ??
                    0
                );

            const subjectAttended =
                Number(
                    subject.classes_attended ??
                    subject.attended ??
                    0
                );

            let subjectPercentage =
                Number(
                    subject.attendance_percentage ??
                    subject.percentage ??
                    0
                );


            if (
                subjectTotal > 0 &&
                (
                    subject.attendance_percentage === undefined &&
                    subject.percentage === undefined
                )
            ) {

                subjectPercentage =
                    (subjectAttended / subjectTotal) * 100;
            }


            subjectPercentage =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Number(
                            subjectPercentage.toFixed(2)
                        )
                    )
                );


            return `
                <div class="subj-row">

                    <div>

                        <div class="name">
                            ${esc(
                                subject.subject_name ||
                                "Unknown Subject"
                            )}
                        </div>

                        <div
                            class="muted"
                            style="font-size:.8rem"
                        >
                            ${esc(
                                subject.subject_code ||
                                "-"
                            )}
                        </div>

                    </div>


                    <div class="progress">

                        <i
                            class="${pctClass(subjectPercentage)}"
                            style="width:${subjectPercentage}%"
                        ></i>

                    </div>


                    <div class="pct">
                        ${subjectPercentage}%
                    </div>

                </div>
            `;

        }).join("");

    /* --------------------------------------------------------
       Subject Approvals & Enrollments
       -------------------------------------------------------- */
    const enrollBox = document.getElementById("enrollmentList");
    if (enrollBox) {
        const enrollments = d.enrollments || [];
        if (!enrollments.length) {
            enrollBox.innerHTML = `
                <div style="text-align:center;padding:24px 10px">
                    <p class="muted" style="margin-bottom:12px">You have not enrolled in any subjects yet.</p>
                    <a href="enroll.html" class="btn btn-primary btn-sm" style="text-decoration:none">
                        Browse & Enroll in Subjects →
                    </a>
                </div>
            `;
        } else {
            enrollBox.innerHTML = `
                <div style="overflow-x:auto">
                    <table class="table" style="width:100%;text-align:left;border-collapse:collapse">
                        <thead>
                            <tr style="border-bottom:1px solid var(--line);color:var(--muted);font-size:0.85rem">
                                <th style="padding:10px">Subject Code</th>
                                <th style="padding:10px">Subject Name</th>
                                <th style="padding:10px">Branch</th>
                                <th style="padding:10px">Subject Teacher</th>
                                <th style="padding:10px">Approval Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${enrollments.map(e => {
                                let badgeHtml = '';
                                if (e.status === 'approved') {
                                    badgeHtml = '<span class="badge badge-approved">Approved and Enrolled</span>';
                                } else if (e.status === 'pending') {
                                    badgeHtml = '<span class="badge badge-pending">Pending Approval</span>';
                                } else {
                                    badgeHtml = `<span class="badge badge-rejected">Rejected</span> <a href="enroll.html" style="font-size:0.8rem;margin-left:6px;font-weight:600">Submit a New Request</a>`;
                                }
                                return `
                                    <tr style="border-bottom:1px solid var(--line);font-size:0.9rem">
                                        <td style="padding:10px"><b>${esc(e.subject_code)}</b></td>
                                        <td style="padding:10px">${esc(e.subject_name)}</td>
                                        <td style="padding:10px"><span class="badge badge-branch">${esc(e.branch || '-')}</span></td>
                                        <td style="padding:10px">${esc(e.teacher_name || 'Subject Teacher')}</td>
                                        <td style="padding:10px">${badgeHtml}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    }
}


/* ============================================================
   STUDENT ENROLLMENT PAGE (BRANCH RESTRICTED)
   ============================================================ */

async function loadEnrollPage() {
    const cardsContainer = document.getElementById("availableSubjectCards");
    const alertBox = document.getElementById("alertBox");

    try {
        const data = await api("/api/students/available-subjects");
        if (!data || !data.success) {
            if (cardsContainer) cardsContainer.innerHTML = `<p class="muted">Available subjects could not be loaded.</p>`;
            return;
        }

        const branch = data.student_branch || "N/A";
        const course = data.student_course || "Course";

        const badgeEl = document.getElementById("branchBadge");
        if (badgeEl) badgeEl.textContent = `Branch: ${branch}`;

        const infoEl = document.getElementById("studentInfoText");
        if (infoEl) infoEl.textContent = `${course} (${branch})`;

        let subjects = data.subjects || [];
        let showAll = false;

        const filterMyBranchBtn = document.getElementById("filterMyBranchBtn");
        const filterAllBtn = document.getElementById("filterAllBtn");

        function renderCards() {
            const listToRender = showAll ? subjects : subjects.filter(s => s.is_my_branch);
            if (!listToRender.length) {
                cardsContainer.innerHTML = `<p class="muted" style="padding:20px 0">No subjects are available ${showAll ? "on this campus" : "for your branch (" + esc(branch) + ")"}.</p>`;
                return;
            }

            cardsContainer.innerHTML = listToRender.map(sub => {
                let statusBlock = "";
                if (!sub.is_my_branch) {
                    statusBlock = `
                        <div style="margin-top:14px;background:#fff1f2;padding:10px;border-radius:8px">
                            <span class="badge badge-rejected" style="font-size:0.75rem">Other Branch (${esc(sub.branch)})</span>
                            <p style="font-size:0.8rem;color:#b91c1c;margin-top:6px;font-weight:600">Enrollment is limited to your assigned branch.</p>
                            <button class="btn btn-sm" disabled style="opacity:0.5;cursor:not-allowed;width:100%;margin-top:6px">Not Eligible</button>
                        </div>
                    `;
                } else if (sub.enrollment_status === "approved") {
                    statusBlock = `
                        <div style="margin-top:14px">
                            <span class="badge badge-approved" style="font-size:0.85rem">Enrolled and Approved</span>
                            <p style="font-size:0.8rem;color:var(--muted);margin-top:6px">Instructor: <b>${esc(sub.teacher_names)}</b></p>
                        </div>
                    `;
                } else if (sub.enrollment_status === "pending") {
                    statusBlock = `
                        <div style="margin-top:14px;background:#fefce8;padding:10px;border-radius:8px;border:1px solid #fef08a">
                            <span class="badge badge-pending">Pending Approval</span>
                            <p style="font-size:0.8rem;color:#854d0e;margin-top:6px">
                                Request submitted to <b>${esc(sub.teacher_names)}</b> for review.
                            </p>
                        </div>
                    `;
                } else if (sub.enrollment_status === "rejected") {
                    statusBlock = `
                        <div style="margin-top:14px">
                            <span class="badge badge-rejected">Request Declined</span>
                            <div style="margin-top:8px">
                                <button class="btn btn-sm btn-primary" onclick="requestEnroll(${sub.id})" style="width:100%">
                                    Submit a New Enrollment Request
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    statusBlock = `
                        <div style="margin-top:14px">
                            <p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px">Instructor: <b>${esc(sub.teacher_names)}</b></p>
                            <button class="btn btn-sm btn-primary" onclick="requestEnroll(${sub.id})" style="width:100%">
                                Request Enrollment
                            </button>
                        </div>
                    `;
                }

                return `
                    <div class="panel" style="margin-top:0;display:flex;flex-direction:column;justify-content:space-between;border:${sub.is_my_branch ? '1px solid var(--line)' : '1px dashed #cbd5e1'};background:${sub.is_my_branch ? '#fff' : '#f8fafc'}">
                        <div>
                            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                                <span style="font-weight:800;color:var(--primary);font-size:1.15rem">${esc(sub.subject_code)}</span>
                                <span class="badge ${sub.is_my_branch ? 'badge-branch' : ''}">${esc(sub.branch)}</span>
                            </div>
                            <h4 style="margin:10px 0 6px;font-size:1.05rem">${esc(sub.subject_name)}</h4>
                            <p class="muted" style="font-size:0.85rem">${esc(sub.course)} • Semester ${esc(sub.semester)}</p>
                        </div>
                        ${statusBlock}
                    </div>
                `;
            }).join("");
        }

        if (filterMyBranchBtn && filterAllBtn) {
            filterMyBranchBtn.onclick = () => {
                showAll = false;
                filterMyBranchBtn.style.fontWeight = "700";
                filterMyBranchBtn.style.color = "var(--primary)";
                filterAllBtn.style.fontWeight = "400";
                filterAllBtn.style.color = "inherit";
                renderCards();
            };
            filterAllBtn.onclick = () => {
                showAll = true;
                filterMyBranchBtn.style.fontWeight = "400";
                filterMyBranchBtn.style.color = "inherit";
                filterAllBtn.style.fontWeight = "700";
                filterAllBtn.style.color = "var(--primary)";
                renderCards();
            };
        }

        renderCards();

    } catch (err) {
        console.error("loadEnrollPage error:", err);
        if (cardsContainer) cardsContainer.innerHTML = `<p class="muted">Unable to load subjects: ${esc(err.message)}</p>`;
    }
}

async function requestEnroll(subjectId) {
    const alertBox = document.getElementById("alertBox");
    try {
        const res = await api("/api/students/enroll", {
            method: "POST",
            body: { subject_id: subjectId }
        });
        if (alertBox) showAlert(alertBox, res.message || "Enrollment request submitted to the subject teacher!", "success");
        await loadEnrollPage();
    } catch (err) {
        if (alertBox) showAlert(alertBox, err.message, "error");
    }
}



/* ============================================================
   DATE-WISE ATTENDANCE
   ============================================================ */

async function loadAttendance() {
    const records = await api("/api/students/attendance");
    const tbody = document.getElementById("recordsBody");
    const viewFilter = document.getElementById("attendanceHistoryView");
    const subjectFilter = document.getElementById("attendanceHistorySubject");
    const dateFilter = document.getElementById("attendanceHistoryDate");
    const searchButton = document.getElementById("attendanceHistorySearch");

    if (!tbody) return;

    const attendanceRecords = Array.isArray(records) ? records : [];
    let visibleRecords = [];
    document.querySelectorAll(".attendance-export").forEach(button => {
        button.disabled = true;
    });
    const subjects = [...new Map(attendanceRecords.map(record => {
        const key = record.subject_code || record.subject_name;
        return key ? [key, record] : null;
    }).filter(Boolean)).entries()];

    subjectFilter.innerHTML = `
        <option value="">Choose a subject</option>
        ${subjects.map(([key, record]) => `
            <option value="${esc(key)}">${esc(record.subject_code ? `${record.subject_code} – ` : "")}${esc(record.subject_name || "")}</option>
        `).join("")}
    `;
    subjectFilter.disabled = subjects.length === 0;
    searchButton.disabled = attendanceRecords.length === 0;

    const updateFilters = () => {
        const isSubjectView = viewFilter.value === "subject";
        subjectFilter.style.display = isSubjectView ? "" : "none";
        dateFilter.style.display = isSubjectView ? "none" : "";
        visibleRecords = [];
        document.querySelectorAll(".attendance-export").forEach(button => {
            button.disabled = true;
        });
        tbody.innerHTML = `
            <tr><td colspan="4" class="muted">
                ${attendanceRecords.length ? "Choose a subject or date, then select Apply Filter." : "No attendance records are available."}
            </td></tr>
        `;
    };

    const render = rows => {
        visibleRecords = rows;
        document.querySelectorAll(".attendance-export").forEach(button => {
            button.disabled = rows.length === 0;
        });
        tbody.innerHTML = rows.length
            ? rows.map(record => {
                const status = record.status || "-";
                const statusClass = status.toLowerCase() === "present" ? "present" : "absent";
                return `
                    <tr>
                        <td>${prettyDate(record.date)}</td>
                        <td>${esc(record.subject_name || "-")}</td>
                        <td>${esc(record.subject_code || "-")}</td>
                        <td><span class="badge badge-${statusClass}">${esc(status)}</span></td>
                    </tr>
                `;
            }).join("")
            : `<tr><td colspan="4" class="muted">No attendance records match the selected filter.</td></tr>`;
    };

    document.querySelectorAll(".attendance-export").forEach(button => {
        button.addEventListener("click", () => {
            const rows = visibleRecords.map(record => [
                dateKey(record.date),
                record.subject_name || "",
                record.subject_code || "",
                record.status || ""
            ]);
            AttendanceExport.download(
                button.dataset.format,
                "Student Attendance History",
                ["Date", "Subject", "Code", "Status"],
                rows,
                "student-attendance-history"
            );
        });
    });

    const dateKey = value => {
        const dateString = String(value || "").trim();
        const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(dateString);
        if (isoDate) return isoDate[1];

        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return "";
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    };

    viewFilter.addEventListener("change", updateFilters);
    searchButton.addEventListener("click", () => {
        if (viewFilter.value === "subject") {
            if (!subjectFilter.value) {
                tbody.innerHTML = `<tr><td colspan="4" class="muted">Choose a subject before applying the filter.</td></tr>`;
                return;
            }
            render(attendanceRecords.filter(record =>
                (record.subject_code || record.subject_name) === subjectFilter.value
            ));
            return;
        }

        if (!dateFilter.value) {
            tbody.innerHTML = `<tr><td colspan="4" class="muted">Choose a date before applying the filter.</td></tr>`;
            return;
        }
        render(attendanceRecords.filter(record => dateKey(record.date) === dateFilter.value));
    });

    updateFilters();
}


/* ============================================================
   SUBJECT-WISE ATTENDANCE
   ============================================================ */

async function loadSubjectAttendance() {

    const subjects =
        await api(
            "/api/students/subject-attendance"
        );


    const wrap =
        document.getElementById("subjectCards");


    if (!wrap) {
        return;
    }


    const subjectList =
        Array.isArray(subjects)
            ? subjects
            : [];


    if (!subjectList.length) {

        wrap.innerHTML = `
            <p class="muted">
                No attendance recorded yet.
            </p>
        `;

        return;
    }


    wrap.innerHTML =
        subjectList.map(subject => {

            const total =
                Number(
                    subject.total_classes ??
                    subject.total ??
                    0
                );


            const attended =
                Number(
                    subject.classes_attended ??
                    subject.attended ??
                    0
                );


            const absent =
                Number(
                    subject.classes_absent ??
                    subject.absent ??
                    0
                );


            let percentage =
                Number(
                    subject.attendance_percentage ??
                    subject.percentage ??
                    0
                );


            if (
                total > 0 &&
                (
                    subject.attendance_percentage === undefined &&
                    subject.percentage === undefined
                )
            ) {

                percentage =
                    (attended / total) * 100;
            }


            percentage =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Number(percentage.toFixed(2))
                    )
                );


            return `
                <div class="card">

                    <div
                        class="muted"
                        style="
                            font-weight:800;
                            font-size:.78rem;
                            letter-spacing:.5px
                        "
                    >
                        ${esc(
                            subject.subject_code || "-"
                        )}
                    </div>


                    <h3>
                        ${esc(
                            subject.subject_name ||
                            "Unknown Subject"
                        )}
                    </h3>


                    <div
                        class="progress"
                        style="margin:14px 0 10px"
                    >

                        <i
                            class="${pctClass(percentage)}"
                            style="width:${percentage}%"
                        ></i>

                    </div>


                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            font-size:.88rem
                        "
                    >

                        <span class="muted">
                            Attended
                            <b>${attended}</b>
                            / ${total}
                        </span>


                        <span style="font-weight:800">
                            ${percentage}%
                        </span>

                    </div>


                    <div style="margin-top:10px">

                        <span
                            class="badge badge-present"
                        >
                            Present ${attended}
                        </span>


                        <span
                            class="badge badge-absent"
                        >
                            Absent ${absent}
                        </span>

                    </div>

                </div>
            `;

        }).join("");
}


/* ============================================================
   MONTHLY ATTENDANCE
   ============================================================ */

async function loadMonthly() {

    const months =
        await api(
            "/api/students/monthly-attendance"
        );


    const tbody =
        document.getElementById("monthlyBody");


    if (!tbody) {
        return;
    }


    const monthlyData =
        Array.isArray(months)
            ? months
            : [];


    if (!monthlyData.length) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="muted"
                >
                    No attendance records are available.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        monthlyData.map(month => {

            const total =
                Number(month.total || 0);

            const attended =
                Number(month.attended || 0);

            const absent =
                Number(month.absent || 0);


            let percentage =
                Number(month.percentage || 0);


            if (
                month.percentage === undefined
            ) {

                percentage =
                    total > 0
                        ? (attended / total) * 100
                        : 0;
            }


            percentage =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Number(percentage.toFixed(2))
                    )
                );


            return `
                <tr>

                    <td>
                        ${esc(
                            month.month || "-"
                        )}
                    </td>


                    <td>
                        ${total}
                    </td>


                    <td>

                        <span
                            class="badge badge-present"
                        >
                            ${attended}
                        </span>

                    </td>


                    <td>

                        <span
                            class="badge badge-absent"
                        >
                            ${absent}
                        </span>

                    </td>


                    <td>

                        <div
                            style="
                                display:flex;
                                align-items:center;
                                gap:10px
                            "
                        >

                            <div
                                class="progress"
                                style="width:90px"
                            >

                                <i
                                    class="${pctClass(percentage)}"
                                    style="width:${percentage}%"
                                ></i>

                            </div>


                            <b>
                                ${percentage}%
                            </b>

                        </div>

                    </td>

                </tr>
            `;

        }).join("");
}


/* ============================================================
   PAGE ERROR
   ============================================================ */

function showPageError(message) {

    console.error(message);


    const possibleContainers = [
        document.getElementById("subjectList"),
        document.getElementById("subjectCards"),
        document.getElementById("recordsBody"),
        document.getElementById("monthlyBody")
    ];


    const container =
        possibleContainers.find(
            element => element
        );


    if (!container) {
        return;
    }


    if (container.tagName === "TBODY") {

        container.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="muted"
                >
                    ${esc(message)}
                </td>
            </tr>
        `;

    } else {

        container.innerHTML = `
            <p class="muted">
                ${esc(message)}
            </p>
        `;
    }
}