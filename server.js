const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'attendance-data.json');

const defaultData = {
  students: [
    { id: 'stu-1', name: 'Aisha Khan', rollNo: '101', className: 'BCA-1' },
    { id: 'stu-2', name: 'Rahul Verma', rollNo: '102', className: 'BCA-1' },
    { id: 'stu-3', name: 'Neha Sharma', rollNo: '103', className: 'BCA-1' },
    { id: 'stu-4', name: 'Mohit Singh', rollNo: '104', className: 'BCA-1' },
    { id: 'stu-5', name: 'Priya Nair', rollNo: '105', className: 'BCA-1' },
    { id: 'stu-6', name: 'Arjun Patel', rollNo: '106', className: 'BCA-2' },
    { id: 'stu-7', name: 'Sara Ali', rollNo: '107', className: 'BCA-2' },
    { id: 'stu-8', name: 'Vikram Joshi', rollNo: '108', className: 'BCA-2' },
  ],
  records: [
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
  ],
};

function getTodayDate() {
  const d = new Date();
  return formatIsoDate(d);
}

function getDateOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatIsoDate(d);
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureStorage() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
  }
}

function readStore() {
  ensureStorage();
  const raw = fs.readFileSync(dataFile, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    return structuredClone(defaultData);
  }
}

function writeStore(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function makeId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/students', (req, res) => {
  const data = readStore();
  res.json(data.students);
});

app.post('/api/students', (req, res) => {
  const { name, rollNo, className } = req.body || {};

  if (!name || !rollNo || !className) {
    return res.status(400).json({ message: 'Name, roll number, and class are required.' });
  }

  const data = readStore();
  const newStudent = {
    id: makeId('stu'),
    name: String(name).trim(),
    rollNo: String(rollNo).trim(),
    className: String(className).trim(),
  };

  data.students.push(newStudent);
  writeStore(data);
  res.status(201).json(newStudent);
});

app.get('/api/records', (req, res) => {
  const { date, time, subject } = req.query;
  const data = readStore();

  let records = data.records;
  if (date) records = records.filter((record) => record.date === String(date));
  if (time) records = records.filter((record) => record.time === String(time));
  if (subject) records = records.filter((record) => record.subject.toLowerCase().includes(String(subject).toLowerCase()));

  res.json(records);
});

app.post('/api/records', (req, res) => {
  const { date, time, subject, teacher, entries = [] } = req.body || {};

  if (!date || !time || !subject || !teacher) {
    return res.status(400).json({ message: 'Date, time, subject, and teacher are required.' });
  }

  const data = readStore();
  const normalizedEntries = entries.map((entry) => ({
    studentId: entry.studentId,
    status: entry.status || 'absent',
  }));

  const matchingIndex = data.records.findIndex(
    (record) =>
      record.date === date && record.time === time && record.subject === subject && record.teacher === teacher,
  );

  const recordPayload = {
    id: makeId('rec'),
    date,
    time,
    subject,
    teacher,
    entries: normalizedEntries,
  };

  if (matchingIndex >= 0) {
    data.records[matchingIndex] = { ...data.records[matchingIndex], entries: normalizedEntries };
  } else {
    data.records.unshift(recordPayload);
  }

  writeStore(data);
  res.status(201).json({ message: 'Attendance saved successfully.' });
});

app.get('/api/summary', (req, res) => {
  const data = readStore();
  const totalPresent = data.records.reduce((sum, record) => sum + getCounts(record.entries).present, 0);
  const totalAbsent = data.records.reduce((sum, record) => sum + getCounts(record.entries).absent, 0);
  const totalLate = data.records.reduce((sum, record) => sum + getCounts(record.entries).late, 0);

  res.json({
    totalStudents: data.students.length,
    present: totalPresent,
    absent: totalAbsent,
    late: totalLate,
  });
});

app.get('/api/export/csv', (req, res) => {
  const data = readStore();
  const studentMap = new Map(data.students.map((student) => [student.id, student]));

  const rows = [['Date', 'Time', 'Subject', 'Teacher', 'Student', 'Roll', 'Class', 'Status']];

  data.records.forEach((record) => {
    record.entries.forEach((entry) => {
      const student = studentMap.get(entry.studentId) || {};
      rows.push([
        record.date,
        record.time,
        record.subject,
        record.teacher,
        student.name || 'Unknown',
        student.rollNo || '',
        student.className || '',
        entry.status,
      ]);
    });
  });

  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance-records.csv"');
  res.send(csv);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmartCampusAttendance server running at http://localhost:${PORT}`);
});
