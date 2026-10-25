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
    if (!body) return;
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
    const teacherSelects = ['historyTeacher'];
    const names = Array.from(new Set(state.records.map((record) => String(record.teacher || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));

    teacherSelects.forEach((id) => {
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
    const summaryTarget = $('summaryStats');
    if (!summaryTarget) return;
    api('/api/summary').then((summary) => {
      summaryTarget.innerHTML =
        '<div class="stat-box"><div class="label">Total Students</div><div class="value">' + escapeHtml(summary.totalStudents || 0) + '</div></div>' +
        '<div class="stat-box"><div class="label">Present</div><div class="value">' + escapeHtml(summary.present || 0) + '</div></div>' +
        '<div class="stat-box"><div class="label">Absent</div><div class="value">' + escapeHtml(summary.absent || 0) + '</div></div>' +
        '<div class="stat-box"><div class="label">Late</div><div class="value">' + escapeHtml(summary.late || 0) + '</div></div>';
    }).catch((error) => {
      summaryTarget.textContent = 'Unable to load summary: ' + error.message;
    });
  }

  function selectedRecordFilters() {
    return {
      date: $('selectedDate') ? $('selectedDate').value : '',
      time: $('selectedTime') ? $('selectedTime').value : '',
      subject: $('subjectFilter') ? $('subjectFilter').value.trim() : ''
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
    if (!target) return;
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
          '<td><span class="status-pill ' + escapeHtml(String(entry.status || 'absent').toLowerCase()) + '">' +
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
    const teacherSelect = $('historyTeacher');
    if (!teacherSelect) return;
    const records = filterRecords(state.records, {
      teacher: teacherSelect.value,
      subject: $('historySubject') ? $('historySubject').value.trim() : '',
      from: $('historyFrom') ? $('historyFrom').value : '',
      to: $('historyTo') ? $('historyTo').value : ''
    });
    renderRecordCards('historyList', records, 'No history found. Try a different teacher, subject, or date range.');
  }

  function renderCalendar() {
    const title = $('calendarTitle');
    const grid = $('calendarGrid');
    if (!title || !grid) return;
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    title.textContent = state.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const recordDates = new Set(state.records.map((record) => record.date));
    const cells = [];
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((day) => {
      cells.push('<div class="calendar-weekday">' + day + '</div>');
    });
    for (let i = 0; i < firstDay; i += 1) cells.push('<div class="day outside"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const selected = $('selectedDate') && $('selectedDate').value === date ? ' selected' : '';
      const hasRecords = recordDates.has(date) ? ' today' : '';
      cells.push('<button type="button" class="day' + selected + hasRecords + '" data-date="' + date + '">' + day + '</button>');
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
      renderSummary();
      renderCalendar();
    } catch (error) {
      showMessage('attendanceMessage', 'Could not load attendance data: ' + error.message, true);
      const recordsList = $('recordsList');
      if (recordsList) recordsList.textContent = 'Could not load records: ' + error.message;
    }
  }

  function setRole(role) {
    state.role = role === 'admin' ? 'admin' : 'teacher';
    document.querySelectorAll('[data-role]').forEach((button) => {
      button.classList.toggle('active', button.dataset.role === state.role);
      button.setAttribute('aria-pressed', button.dataset.role === state.role ? 'true' : 'false');
    });

    const panelVisibility = [
      ['teacherHistoryPanel', true],
      ['takeAttendancePanel', true],
      ['addStudentPanel', true]
    ];

    panelVisibility.forEach(([id, visible]) => {
      const panel = $(id);
      if (panel) panel.classList.toggle('hidden', !visible);
    });

    renderRecordList();
    renderHistory();
  }

  function bindRoleButtons() {
    document.querySelectorAll('[data-role]').forEach((button) => {
      button.addEventListener('click', () => setRole(button.dataset.role));
    });
  }

  if ($('selectedDate')) $('selectedDate').value = today;
  if ($('attendanceDate')) $('attendanceDate').value = today;
  if ($('selectedTime') && $('attendanceTime')) {
    $('selectedTime').value = $('selectedTime').value || '09:00';
    $('attendanceTime').value = $('selectedTime').value;
  }

  if ($('selectedDate')) {
    $('selectedDate').addEventListener('change', () => {
      if ($('attendanceDate')) $('attendanceDate').value = $('selectedDate').value;
      renderCalendar();
      renderRecordList();
    });
  }

  if ($('selectedTime')) {
    $('selectedTime').addEventListener('change', () => {
      if ($('attendanceTime')) $('attendanceTime').value = $('selectedTime').value;
      renderRecordList();
    });
  }

  if ($('subjectFilter')) $('subjectFilter').addEventListener('input', renderRecordList);
  if ($('applyRecordFilters')) $('applyRecordFilters').addEventListener('click', renderRecordList);
  if ($('attendanceDate')) {
    $('attendanceDate').addEventListener('change', () => {
      if ($('selectedDate')) $('selectedDate').value = $('attendanceDate').value;
      renderCalendar();
    });
  }
  if ($('attendanceTime')) {
    $('attendanceTime').addEventListener('change', () => {
      if ($('selectedTime')) $('selectedTime').value = $('attendanceTime').value;
    });
  }
  if ($('prevMonth')) {
    $('prevMonth').addEventListener('click', () => {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
      renderCalendar();
    });
  }
  if ($('nextMonth')) {
    $('nextMonth').addEventListener('click', () => {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
      renderCalendar();
    });
  }
  if ($('calendarGrid')) {
    $('calendarGrid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-date]');
      if (!button) return;
      if ($('selectedDate')) $('selectedDate').value = button.dataset.date;
      if ($('attendanceDate')) $('attendanceDate').value = button.dataset.date;
      state.month = new Date(button.dataset.date + 'T12:00:00');
      renderCalendar();
      renderRecordList();
    });
  }

  if ($('markAllPresent')) {
    $('markAllPresent').addEventListener('click', () => {
      document.querySelectorAll('.student-status').forEach((select) => { select.value = 'present'; });
    });
  }
  if ($('markAllAbsent')) {
    $('markAllAbsent').addEventListener('click', () => {
      document.querySelectorAll('.student-status').forEach((select) => { select.value = 'absent'; });
    });
  }

  if ($('attendanceForm')) {
    $('attendanceForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const teacher = $('teacherName') ? $('teacherName').value.trim() : '';
      const subject = $('subjectName') ? $('subjectName').value.trim() : '';
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
            date: $('attendanceDate') ? $('attendanceDate').value : '',
            time: $('attendanceTime') ? $('attendanceTime').value : '',
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
  }

  if ($('studentForm')) {
    $('studentForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('/api/students', {
          method: 'POST',
          body: JSON.stringify({
            name: $('studentNameInput') ? $('studentNameInput').value.trim() : '',
            rollNo: $('studentRollInput') ? $('studentRollInput').value.trim() : '',
            className: $('studentClassInput') ? $('studentClassInput').value.trim() : ''
          })
        });
        $('studentForm').reset();
        showMessage('studentMessage', 'Student added successfully.', false);
        await refreshData();
      } catch (error) {
        showMessage('studentMessage', 'Could not add student: ' + error.message, true);
      }
    });
  }

  if ($('historySearchBtn')) $('historySearchBtn').addEventListener('click', renderHistory);
  ['historyTeacher', 'historySubject', 'historyFrom', 'historyTo'].forEach((id) => {
    const element = $(id);
    if (element) element.addEventListener('change', renderHistory);
  });

  bindRoleButtons();

  if ($('selectedContext')) $('selectedContext').textContent = 'Choose date, time, subject, and teacher';
  setRole('teacher');
  refreshData();
})();
