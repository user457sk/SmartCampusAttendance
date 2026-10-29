/* ============================================================
   script.js – shared helpers used by every page
   ============================================================ */

/* Small wrapper around fetch that always talks JSON and always sends
   the session cookie. Throws an Error with the server message on failure. */
async function api(path, options = {}) {
    const opts = Object.assign({ credentials: "same-origin", headers: {} }, options);
    if (opts.body && typeof opts.body !== "string") {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
        throw new Error((data && data.error) || "Request failed (" + res.status + ")");
    }
    return data;
}

/* Toggle the mobile navigation menu on the landing page. */
function toggleNav() {
    const links = document.getElementById("navLinks");
    if (links) links.classList.toggle("open");
}

/* Toggle the sidebar on dashboard pages. */
function toggleSidebar() {
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.toggle("open");
}

/* Redirect to a login page if the visitor is not logged in with `role`.
   Returns the user object when access is allowed. */
async function requireRole(role) {
    try {
        const user = await api("/api/auth/me");
        if (role && user.role !== role) {
            window.location.href = "/login.html";
            return null;
        }
        return user;
    } catch (e) {
        window.location.href = "/login.html";
        return null;
    }
}

/* Log the user out and send them home. */
async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (e) {}
    window.location.href = "/index.html";
}

/* Return the CSS class used to colour a progress bar by percentage. */
function pctClass(pct) {
    if (pct >= 75) return "p-high";
    if (pct >= 50) return "p-mid";
    return "p-low";
}

/* Escape user-supplied text before injecting it into the DOM. */
function esc(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* Show a message inside an alert element. */
function showAlert(el, message, type = "error") {
    if (!el) return;
    el.textContent = message;
    el.className = "alert alert-" + type + " show";
}

/* Format ISO dates and the RFC-style dates returned for PostgreSQL date values. */
function prettyDate(value) {
    if (!value) return "";

    const dateString = String(value);
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    const date = isoDate
        ? new Date(Date.UTC(
            Number(isoDate[1]),
            Number(isoDate[2]) - 1,
            Number(isoDate[3])
        ))
        : new Date(dateString);

    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    });
}

/* Highlight the active sidebar link based on the current file name. */
function markActiveNav() {
    const here = location.pathname.split("/").pop();
    document.querySelectorAll(".sidebar nav a").forEach(a => {
        if (a.getAttribute("href") === here) a.classList.add("active");
    });
}

/* Render topbar user chip with username and profile picture */
function renderTopBarUser(user) {
    if (!user) return;
    const nameEl = document.getElementById("userName");
    if (nameEl) nameEl.textContent = user.username || "User";

    const userChip = document.querySelector(".topbar .user-chip");
    if (!userChip) return;

    let avatarContainer = userChip.querySelector(".avatar, .avatar-img");
    const initial = (user.username || "U").charAt(0).toUpperCase();

    if (user.profile_pic) {
        if (avatarContainer && avatarContainer.tagName === "IMG") {
            avatarContainer.src = user.profile_pic;
        } else if (avatarContainer) {
            const img = document.createElement("img");
            img.className = "avatar-img";
            img.src = user.profile_pic;
            img.alt = user.username || "Avatar";
            avatarContainer.replaceWith(img);
        }
    } else {
        if (avatarContainer && avatarContainer.tagName === "IMG") {
            const span = document.createElement("span");
            span.className = "avatar";
            span.textContent = initial;
            avatarContainer.replaceWith(span);
        } else if (avatarContainer) {
            avatarContainer.textContent = initial;
        }
    }
}

/* Profile picture management UI (Upload & Remove) */
function setupProfilePicManager({ containerId, fallbackInitial = "U", currentPic = null, onUpdate = null }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    function render(pic) {
        container.innerHTML = `
            <div class="avatar-interactive" id="${containerId}_avatarBox">
                ${pic ? `<img src="${pic}" alt="Profile Picture" id="${containerId}_img" />` : `<span class="avatar-fallback" id="${containerId}_txt">${esc(fallbackInitial)}</span>`}
            </div>
            <div>
                <input type="file" id="${containerId}_fileInput" accept="image/*" style="display:none" />
                <div class="avatar-actions-bar">
                    <button type="button" class="btn-avatar" id="${containerId}_btnUpload">
                        📷 ${pic ? "Change Photo" : "Upload Photo"}
                    </button>
                    ${pic ? `<button type="button" class="btn-avatar btn-avatar-danger" id="${containerId}_btnRemove">🗑️ Remove</button>` : ""}
                </div>
                <div id="${containerId}_msg" style="font-size:0.75rem;margin-top:4px;color:var(--muted)"></div>
            </div>
        `;

        const fileInput = document.getElementById(`${containerId}_fileInput`);
        const btnUpload = document.getElementById(`${containerId}_btnUpload`);
        const btnRemove = document.getElementById(`${containerId}_btnRemove`);
        const msgEl = document.getElementById(`${containerId}_msg`);

        btnUpload.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            msgEl.textContent = "Uploading...";
            msgEl.style.color = "var(--primary)";

            const formData = new FormData();
            formData.append("picture", file);

            try {
                const res = await fetch("/api/profile/picture", {
                    method: "POST",
                    credentials: "same-origin",
                    body: formData,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Upload failed");

                msgEl.textContent = "Photo updated successfully!";
                msgEl.style.color = "var(--success)";
                render(data.profile_pic);
                if (typeof onUpdate === "function") onUpdate(data.profile_pic);
            } catch (err) {
                msgEl.textContent = err.message;
                msgEl.style.color = "var(--danger)";
            }
        });

        if (btnRemove) {
            btnRemove.addEventListener("click", async () => {
                if (!confirm("Are you sure you want to remove your profile picture?")) return;
                msgEl.textContent = "Removing...";
                try {
                    const res = await fetch("/api/profile/picture", {
                        method: "DELETE",
                        credentials: "same-origin",
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Removal failed");

                    msgEl.textContent = "Photo removed.";
                    render(null);
                    if (typeof onUpdate === "function") onUpdate(null);
                } catch (err) {
                    msgEl.textContent = err.message;
                    msgEl.style.color = "var(--danger)";
                }
            });
        }
    }

    render(currentPic);
}
