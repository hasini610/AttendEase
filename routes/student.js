// routes/student.js
const express = require('express');
const router  = express.Router();
const { isLoggedIn, isStudent } = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const profileController = require('../controllers/profileController');

// All student routes require login + student role
router.use(isLoggedIn, isStudent);

// ---- HTML Page Routes (serve .html files) ----
// 1. Dashboard
router.get('/dashboard', studentController.dashboard);

// 2. Personal Timetable (Scoped to student's enrolled section)
router.get('/timetable', studentController.myTimetable);

// 3. My Attendance (Subject-wise & 75% threshold status)
router.get('/attendance', studentController.myAttendance);
router.get('/subjects',   (req, res) => res.redirect('/student/attendance'));

// 4. Attendance History (Date-wise logs & filters)
router.get('/history', studentController.attendanceHistory);

// 5. Profile & Security
router.get('/profile',                  profileController.showProfile);
router.post('/profile/update',          profileController.updateProfile);
router.post('/profile/change-password', profileController.changePassword);

// ---- API JSON Routes (same controllers, wantsJson() returns true because path starts with /api) ----
router.get('/api/dashboard', studentController.dashboard);
router.get('/api/timetable', studentController.myTimetable);
router.get('/api/attendance', studentController.myAttendance);
router.get('/api/history',   studentController.attendanceHistory);

module.exports = router;
