(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { students: [], records: [], role: 'teacher', month: new Date() };
  const today = localDate(new Date());

  function localDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options || {}));
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Request failed (' + response.status + ')');
    return body;
  }

  function showMessage(id, message, isError) {
    const element = $(id);
    if (!element) return;
    element.textContent = message || '';
    element.style.color = isError ? '#b42318' : '#147d57';
  }

  function getCounts(entries) {
    const counts = { present: 0, absent: 0, late: 0 };
    (entries || []).forEach((entry) => {
      const status = String(entry.status || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    });
    return counts;
  }

  function studentById(id) {
    return state.students.find((student) => String(student.id) === String(id));
  }

  function renderStudents() {
    const body = $('studentTableBody');
    if (!state.students.length) {
      body.innerHTML = '<tr><td colspan="4">No students found. Add students to start taking attendance.</td></tr>';
      return;
    }
    body.innerHTML = state.students.map((student) => (
      '<tr><td>' + escapeHtml(student.rollNo) + '</td>' +
      '<td>' + escapeHtml(student.name) + '</td>' +
      '<td>' + escapeHtml(student.className) + '</td><td>' +
      '<select class="student-status" data-student-id="' + escapeHtml(student.id) + '" aria-label="Attendance status for ' + escapeHtml(student.name) + '">' +
      '<option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option>' +
      '</select></td></tr>'
    )).join('');
  }

  function populateTeacherSelects() {
    const names = Array.from(new Set(state.records.map((record) => String(record.teacher || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
    ['historyTeacher', 'adminTeacher'].forEach((id) => {
      const select = $(id);
      if (!select) return;
      const previous = select.value;
      select.innerHTML = '<option value="">All teachers</option>';
      names.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
      if (names.includes(previous)) select.value = previous;
    });
  }

  function renderSummary() {
    api('/api/summary').then((summary) => {
      $('summaryStats').innerHTML =
        '<div class="stat"><span>Total Students</span><strong>' + escapeHtml(summary.totalStudents || 0) + '</strong></div>' +
        '<div class="stat"><span>Present</span><strong>' + escapeHtml(summary.present || 0) + '</strong></div>' +
        '<div class="stat"><span>Absent</span><strong>' + escapeHtml(summary.absent || 0) + '</strong></div>' +
        '<div class="stat"><span>Late</span><strong>' + escapeHtml(summary.late || 0) + '</strong></div>';
    }).catch((error) => {
      $('summaryStats').textContent = 'Unable to load summary: ' + error.message;
    });
  }

  function selectedRecordFilters() {
    return {
      date: $('selectedDate').value,
      time: $('selectedTime').value,
      subject: $('subjectFilter').value.trim()
    };
  }

  function filterRecords(records, filter) {
    return records.filter((record) => {
      if (filter.teacher && String(record.teacher || '') !== filter.teacher) return false;
      if (filter.subject && !String(record.subject || '').toLowerCase().includes(filter.subject.toLowerCase())) return false;
      if (filter.from && String(record.date || '') < filter.from) return false;
      if (filter.to && String(record.date || '') > filter.to) return false;
      return true;
    });
  }

  function renderRecordCards(targetId, records, emptyMessage) {
    const target = $(targetId);
    if (!records.length) {
      target.innerHTML = '<p>' + escapeHtml(emptyMessage || 'No attendance records match these filters.') + '</p>';
      return;
    }
    target.innerHTML = records.map((record) => {
      const counts = getCounts(record.entries);
      const entries = (record.entries || []).map((entry) => {
        const student = studentById(entry.studentId);
        return '<tr><td>' + escapeHtml(student ? student.rollNo : '') + '</td>' +
          '<td>' + escapeHtml(student ? student.name : 'Unknown student') + '</td>' +
          '<td>' + escapeHtml(student ? student.className : '') + '</td>' +
          '<td><span class="status-pill status-' + escapeHtml(String(entry.status || 'absent').toLowerCase()) + '">' +
          escapeHtml(String(entry.status || 'absent').toUpperCase()) + '</span></td></tr>';
      }).join('');
      return '<article class="history-record card">' +
        '<div class="section-head"><div><h3>' + escapeHtml(record.subject || 'Untitled subject') + '</h3>' +
        '<p>' + escapeHtml(record.date || '') + ' · ' + escapeHtml(record.time || '') + ' · Teacher: ' + escapeHtml(record.teacher || 'Unknown') + '</p></div>' +
        '<span class="pill">' + (record.entries || []).length + ' students</span></div>' +
        '<p class="record-counts">Present: ' + counts.present + ' · Absent: ' + counts.absent + ' · Late: ' + counts.late + '</p>' +
        '<details><summary>View student-wise attendance</summary><div class="student-table-wrap"><table><thead><tr><th>Roll</th><th>Student</th><th>Class</th><th>Status</th></tr></thead><tbody>' +
        (entries || '<tr><td colspan="4">No student statuses saved for this session.</td></tr>') +
        '</tbody></table></div></details></article>';
    }).join('');
  }

  function renderRecordList() {
    const filter = selectedRecordFilters();
    const records = state.records.filter((record) => {
      if (filter.date && String(record.date) !== filter.date) return false;
      if (filter.time && String(record.time) !== filter.time) return false;
      if (filter.subject && !String(record.subject || '').toLowerCase().includes(filter.subject.toLowerCase())) return false;
      return true;
    });
    renderRecordCards('recordsList', records, 'No records found for the selected date, time, and subject.');
  }

  function renderHistory() {
    const teacher = $('historyTeacher').value;
    const records = filterRecords(state.records, {
      teacher,
      subject: $('historySubject').value.trim(),
      from: $('historyFrom').value,
      to: $('historyTo').value
    });
    renderRecordCards('historyList', records, 'No history found. Try a different teacher, subject, or date range.');
  }

  function renderAdminAttendance() {
    const teacher = $('adminTeacher').value;
    const records = filterRecords(state.records, {
      teacher,
      subject: $('adminSubject').value.trim(),
      from: $('adminFrom').value,
      to: $('adminTo').value
    });
    renderRecordCards('adminAttendanceList', records, 'No attendance records match the admin filters.');
  }

  function renderCalendar() {
    const title = $('calendarTitle');
    const grid = $('calendarGrid');
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    title.textContent = state.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const recordDates = new Set(state.records.map((record) => record.date));
    const cells = [];
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((day) => {
      cells.push('<div class="calendar-day-label">' + day + '</div>');
    });
    for (let i = 0; i < firstDay; i += 1) cells.push('<div class="calendar-day empty"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const selected = $('selectedDate').value === date ? ' selected' : '';
      const hasRecords = recordDates.has(date) ? ' has-records' : '';
      cells.push('<button type="button" class="calendar-day' + selected + hasRecords + '" data-date="' + date + '">' + day + '</button>');
    }
    grid.innerHTML = cells.join('');
  }

  async function refreshData() {
    try {
      const result = await Promise.all([api('/api/students'), api('/api/records')]);
      state.students = Array.isArray(result[0]) ? result[0] : [];
      state.records = Array.isArray(result[1]) ? result[1] : [];
      renderStudents();
      populateTeacherSelects();
      renderRecordList();
      renderHistory();
      renderAdminAttendance();
      renderSummary();
      renderCalendar();
    } catch (error) {
      showMessage('attendanceMessage', 'Could not load attendance data: ' + error.message, true);
      $('recordsList').textContent = 'Could not load records: ' + error.message;
    }
  }

  function setRole(role) {
    state.role = role === 'admin' ? 'admin' : 'teacher';
    document.querySelectorAll('[data-role]').forEach((button) => {
      button.classList.toggle('active', button.dataset.role === state.role);
      button.setAttribute('aria-pressed', button.dataset.role === state.role ? 'true' : 'false');
    });
    $('adminAttendancePanel').classList.toggle('hidden', state.role !== 'admin');
    $('teacherHistoryPanel').classList.toggle('hidden', state.role === 'admin');
    $('takeAttendancePanel').classList.toggle('hidden', state.role === 'admin');
    $('addStudentPanel').classList.toggle('hidden', state.role === 'admin');
    renderRecordList();
    renderHistory();
    renderAdminAttendance();
  }

  $('selectedDate').value = today;
  $('attendanceDate').value = today;
  $('attendanceTime').value = $('selectedTime').value || '09:00';

  $('selectedDate').addEventListener('change', () => {
    $('attendanceDate').value = $('selectedDate').value;
    renderCalendar();
    renderRecordList();
  });
  $('selectedTime').addEventListener('change', () => {
    $('attendanceTime').value = $('selectedTime').value;
    renderRecordList();
  });
  $('subjectFilter').addEventListener('input', renderRecordList);
  $('applyRecordFilters').addEventListener('click', renderRecordList);
  $('attendanceDate').addEventListener('change', () => { $('selectedDate').value = $('attendanceDate').value; renderCalendar(); });
  $('attendanceTime').addEventListener('change', () => { $('selectedTime').value = $('attendanceTime').value; });
  $('prevMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
  $('nextMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
  $('calendarGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button) return;
    $('selectedDate').value = button.dataset.date;
    $('attendanceDate').value = button.dataset.date;
    state.month = new Date(button.dataset.date + 'T12:00:00');
    renderCalendar();
    renderRecordList();
  });

  $('markAllPresent').addEventListener('click', () => {
    document.querySelectorAll('.student-status').forEach((select) => { select.value = 'present'; });
  });
  $('markAllAbsent').addEventListener('click', () => {
    document.querySelectorAll('.student-status').forEach((select) => { select.value = 'absent'; });
  });

  $('attendanceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const teacher = $('teacherName').value.trim();
    const subject = $('subjectName').value.trim();
    if (!teacher || !subject || !state.students.length) {
      showMessage('attendanceMessage', state.students.length ? 'Enter teacher and subject.' : 'Add students before saving attendance.', true);
      return;
    }
    const entries = Array.from(document.querySelectorAll('.student-status')).map((select) => ({
      studentId: select.dataset.studentId,
      status: select.value
    }));
    try {
      await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({
          date: $('attendanceDate').value,
          time: $('attendanceTime').value,
          subject,
          teacher,
          entries
        })
      });
      showMessage('attendanceMessage', 'Attendance saved successfully.', false);
      await refreshData();
    } catch (error) {
      showMessage('attendanceMessage', 'Could not save attendance: ' + error.message, true);
    }
  });

  $('studentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/students', {
        method: 'POST',
        body: JSON.stringify({
          name: $('studentNameInput').value.trim(),
          rollNo: $('studentRollInput').value.trim(),
          className: $('studentClassInput').value.trim()
        })
      });
      $('studentForm').reset();
      showMessage('studentMessage', 'Student added successfully.', false);
      await refreshData();
    } catch (error) {
      showMessage('studentMessage', 'Could not add student: ' + error.message, true);
    }
  });

  $('historySearchBtn').addEventListener('click', renderHistory);
  $('adminSearchBtn').addEventListener('click', renderAdminAttendance);
  ['historyTeacher', 'historySubject', 'historyFrom', 'historyTo'].forEach((id) => {
    $(id).addEventListener('change', renderHistory);
  });
  ['adminTeacher', 'adminSubject', 'adminFrom', 'adminTo'].forEach((id) => {
    $(id).addEventListener('change', renderAdminAttendance);
  });
  document.querySelectorAll('[data-role]').forEach((button) => {
    button.addEventListener('click', () => setRole(button.dataset.role));
  });
  $('exportCsv').addEventListener('click', () => { window.location.href = '/api/export/csv'; });
  $('printPdf').addEventListener('click', () => { window.print(); });

  $('selectedContext').textContent = 'Choose date, time, subject, and teacher';
  setRole('teacher');
  refreshData();
})();