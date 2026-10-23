// routes/faculty.js
const express = require('express');
const router  = express.Router();
const { isLoggedIn, isFaculty } = require('../middleware/auth');
const facultyController = require('../controllers/facultyController');
const profileController = require('../controllers/profileController');

// All faculty routes require login + faculty role
router.use(isLoggedIn, isFaculty);

// 1. Dashboard
router.get('/dashboard', facultyController.dashboard);

// 2. Personal Timetable
router.get('/timetable', facultyController.timetable);

// 3. Class Sessions
router.get('/sessions',         facultyController.listSessions);
router.post('/sessions/create', facultyController.createSession);

// 4. Mark Attendance
router.get('/mark',              facultyController.showMarkAttendance);
router.get('/mark/:sessionId',   facultyController.showMarkAttendance);
router.post('/mark/:sessionId',  facultyController.saveAttendance);

// 5. Attendance History & Session Inspection
router.get('/history',             facultyController.attendanceHistory);
router.get('/history/:sessionId',  facultyController.sessionDetails);

// 6. Reports & Low Attendance Alerts
router.get('/reports',        facultyController.attendanceReports);
router.get('/reports/export', facultyController.exportCsv);

// 7. Profile & Security
router.get('/profile',                  profileController.showProfile);
router.post('/profile/update',          profileController.updateProfile);
router.post('/profile/change-password', profileController.changePassword);

module.exports = router;
