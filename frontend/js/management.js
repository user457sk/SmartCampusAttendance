
const pageRole = document.body.dataset.role;

async function api(path, options = {}) {
  const response = await fetch(`/api/management${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showMessage(message) {
  const element = document.getElementById("message");
  element.textContent = message;
}

async function loadStudents() {
  const data = await api("/students");
  const body = document.querySelector("#studentsTable tbody");
  body.replaceChildren();

  data.students.forEach(student => {
    const row = document.createElement("tr");

    const values = [
      student.roll_number,
      student.full_name,
      student.course,
      student.branch,
      student.semester,
      student.phone,
      student.email
    ];

    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value ?? "";
      row.appendChild(cell);
    });

    const actions = document.createElement("td");
    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.onclick = () => editStudent(student);

    actions.appendChild(edit);

    if (pageRole === "admin") {
      const remove = document.createElement("button");
      remove.textContent = "Delete account";
      remove.onclick = () => deleteAccount(
        "student", student, student.username
      );
      actions.appendChild(remove);
    }

    row.appendChild(actions);
    body.appendChild(row);
  });
}

async function loadTeachers() {
  const data = await api("/teachers");
  const body = document.querySelector("#teachersTable tbody");
  body.replaceChildren();

  data.teachers.forEach(teacher => {
    const row = document.createElement("tr");

    [
      teacher.full_name,
      teacher.employee_id,
      teacher.department,
      teacher.phone,
      teacher.email
    ].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value ?? "";
      row.appendChild(cell);
    });

    const actions = document.createElement("td");
    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.onclick = () => editTeacher(teacher);

    const remove = document.createElement("button");
    remove.textContent = "Delete account";
    remove.onclick = () => deleteAccount(
      "teacher", teacher, teacher.username
    );

    actions.append(edit, remove);
    row.appendChild(actions);
    body.appendChild(row);
  });
}

async function editStudent(student) {
  const full_name = prompt("Student name:", student.full_name);
  if (full_name === null) return;

  const roll_number = prompt("Roll number:", student.roll_number);
  if (roll_number === null) return;

  const course = prompt("Course:", student.course);
  if (course === null) return;

  const branch = prompt("Branch:", student.branch);
  if (branch === null) return;

  const semester = prompt("Semester:", student.semester);
  if (semester === null) return;

  const phone = prompt("Phone:", student.phone || "");
  if (phone === null) return;

  const payload = {
    full_name, roll_number, course, branch,
    semester, phone
  };

  if (pageRole === "admin") {
    payload.username = prompt("Username:", student.username);
    if (payload.username === null) return;

    payload.email = prompt("Email:", student.email);
    if (payload.email === null) return;
  }

  try {
    const result = await api(`/students/${student.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    showMessage(result.message);
    await loadStudents();
  } catch (error) {
    showMessage(error.message);
  }
}

async function editTeacher(teacher) {
  if (pageRole !== "admin") return;

  const full_name = prompt("Teacher name:", teacher.full_name);
  if (full_name === null) return;

  const department = prompt("Department:", teacher.department);
  if (department === null) return;

  const employee_id = prompt("Employee ID:", teacher.employee_id);
  if (employee_id === null) return;

  const phone = prompt("Phone:", teacher.phone || "");
  if (phone === null) return;

  const username = prompt("Username:", teacher.username);
  if (username === null) return;

  const email = prompt("Email:", teacher.email);
  if (email === null) return;

  try {
    const result = await api(`/teachers/${teacher.id}`, {
      method: "PUT",
      body: JSON.stringify({
        full_name, department, employee_id,
        phone, username, email
      })
    });

    showMessage(result.message);
    await loadTeachers();
  } catch (error) {
    showMessage(error.message);
  }
}

async function deleteAccount(role, profile, username) {
  if (pageRole !== "admin") return;

  if (!confirm(
    `Delete ${role} account "${username}"? This may delete related records.`
  )) return;

  const userId = profile.user_id;
  if (!userId) {
    showMessage("Account ID is missing; nothing was deleted.");
    return;
  }

  try {
    const result = await api(`/accounts/${role}/${userId}`, {
      method: "DELETE"
    });

    showMessage(result.message);

    if (role === "student") await loadStudents();
    else await loadTeachers();
  } catch (error) {
    showMessage(error.message);
  }
}

async function initManagement() {
  try {
    await loadStudents();

    if (pageRole === "admin") {
      await loadTeachers();
    }
  } catch (error) {
    showMessage(error.message);
  }
}

initManagement();
