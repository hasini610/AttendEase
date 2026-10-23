// routes/admin.js
const express = require('express');
const router  = express.Router();
const { isLoggedIn, isAdmin } = require('../middleware/auth');
const adminController       = require('../controllers/adminController');
const adminCrudController   = require('../controllers/adminCrudController');
const adminReportController = require('../controllers/adminReportController');
const profileController     = require('../controllers/profileController');

// All admin routes require login + admin role
router.use(isLoggedIn, isAdmin);

// 1. Dashboard
router.get('/dashboard', adminController.dashboard);

// 2. Profile & Security
router.get('/profile', profileController.showProfile);
router.post('/profile/update', profileController.updateProfile);
router.post('/profile/change-password', profileController.changePassword);

// 3. Students CRUD
router.get('/students',               adminCrudController.listStudents);
router.post('/students/create',       adminCrudController.createStudent);
router.post('/students/:id/edit',     adminCrudController.updateStudent);
router.post('/students/:id/toggle',   adminCrudController.toggleStudentStatus);
router.post('/students/:id/delete',   adminCrudController.deleteStudent);

// 4. Faculty CRUD
router.get('/faculty',                adminCrudController.listFaculty);
router.post('/faculty/create',        adminCrudController.createFaculty);
router.post('/faculty/:id/edit',      adminCrudController.updateFaculty);
router.post('/faculty/:id/toggle',    adminCrudController.toggleFacultyStatus);
router.post('/faculty/:id/delete',    adminCrudController.deleteFaculty);

// 5. Departments CRUD
router.get('/departments',            adminCrudController.listDepartments);
router.post('/departments/create',    adminCrudController.createDepartment);
router.post('/departments/:id/edit',  adminCrudController.updateDepartment);
router.post('/departments/:id/delete',adminCrudController.deleteDepartment);

// 6. Subjects CRUD
router.get('/subjects',               adminCrudController.listSubjects);
router.post('/subjects/create',       adminCrudController.createSubject);
router.post('/subjects/:id/edit',     adminCrudController.updateSubject);
router.post('/subjects/:id/delete',   adminCrudController.deleteSubject);

// 7. Classes CRUD
router.get('/classes',                adminCrudController.listClasses);
router.post('/classes/create',        adminCrudController.createClass);
router.post('/classes/:id/edit',      adminCrudController.updateClass);
router.post('/classes/:id/delete',    adminCrudController.deleteClass);

// 8. Faculty Assignments
router.get('/assignments',            adminCrudController.listAssignments);
router.post('/assignments/create',    adminCrudController.createAssignment);
router.post('/assignments/:id/delete',adminCrudController.deleteAssignment);

// 9. Timetable Overview
router.get('/timetable',              adminCrudController.viewTimetable);

// 10. Reports, Analytics & CSV Export (Phase 6)
router.get('/reports',                adminReportController.showReports);
router.get('/reports/export',         adminReportController.exportCsv);
router.get('/reports/low-attendance', adminReportController.lowAttendanceReport);

module.exports = router;
