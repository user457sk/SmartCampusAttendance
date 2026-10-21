const STORAGE_KEY = 'smartcampus_attendance_v1';

const demoStudents = [
  { id: 'stu-1', name: 'Aisha Khan', rollNo: '101', className: 'BCA-1' },
  { id: 'stu-2', name: 'Rahul Verma', rollNo: '102', className: 'BCA-1' },
  { id: 'stu-3', name: 'Neha Sharma', rollNo: '103', className: 'BCA-1' },
  { id: 'stu-4', name: 'Mohit Singh', rollNo: '104', className: 'BCA-1' },
  { id: 'stu-5', name: 'Priya Nair', rollNo: '105', className: 'BCA-1' },
  { id: 'stu-6', name: 'Arjun Patel', rollNo: '106', className: 'BCA-2' },
  { id: 'stu-7', name: 'Sara Ali', rollNo: '107', className: 'BCA-2' },
  { id: 'stu-8', name: 'Vikram Joshi', rollNo: '108', className: 'BCA-2' },
];

const demoRecords = [
  {
    id: 'rec-1',
    date: getTodayDate(),
    time: '09:00',
    subject: 'Mathematics',
    teacher: 'Mrs. Sharma',
    entries: [
      { studentId: 'stu-1', status: 'present' },
      { studentId: 'stu-2', status: 'present' },
      { studentId: 'stu-3', status: 'late' },
      { studentId: 'stu-4', status: 'absent' },
      { studentId: 'stu-5', status: 'present' },
      { studentId: 'stu-6', status: 'present' },
      { studentId: 'stu-7', status: 'absent' },
      { studentId: 'stu-8', status: 'present' },
    ],
  },
  {
    id: 'rec-2',
    date: getDateOffset(-1),
    time: '11:00',
    subject: 'Physics',
    teacher: 'Mr. Mehta',
    entries: [
      { studentId: 'stu-1', status: 'present' },
      { studentId: 'stu-2', status: 'absent' },
      { studentId: 'stu-3', status: 'present' },
      { studentId: 'stu-4', status: 'present' },
      { studentId: 'stu-5', status: 'late' },
      { studentId: 'stu-6', status: 'present' },
      { studentId: 'stu-7', status: 'present' },
      { studentId: 'stu-8', status: 'absent' },
    ],
  },
];

const defaultState = {
  students: demoStudents,
  records: demoRecords,
};

const state = loadState();

const refs = {
  calendarGrid: document.getElementById('calendarGrid'),
  calendarTitle: document.getElementById('calendarTitle'),
  selectedDate: document.getElementById('selectedDate'),
  selectedTime: document.getElementById('selectedTime'),
  subjectFilter: document.getElementById('subjectFilter'),
  studentTableBody: document.getElementById('studentTableBody'),
  attendanceForm: document.getElementById('attendanceForm'),
  studentForm: document.getElementById('studentForm'),
  recordsList: document.getElementById('recordsList'),
  summaryStats: document.getElementById('summaryStats'),
  selectedContext: document.getElementById('selectedContext'),
  attendanceDate: document.getElementById('attendanceDate'),
  attendanceTime: document.getElementById('attendanceTime'),
  subjectName: document.getElementById('subjectName'),
  teacherName: document.getElementById('teacherName'),
  markAllPresent: document.getElementById('markAllPresent'),
  markAllAbsent: document.getElementById('markAllAbsent'),
  exportCsv: document.getElementById('exportCsv'),
  printPdf: document.getElementById('printPdf'),
  roleButtons: [...document.querySelectorAll('.role-btn')],
};

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedCalendarDate = getTodayDate();
let activeRole = 'teacher';

initialize();

function initialize() {
  refs.selectedDate.value = selectedCalendarDate;
  refs.attendanceDate.value = selectedCalendarDate;
  refs.attendanceTime.value = refs.selectedTime.value;
  refs.selectedTime.addEventListener('input', () => {
    renderStudentStatusTable();
    renderRecords();
  });
  refs.subjectFilter.addEventListener('input', renderRecords);
  refs.selectedDate.addEventListener('input', (event) => {
    selectedCalendarDate = event.target.value || getTodayDate();
    refs.attendanceDate.value = selectedCalendarDate;
    renderCalendar();
    renderStudentStatusTable();
    renderRecords();
  });

  refs.attendanceDate.addEventListener('input', () => {
    selectedCalendarDate = refs.attendanceDate.value;
    refs.selectedDate.value = selectedCalendarDate;
    renderCalendar();
    renderStudentStatusTable();
    renderRecords();
  });

  refs.attendanceTime.addEventListener('input', () => {
    refs.selectedTime.value = refs.attendanceTime.value;
    renderStudentStatusTable();
    renderRecords();
  });

  refs.studentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addStudent();
  });

  refs.attendanceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveAttendance();
  });

  refs.markAllPresent.addEventListener('click', () => setAllStudentStatus('present'));
  refs.markAllAbsent.addEventListener('click', () => setAllStudentStatus('absent'));
  refs.exportCsv.addEventListener('click', exportCsv);
  refs.printPdf.addEventListener('click', () => window.print());

  refs.roleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeRole = button.dataset.role;
      refs.roleButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
      renderRecords();
      renderSummary();
    });
  });

  document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));

  renderCalendar();
  renderStudentStatusTable();
  renderRecords();
  renderSummary();
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
      return structuredClone(defaultState);
    }
    const parsed = JSON.parse(stored);
    return {
      students: Array.isArray(parsed.students) ? parsed.students : defaultState.students,
      records: Array.isArray(parsed.records) ? parsed.records : defaultState.records,
    };
  } catch (error) {
    console.warn('Unable to load saved state:', error);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderCalendar() {
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(currentYear, currentMonth + 1, 0);
  const startDay = new Date(currentYear, currentMonth, 1).getDay();
  const firstCalendarDay = new Date(currentYear, currentMonth, 1 - startDay);

  refs.calendarTitle.textContent = monthStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  refs.calendarGrid.innerHTML = '';

  weekdayNames.forEach((day) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = day;
    refs.calendarGrid.appendChild(cell);
  });

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstCalendarDay);
    date.setDate(firstCalendarDay.getDate() + i);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.textContent = date.getDate();

    const dateKey = formatIsoDate(date);
    if (date.getMonth() !== currentMonth) {
      button.classList.add('outside');
    }
    if (dateKey === getTodayDate()) {
      button.classList.add('today');
    }
    if (dateKey === selectedCalendarDate) {
      button.classList.add('selected');
    }

    button.addEventListener('click', () => {
      selectedCalendarDate = dateKey;
      refs.selectedDate.value = dateKey;
      refs.attendanceDate.value = dateKey;
      renderCalendar();
      renderStudentStatusTable();
      renderRecords();
    });

    refs.calendarGrid.appendChild(button);
  }
}

function renderStudentStatusTable() {
  const students = state.students;
  if (!students.length) {
    refs.studentTableBody.innerHTML = '<tr><td colspan="4">No students added yet.</td></tr>';
    return;
  }

  if (!refs.attendanceDate.value) {
    refs.attendanceDate.value = selectedCalendarDate;
  }

  const recordsForSelected = state.records.filter((record) => {
    const sameDate = record.date === refs.attendanceDate.value;
    const sameTime = record.time === refs.selectedTime.value || record.time === refs.attendanceTime.value;
    const sameSubject = !refs.subjectFilter.value || record.subject.toLowerCase().includes(refs.subjectFilter.value.trim().toLowerCase());
    return sameDate && sameTime && sameSubject;
  });

  const existingAttendance = recordsForSelected[0];
  const attendanceMap = new Map();
  if (existingAttendance) {
    existingAttendance.entries.forEach((entry) => {
      attendanceMap.set(entry.studentId, entry.status);
    });
  }

  refs.subjectName.value = existingAttendance ? existingAttendance.subject : refs.subjectName.value || 'Mathematics';
  refs.teacherName.value = existingAttendance ? existingAttendance.teacher : refs.teacherName.value || 'Teacher';

  refs.selectedContext.textContent = `${refs.attendanceDate.value} • ${refs.attendanceTime.value}`;

  refs.studentTableBody.innerHTML = students
    .map((student) => {
      const status = attendanceMap.get(student.id) || 'absent';
      return `
        <tr>
          <td>${student.rollNo}</td>
          <td>${student.name}</td>
          <td>${student.className}</td>
          <td>
            <div class="status-group">
              <button type="button" class="status-btn present ${status === 'present' ? 'active' : ''}" data-student-id="${student.id}" data-status="present">Present</button>
              <button type="button" class="status-btn late ${status === 'late' ? 'active' : ''}" data-student-id="${student.id}" data-status="late">Late</button>
              <button type="button" class="status-btn absent ${status === 'absent' ? 'active' : ''}" data-student-id="${student.id}" data-status="absent">Absent</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  refs.studentTableBody.querySelectorAll('.status-btn').forEach((button) => {
    button.addEventListener('click', () => {
      updateStudentStatus(button.dataset.studentId, button.dataset.status);
    });
  });
}

function updateStudentStatus(studentId, status) {
  const currentDate = refs.attendanceDate.value || selectedCalendarDate;
  const currentTime = refs.attendanceTime.value || refs.selectedTime.value;
  const subject = refs.subjectName.value.trim() || 'Mathematics';
  const teacher = refs.teacherName.value.trim() || 'Teacher';

  const existingIndex = state.records.findIndex(
    (record) => record.date === currentDate && record.time === currentTime && record.subject === subject && record.teacher === teacher,
  );

  if (existingIndex >= 0) {
    const entryIndex = state.records[existingIndex].entries.findIndex((entry) => entry.studentId === studentId);
    if (entryIndex >= 0) {
      state.records[existingIndex].entries[entryIndex].status = status;
    } else {
      state.records[existingIndex].entries.push({ studentId, status });
    }
  } else {
    state.records.unshift({
      id: crypto.randomUUID(),
      date: currentDate,
      time: currentTime,
      subject,
      teacher,
      entries: [{ studentId, status }],
    });
  }

  saveState();
  renderStudentStatusTable();
  renderRecords();
  renderSummary();
}

function setAllStudentStatus(status) {
  const currentDate = refs.attendanceDate.value || selectedCalendarDate;
  const currentTime = refs.attendanceTime.value || refs.selectedTime.value;
  const subject = refs.subjectName.value.trim() || 'Mathematics';
  const teacher = refs.teacherName.value.trim() || 'Teacher';

  const existingIndex = state.records.findIndex(
    (record) => record.date === currentDate && record.time === currentTime && record.subject === subject && record.teacher === teacher,
  );

  const entries = state.students.map((student) => ({ studentId: student.id, status }));

  if (existingIndex >= 0) {
    state.records[existingIndex].entries = entries;
  } else {
    state.records.unshift({
      id: crypto.randomUUID(),
      date: currentDate,
      time: currentTime,
      subject,
      teacher,
      entries,
    });
  }

  saveState();
  renderStudentStatusTable();
  renderRecords();
  renderSummary();
}

function saveAttendance() {
  const date = refs.attendanceDate.value;
  const time = refs.attendanceTime.value;
  const subject = refs.subjectName.value.trim();
  const teacher = refs.teacherName.value.trim();

  if (!date || !time || !subject || !teacher) {
    alert('Please fill all attendance fields before saving.');
    return;
  }

  const entries = state.students.map((student) => ({
    studentId: student.id,
    status: getStudentStatusFromCurrentTable(student.id),
  }));

  const existingIndex = state.records.findIndex(
    (record) => record.date === date && record.time === time && record.subject === subject && record.teacher === teacher,
  );

  if (existingIndex >= 0) {
    state.records[existingIndex].entries = entries;
  } else {
    state.records.unshift({
      id: crypto.randomUUID(),
      date,
      time,
      subject,
      teacher,
      entries,
    });
  }

  saveState();
  renderStudentStatusTable();
  renderRecords();
  renderSummary();
  alert('Attendance saved successfully.');
}

function getStudentStatusFromCurrentTable(studentId) {
  const button = refs.studentTableBody.querySelector(`.status-btn[data-student-id="${studentId}"].active`);
  if (!button) {
    return 'absent';
  }
  return button.dataset.status;
}

function renderRecords() {
  const selectedDate = refs.selectedDate.value || selectedCalendarDate;
  const selectedTime = refs.selectedTime.value || '09:00';
  const filterText = refs.subjectFilter.value.trim().toLowerCase();

  const filtered = state.records.filter((record) => {
    const matchesDate = record.date === selectedDate;
    const matchesTime = !selectedTime || record.time === selectedTime;
    const matchesSubject = !filterText || record.subject.toLowerCase().includes(filterText);
    return matchesDate && matchesTime && matchesSubject;
  });

  if (!filtered.length) {
    refs.recordsList.innerHTML = '<div class="empty-state">No attendance record found for this date and time.</div>';
    return;
  }

  refs.recordsList.innerHTML = filtered
    .map((record) => {
      const counts = getCounts(record.entries);
      return `
        <div class="record-item">
          <div class="record-head">
            <div>
              <div class="record-title">${record.subject}</div>
              <div class="record-meta">${record.teacher} • ${record.date} • ${record.time}</div>
            </div>
            <div class="record-meta">P: ${counts.present} | A: ${counts.absent} | L: ${counts.late}</div>
          </div>
          <div class="record-meta">Students: ${record.entries.length}</div>
        </div>
      `;
    })
    .join('');
}

function renderSummary() {
  const records = state.records;
  const totalPresent = records.reduce((sum, record) => sum + getCounts(record.entries).present, 0);
  const totalAbsent = records.reduce((sum, record) => sum + getCounts(record.entries).absent, 0);
  const totalLate = records.reduce((sum, record) => sum + getCounts(record.entries).late, 0);
  const totalStudents = state.students.length;

  refs.summaryStats.innerHTML = `
    <div class="stat-box">
      <div class="label">Total Students</div>
      <div class="value">${totalStudents}</div>
    </div>
    <div class="stat-box">
      <div class="label">Present</div>
      <div class="value">${totalPresent}</div>
    </div>
    <div class="stat-box">
      <div class="label">Absent</div>
      <div class="value">${totalAbsent}</div>
    </div>
    <div class="stat-box">
      <div class="label">Late</div>
      <div class="value">${totalLate}</div>
    </div>
  `;
}

function addStudent() {
  const name = document.getElementById('studentNameInput').value.trim();
  const rollNo = document.getElementById('studentRollInput').value.trim();
  const className = document.getElementById('studentClassInput').value.trim();

  if (!name || !rollNo || !className) {
    alert('Please fill all student details.');
    return;
  }

  state.students.push({
    id: crypto.randomUUID(),
    name,
    rollNo,
    className,
  });

  saveState();
  renderStudentStatusTable();
  renderSummary();
  refs.studentForm.reset();
}

function getCounts(entries) {
  const counts = { present: 0, absent: 0, late: 0 };
  entries.forEach((entry) => {
    if (counts[entry.status] !== undefined) {
      counts[entry.status] += 1;
    }
  });
  return counts;
}

function changeMonth(delta) {
  const nextDate = new Date(currentYear, currentMonth + delta, 1);
  currentMonth = nextDate.getMonth();
  currentYear = nextDate.getFullYear();
  renderCalendar();
}

function exportCsv() {
  const rows = [['Date', 'Time', 'Subject', 'Teacher', 'Student', 'Roll', 'Class', 'Status']];

  state.records.forEach((record) => {
    const studentMap = new Map(state.students.map((student) => [student.id, student]));
    record.entries.forEach((entry) => {
      const student = studentMap.get(entry.studentId);
      rows.push([
        record.date,
        record.time,
        record.subject,
        record.teacher,
        student ? student.name : 'Unknown',
        student ? student.rollNo : '',
        student ? student.className : '',
        entry.status,
      ]);
    });
  });

  const csv = rows.map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'attendance-records.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDate() {
  return formatIsoDate(new Date());
}

function getDateOffset(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatIsoDate(date);
}

window.addEventListener('beforeunload', saveState);
