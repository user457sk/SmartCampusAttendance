/* ============================================================
   login.js – powers login.html and register.html
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("loginForm")) initLogin();
    if (document.getElementById("registerForm")) initRegister();
});

/* ---------------- LOGIN ---------------- */
function initLogin() {
    const form = document.getElementById("loginForm");
    const alertBox = document.getElementById("alertBox");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = form.username.value.trim();
        const password = form.password.value;
        try {
            const res = await api("/api/auth/login", {
                method: "POST",
                body: { username, password },
            });
            showAlert(alertBox, "Login successful! Redirecting…", "success");
            setTimeout(() => { window.location.href = res.redirect; }, 600);
        } catch (err) {
            showAlert(alertBox, err.message, "error");
        }
    });
}

/* ---------------- REGISTER ---------------- */
function initRegister() {
    const form = document.getElementById("registerForm");
    const alertBox = document.getElementById("alertBox");
    let role = "student";

    // Role switch buttons
    document.querySelectorAll(".role-switch button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".role-switch button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            role = btn.dataset.role;
            document.querySelectorAll(".student-only").forEach(el => el.style.display = role === "student" ? "" : "none");
            document.querySelectorAll(".teacher-only").forEach(el => el.style.display = role === "teacher" ? "" : "none");
        });
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            role,
            username: form.username.value.trim(),
            email: form.email.value.trim(),
            password: form.password.value,
            full_name: form.full_name.value.trim(),
            phone: form.phone.value.trim(),
        };
        if (role === "student") {
            payload.roll_number = form.roll_number.value.trim();
            payload.course = form.course.value.trim();
            payload.branch = form.branch.value.trim();
            payload.semester = form.semester.value;
        } else {
            payload.department = form.department.value.trim();
            payload.employee_id = form.employee_id.value.trim();
        }
        try {
            await api("/api/auth/register", { method: "POST", body: payload });
            showAlert(alertBox, "Registration submitted. You can log in after an administrator approves your teacher account, or an administrator/teacher approves your student account.", "success");
            form.reset();
        } catch (err) {
            showAlert(alertBox, err.message, "error");
        }
    });
}
