// controllers/adminCrudController.js
// Handles complete CRUD operations and timetable views for Admin Module
// Supports both Plain HTML5 views and Express JSON API responses

const bcrypt = require('bcryptjs');
const db     = require('../config/db');
const path   = require('path');

// Helper: check if client expects JSON
function wantsJson(req) {
    return req.xhr || 
           (req.headers.accept && req.headers.accept.includes('application/json')) ||
           (req.originalUrl && req.originalUrl.startsWith('/api'));
}

const adminCrudController = {

    // ============================================================
    // 1. STUDENTS MANAGEMENT (Search, Filter, Paginate, Add, Edit, Toggle, Safe Delete)
    // ============================================================

    // GET /admin/students
    async listStudents(req, res) {
        try {
            const page     = Math.max(1, parseInt(req.query.page) || 1);
            const limit    = 15;
            const offset   = (page - 1) * limit;
            const { dept, class_id, q } = req.query;

            let countQuery = `
                SELECT COUNT(DISTINCT s.id) AS total
                FROM students s
                JOIN users u       ON u.id = s.user_id
                JOIN departments d ON d.id = s.department_id
                LEFT JOIN enrollments e ON e.student_id = s.id
                LEFT JOIN classes c     ON c.id = e.class_id
                WHERE 1=1
            `;

            let query = `
                SELECT
                    s.id AS student_id,
                    s.roll_number,
                    u.id AS user_id,
                    u.full_name,
                    u.email,
                    u.phone,
                    u.is_active,
                    d.id AS department_id,
                    d.name AS department_name,
                    d.code AS dept_code,
                    c.id AS class_id,
                    c.name AS class_name,
                    sem.name AS semester_name,
                    COUNT(a.id) AS total_sessions,
                    SUM(a.status IN ('present','late')) AS attended_sessions
                FROM students s
                JOIN users u            ON u.id = s.user_id
                JOIN departments d      ON d.id = s.department_id
                LEFT JOIN semesters sem ON sem.id = s.semester_id
                LEFT JOIN enrollments e ON e.student_id = s.id
                LEFT JOIN classes c     ON c.id = e.class_id
                LEFT JOIN attendance a  ON a.student_id = s.id
                WHERE 1=1
            `;
            const params = [];
            const countParams = [];

            if (dept) {
                query += ' AND d.id = ?';
                countQuery += ' AND d.id = ?';
                params.push(dept);
                countParams.push(dept);
            }
            if (class_id) {
                query += ' AND c.id = ?';
                countQuery += ' AND c.id = ?';
                params.push(class_id);
                countParams.push(class_id);
            }
            if (q && q.trim()) {
                const search = `%${q.trim()}%`;
                query += ' AND (u.full_name LIKE ? OR s.roll_number LIKE ? OR u.email LIKE ?)';
                countQuery += ' AND (u.full_name LIKE ? OR s.roll_number LIKE ? OR u.email LIKE ?)';
                params.push(search, search, search);
                countParams.push(search, search, search);
            }

            // Total count for pagination
            const [[countResult]] = await db.query(countQuery, countParams);
            const totalCount = countResult ? countResult.total : 0;
            const totalPages = Math.ceil(totalCount / limit) || 1;

            query += `
                GROUP BY s.id, e.id
                ORDER BY s.roll_number ASC
                LIMIT ? OFFSET ?
            `;
            params.push(limit, offset);

            const [studentsRows] = await db.query(query, params);

            const students = studentsRows.map(s => {
                const total = Number(s.total_sessions) || 0;
                const attended = Number(s.attended_sessions) || 0;
                return {
                    ...s,
                    pct: total > 0 ? Math.round((attended / total) * 100) : 0
                };
            });

            // Metadata for dropdowns
            const [departments] = await db.query('SELECT * FROM departments ORDER BY name');
            const [classes]     = await db.query('SELECT * FROM classes ORDER BY name');
            const [semesters]   = await db.query('SELECT * FROM semesters WHERE is_active = 1');
            const [acYears]     = await db.query('SELECT * FROM academic_years WHERE is_active = 1');

            if (wantsJson(req)) {
                return res.json({
                    success: true,
                    user: req.session.user,
                    students, departments, classes, semesters, acYears,
                    pagination: { page, limit, totalCount, totalPages },
                    filters: { dept: dept || '', class_id: class_id || '', q: q ? q.trim() : '' }
                });
            }
            return res.sendFile(path.join(__dirname, '../views_html/admin/students.html'));

        } catch (err) {
            console.error('List students error:', err);
            if (wantsJson(req)) return res.status(500).json({ success: false, message: 'Error loading students list.' });
            req.flash('error', 'Error loading students list.');
            res.redirect('/admin/dashboard');
        }
    },

    // POST /admin/students/create
    async createStudent(req, res) {
        const { full_name, email, phone, roll_number, department_id, class_id, semester_id, academic_year_id, password } = req.body;

        if (!full_name || !email || !roll_number || !department_id) {
            req.flash('error', 'Please fill in all required fields (Name, Roll Number, Email, Department).');
            return res.redirect('/admin/students');
        }

        try {
            const username = `stu_${roll_number.toLowerCase().trim()}`;
            const pwd = password && password.trim() ? password.trim() : 'password123';
            const hashed = await bcrypt.hash(pwd, 10);

            // Insert user
            const [userResult] = await db.query(
                `INSERT INTO users (username, email, password, role, full_name, phone, is_active)
                 VALUES (?, ?, ?, 'student', ?, ?, 1)`,
                [username, email.trim(), hashed, full_name.trim(), phone ? phone.trim() : null]
            );
            const userId = userResult.insertId;

            // Insert student profile
            const [studentResult] = await db.query(
                `INSERT INTO students (user_id, roll_number, department_id, semester_id, academic_year_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, roll_number.trim().toUpperCase(), department_id, semester_id || 2, academic_year_id || 2]
            );
            const studentId = studentResult.insertId;

            // Enroll in class if selected
            if (class_id) {
                await db.query(
                    `INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)`,
                    [studentId, class_id]
                );
            }

            req.flash('success', `Student "${full_name}" registered successfully with Roll Number ${roll_number}!`);
            res.redirect('/admin/students');

        } catch (err) {
            console.error('Create student error:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'A student with this Roll Number, Username, or Email already exists.');
            } else {
                req.flash('error', 'Could not create student. Please verify all inputs.');
            }
            res.redirect('/admin/students');
        }
    },

    // POST /admin/students/:id/edit
    async updateStudent(req, res) {
        const studentId = req.params.id;
        const { full_name, email, phone, roll_number, department_id, class_id } = req.body;

        if (!full_name || !email || !roll_number || !department_id) {
            req.flash('error', 'Required fields cannot be empty.');
            return res.redirect('/admin/students');
        }

        try {
            const [[student]] = await db.query('SELECT user_id FROM students WHERE id = ?', [studentId]);
            if (!student) {
                req.flash('error', 'Student not found.');
                return res.redirect('/admin/students');
            }

            // Update user record
            await db.query(
                'UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?',
                [full_name.trim(), email.trim(), phone ? phone.trim() : null, student.user_id]
            );

            // Update student record
            await db.query(
                'UPDATE students SET roll_number = ?, department_id = ? WHERE id = ?',
                [roll_number.trim().toUpperCase(), department_id, studentId]
            );

            // Update class enrollment
            if (class_id) {
                await db.query(`
                    INSERT INTO enrollments (student_id, class_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE class_id = ?
                `, [studentId, class_id, class_id]);
            } else {
                await db.query('DELETE FROM enrollments WHERE student_id = ?', [studentId]);
            }

            req.flash('success', 'Student profile updated successfully.');
            res.redirect('/admin/students');

        } catch (err) {
            console.error('Update student error:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'Another student is already using this Roll Number or Email.');
            } else {
                req.flash('error', 'Failed to update student profile.');
            }
            res.redirect('/admin/students');
        }
    },

    // POST /admin/students/:id/toggle
    async toggleStudentStatus(req, res) {
        const studentId = req.params.id;
        try {
            const [[student]] = await db.query('SELECT user_id FROM students WHERE id = ?', [studentId]);
            if (student) {
                await db.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [student.user_id]);
                req.flash('success', 'Student status updated successfully.');
            }
            res.redirect('/admin/students');
        } catch (err) {
            console.error('Toggle student status error:', err);
            req.flash('error', 'Could not update student status.');
            res.redirect('/admin/students');
        }
    },

    // POST /admin/students/:id/delete (Safe Deletion)
    async deleteStudent(req, res) {
        const studentId = req.params.id;
        try {
            const [[student]] = await db.query('SELECT user_id FROM students WHERE id = ?', [studentId]);
            if (!student) {
                req.flash('error', 'Student not found.');
                return res.redirect('/admin/students');
            }

            // Safe check: Check if student has attendance records
            const [[attRecord]] = await db.query('SELECT COUNT(*) AS c FROM attendance WHERE student_id = ?', [studentId]);
            if (attRecord && attRecord.c > 0) {
                req.flash('error', `Cannot delete this student because they have ${attRecord.c} recorded attendance sessions. Deactivate their account instead to preserve attendance history.`);
                return res.redirect('/admin/students');
            }

            await db.query('DELETE FROM users WHERE id = ?', [student.user_id]);
            req.flash('success', 'Student deleted successfully.');
            res.redirect('/admin/students');

        } catch (err) {
            console.error('Delete student error:', err);
            req.flash('error', 'Could not delete student due to linked academic records.');
            res.redirect('/admin/students');
        }
    },

    // ============================================================
    // 2. FACULTY MANAGEMENT (Search, Paginate, Add, Edit, Toggle, Safe Delete)
    // ============================================================

    // GET /admin/faculty
    async listFaculty(req, res) {
        try {
            const page   = Math.max(1, parseInt(req.query.page) || 1);
            const limit  = 15;
            const offset = (page - 1) * limit;
            const { dept, q } = req.query;

            let countQuery = `
                SELECT COUNT(DISTINCT f.id) AS total
                FROM faculty f
                JOIN users u       ON u.id = f.user_id
                JOIN departments d ON d.id = f.department_id
                WHERE 1=1
            `;

            let query = `
                SELECT
                    f.id AS faculty_id,
                    f.employee_id,
                    f.designation,
                    u.id AS user_id,
                    u.username,
                    u.full_name,
                    u.email,
                    u.phone,
                    u.is_active,
                    d.id AS department_id,
                    d.name AS department_name,
                    d.code AS dept_code,
                    COUNT(DISTINCT fa.id) AS assigned_classes_count
                FROM faculty f
                JOIN users u ON u.id = f.user_id
                JOIN departments d ON d.id = f.department_id
                LEFT JOIN faculty_assignments fa ON fa.faculty_id = f.id
                WHERE 1=1
            `;
            const params = [];
            const countParams = [];

            if (dept) {
                query += ' AND d.id = ?';
                countQuery += ' AND d.id = ?';
                params.push(dept);
                countParams.push(dept);
            }
            if (q && q.trim()) {
                const search = `%${q.trim()}%`;
                query += ' AND (u.full_name LIKE ? OR f.employee_id LIKE ? OR u.email LIKE ?)';
                countQuery += ' AND (u.full_name LIKE ? OR f.employee_id LIKE ? OR u.email LIKE ?)';
                params.push(search, search, search);
                countParams.push(search, search, search);
            }

            const [[countResult]] = await db.query(countQuery, countParams);
            const totalCount = countResult ? countResult.total : 0;
            const totalPages = Math.ceil(totalCount / limit) || 1;

            query += `
                GROUP BY f.id
                ORDER BY u.full_name ASC
                LIMIT ? OFFSET ?
            `;
            params.push(limit, offset);

            const [facultyMembers] = await db.query(query, params);
            const [departments]    = await db.query('SELECT * FROM departments ORDER BY name');

            if (wantsJson(req)) {
                return res.json({
                    success: true,
                    user: req.session.user,
                    facultyMembers, departments,
                    pagination: { page, limit, totalCount, totalPages },
                    filters: { dept: dept || '', q: q ? q.trim() : '' }
                });
            }
            return res.sendFile(path.join(__dirname, '../views_html/admin/faculty.html'));

        } catch (err) {
            console.error('List faculty error:', err);
            if (wantsJson(req)) return res.status(500).json({ success: false, message: 'Could not load faculty list.' });
            req.flash('error', 'Could not load faculty list.');
            res.redirect('/admin/dashboard');
        }
    },

    // POST /admin/faculty/create
    async createFaculty(req, res) {
        const { full_name, email, phone, employee_id, department_id, designation, password } = req.body;

        if (!full_name || !email || !employee_id || !department_id) {
            req.flash('error', 'Please provide Name, Employee ID, Email, and Department.');
            return res.redirect('/admin/faculty');
        }

        try {
            const username = `prof_${employee_id.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            const pwd = password && password.trim() ? password.trim() : 'password123';
            const hashed = await bcrypt.hash(pwd, 10);

            const [userResult] = await db.query(
                `INSERT INTO users (username, email, password, role, full_name, phone, is_active)
                 VALUES (?, ?, ?, 'faculty', ?, ?, 1)`,
                [username, email.trim(), hashed, full_name.trim(), phone ? phone.trim() : null]
            );

            await db.query(
                `INSERT INTO faculty (user_id, employee_id, department_id, designation)
                 VALUES (?, ?, ?, ?)`,
                [userResult.insertId, employee_id.trim().toUpperCase(), department_id, designation ? designation.trim() : 'Assistant Professor']
            );

            req.flash('success', `Faculty member "${full_name}" registered successfully!`);
            res.redirect('/admin/faculty');

        } catch (err) {
            console.error('Create faculty error:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'Faculty with this Employee ID or Email already exists.');
            } else {
                req.flash('error', 'Failed to register faculty member.');
            }
            res.redirect('/admin/faculty');
        }
    },

    // POST /admin/faculty/:id/edit
    async updateFaculty(req, res) {
        const facultyId = req.params.id;
        const { full_name, email, phone, employee_id, department_id, designation } = req.body;

        try {
            const [[fac]] = await db.query('SELECT user_id FROM faculty WHERE id = ?', [facultyId]);
            if (!fac) {
                req.flash('error', 'Faculty record not found.');
                return res.redirect('/admin/faculty');
            }

            await db.query(
                'UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?',
                [full_name.trim(), email.trim(), phone ? phone.trim() : null, fac.user_id]
            );

            await db.query(
                'UPDATE faculty SET employee_id = ?, department_id = ?, designation = ? WHERE id = ?',
                [employee_id.trim().toUpperCase(), department_id, designation ? designation.trim() : 'Professor', facultyId]
            );

            req.flash('success', 'Faculty details updated successfully.');
            res.redirect('/admin/faculty');

        } catch (err) {
            console.error('Update faculty error:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'Another faculty member has this Employee ID or Email.');
            } else {
                req.flash('error', 'Failed to update faculty member.');
            }
            res.redirect('/admin/faculty');
        }
    },

    // POST /admin/faculty/:id/toggle
    async toggleFacultyStatus(req, res) {
        const facultyId = req.params.id;
        try {
            const [[fac]] = await db.query('SELECT user_id FROM faculty WHERE id = ?', [facultyId]);
            if (fac) {
                await db.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [fac.user_id]);
                req.flash('success', 'Faculty status toggled.');
            }
            res.redirect('/admin/faculty');
        } catch (err) {
            console.error('Toggle faculty status error:', err);
            req.flash('error', 'Could not update faculty status.');
            res.redirect('/admin/faculty');
        }
    },

    // POST /admin/faculty/:id/delete (Safe Deletion)
    async deleteFaculty(req, res) {
        const facultyId = req.params.id;
        try {
            const [[fac]] = await db.query('SELECT user_id FROM faculty WHERE id = ?', [facultyId]);
            if (!fac) {
                req.flash('error', 'Faculty member not found.');
                return res.redirect('/admin/faculty');
            }

            // Safe check: Check for assigned subjects/sections
            const [[assignRow]] = await db.query('SELECT COUNT(*) AS c FROM faculty_assignments WHERE faculty_id = ?', [facultyId]);
            if (assignRow && assignRow.c > 0) {
                req.flash('error', `Cannot delete faculty member with ${assignRow.c} active teaching assignment(s). Remove assignments or deactivate their account instead.`);
                return res.redirect('/admin/faculty');
            }

            await db.query('DELETE FROM users WHERE id = ?', [fac.user_id]);
            req.flash('success', 'Faculty member removed successfully.');
            res.redirect('/admin/faculty');

        } catch (err) {
            console.error('Delete faculty error:', err);
            req.flash('error', 'Could not delete faculty. Linked records exist.');
            res.redirect('/admin/faculty');
        }
    },

    // ============================================================
    // 3. DEPARTMENTS (List, Add, Edit, Safe Delete)
    // ============================================================

    // GET /admin/departments
    async listDepartments(req, res) {
        try {
            const [departments] = await db.query(`
                SELECT
                    d.id,
                    d.name,
                    d.code,
                    COUNT(DISTINCT s.id) AS student_count,
                    COUNT(DISTINCT f.id) AS faculty_count,
                    COUNT(DISTINCT sub.id) AS subject_count,
                    COUNT(DISTINCT c.id) AS class_count
                FROM departments d
                LEFT JOIN students s   ON s.department_id = d.id
                LEFT JOIN faculty f    ON f.department_id = d.id
                LEFT JOIN subjects sub ON sub.department_id = d.id
                LEFT JOIN classes c    ON c.department_id = d.id
                GROUP BY d.id
                ORDER BY d.name ASC
            `);

            if (wantsJson(req)) {
                return res.json({ success: true, user: req.session.user, departments });
            }
            return res.sendFile(path.join(__dirname, '../views_html/admin/departments.html'));
        } catch (err) {
            console.error('List departments error:', err);
            if (wantsJson(req)) return res.status(500).json({ success: false, message: 'Could not load departments.' });
            req.flash('error', 'Could not load departments.');
            res.redirect('/admin/dashboard');
        }
    },

    // POST /admin/departments/create
    async createDepartment(req, res) {
        const { name, code } = req.body;
        if (!name || !code) {
            req.flash('error', 'Department name and code are required.');
            return res.redirect('/admin/departments');
        }

        try {
            await db.query(
                'INSERT INTO departments (name, code) VALUES (?, ?)',
                [name.trim(), code.trim().toUpperCase()]
            );
            req.flash('success', `Department "${name}" created successfully!`);
            res.redirect('/admin/departments');
        } catch (err) {
            console.error('Create department error:', err);
            req.flash('error', 'Could not create department. The code must be unique.');
            res.redirect('/admin/departments');
        }
    },

    // POST /admin/departments/:id/edit
    async updateDepartment(req, res) {
        const { id } = req.params;
        const { name, code } = req.body;
        try {
            await db.query(
                'UPDATE departments SET name = ?, code = ? WHERE id = ?',
                [name.trim(), code.trim().toUpperCase(), id]
            );
            req.flash('success', 'Department updated successfully.');
            res.redirect('/admin/departments');
        } catch (err) {
            console.error('Update department error:', err);
            req.flash('error', 'Failed to update department.');
            res.redirect('/admin/departments');
        }
    },

    // POST /admin/departments/:id/delete (Safe Deletion)
    async deleteDepartment(req, res) {
        const { id } = req.params;
        try {
            // Check student or faculty references
            const [[stuRow]] = await db.query('SELECT COUNT(*) AS c FROM students WHERE department_id = ?', [id]);
            const [[facRow]] = await db.query('SELECT COUNT(*) AS c FROM faculty WHERE department_id = ?', [id]);
            const [[subRow]] = await db.query('SELECT COUNT(*) AS c FROM subjects WHERE department_id = ?', [id]);

            if ((stuRow && stuRow.c > 0) || (facRow && facRow.c > 0) || (subRow && subRow.c > 0)) {
                req.flash('error', `Cannot delete department. It is currently linked to ${stuRow.c} students, ${facRow.c} faculty members, and ${subRow.c} subjects.`);
                return res.redirect('/admin/departments');
            }

            await db.query('DELETE FROM departments WHERE id = ?', [id]);
            req.flash('success', 'Department deleted successfully.');
            res.redirect('/admin/departments');
        } catch (err) {
            console.error('Delete department error:', err);
            req.flash('error', 'Cannot delete department with active relationships.');
            res.redirect('/admin/departments');
        }
    },

    // ============================================================
    // 4. SUBJECTS (List, Add, Edit, Safe Delete)
    // ============================================================

    // GET /admin/subjects
    async listSubjects(req, res) {
        try {
            const [subjects] = await db.query(`
                SELECT
                    sub.id,
                    sub.name,
                    sub.code,
                    sub.credits,
                    d.id AS department_id,
                    d.name AS department_name,
                    d.code AS dept_code,
                    COUNT(DISTINCT fa.id) AS assignment_count
                FROM subjects sub
                JOIN departments d ON d.id = sub.department_id
                LEFT JOIN faculty_assignments fa ON fa.subject_id = sub.id
                GROUP BY sub.id
                ORDER BY sub.code ASC
            `);

            const [departments] = await db.query('SELECT * FROM departments ORDER BY name');

            if (wantsJson(req)) {
                return res.json({ success: true, user: req.session.user, subjects, departments });
            }
            return res.sendFile(path.join(__dirname, '../views_html/admin/subjects.html'));
        } catch (err) {
            console.error('List subjects error:', err);
            if (wantsJson(req)) return res.status(500).json({ success: false, message: 'Could not load subjects.' });
            req.flash('error', 'Could not load subjects.');
            res.redirect('/admin/dashboard');
        }
    },

    // POST /admin/subjects/create
    async createSubject(req, res) {
        const { name, code, department_id, credits } = req.body;
        if (!name || !code || !department_id) {
            req.flash('error', 'Subject Title, Code, and Department are required.');
            return res.redirect('/admin/subjects');
        }

        try {
            await db.query(
                'INSERT INTO subjects (name, code, department_id, credits) VALUES (?, ?, ?, ?)',
                [name.trim(), code.trim().toUpperCase(), department_id, credits || 3]
            );
            req.flash('success', `Subject "${name}" (${code.toUpperCase()}) created successfully!`);
            res.redirect('/admin/subjects');
        } catch (err) {
            console.error('Create subject error:', err);
            req.flash('error', 'Could not create subject. The course code must be unique.');
            res.redirect('/admin/subjects');
        }
    },

    // POST /admin/subjects/:id/edit
    async updateSubject(req, res) {
        const { id } = req.params;
        const { name, code, department_id, credits } = req.body;
        try {
            await db.query(
                'UPDATE subjects SET name = ?, code = ?, department_id = ?, credits = ? WHERE id = ?',
                [name.trim(), code.trim().toUpperCase(), department_id, credits || 3, id]
            );
            req.flash('success', 'Subject updated successfully.');
            res.redirect('/admin/subjects');
        } catch (err) {
            console.error('Update subject error:', err);
            req.flash('error', 'Failed to update subject.');
            res.redirect('/admin/subjects');
        }
    },

    // POST /admin/subjects/:id/delete (Safe Deletion)
    async deleteSubject(req, res) {
        const { id } = req.params;
        try {
            const [[assignRow]] = await db.query('SELECT COUNT(*) AS c FROM faculty_assignments WHERE subject_id = ?', [id]);
            if (assignRow && assignRow.c > 0) {
                req.flash('error', `Cannot delete subject because it is assigned to ${assignRow.c} section(s). Remove those assignments first.`);
                return res.redirect('/admin/subjects');
            }

            await db.query('DELETE FROM subjects WHERE id = ?', [id]);
            req.flash('success', 'Subject deleted successfully.');
            res.redirect('/admin/subjects');
        } catch (err) {
            console.error('Delete subject error:', err);
            req.flash('error', 'Cannot delete subject linked to teaching sessions.');
            res.redirect('/admin/subjects');
        }
    },

    // ============================================================
    // 5. CLASSES & SECTIONS (List, Add, Edit, Safe Delete)
    // ============================================================

    // GET /admin/classes
    async listClasses(req, res) {
        try {
            const [classes] = await db.query(`
                SELECT
                    c.id,
                    c.name,
                    d.id AS department_id,
                    d.name AS department_name,
                    d.code AS dept_code,
                    sem.id AS semester_id,
                    sem.name AS semester_name,
                    ay.id AS academic_year_id,
                    ay.year_label,
                    COUNT(DISTINCT e.student_id) AS student_count,
                    COUNT(DISTINCT fa.id) AS subject_assignment_count
                FROM classes c
                JOIN departments d          ON d.id = c.department_id
                JOIN semesters sem          ON sem.id = c.semester_id
                JOIN academic_years ay      ON ay.id = c.academic_year_id
                LEFT JOIN enrollments e     ON e.class_id = c.id
                LEFT JOIN faculty_assignments fa ON fa.class_id = c.id
                GROUP BY c.id
                ORDER BY c.name ASC
            `);

            const [departments] = await db.query('SELECT * FROM departments ORDER BY name');
            const [semesters]   = await db.query('SELECT * FROM semesters ORDER BY name');
            const [acYears]     = await db.query('SELECT * FROM academic_years ORDER BY year_label DESC');

            if (wantsJson(req)) {
                return res.json({ success: true, user: req.session.user, classes, departments, semesters, acYears, academicYears: acYears });
            }
            return res.sendFile(path.join(__dirname, '../views_html/admin/classes.html'));
        } catch (err) {
            console.error('List classes error:', err);
            if (wantsJson(req)) return res.status(500).json({ success: false, message: 'Could not load classes.' });
            req.flash('error', 'Could not load classes.');
            res.redirect('/admin/dashboard');
        }
    },

    // POST /admin/classes/create
    async createClass(req, res) {
        const { name, department_id, semester_id, academic_year_id } = req.body;
        if (!name || !department_id || !semester_id || !academic_year_id) {
            req.flash('error', 'Please provide Class Name, Department, Semester, and Academic Year.');
            return res.redirect('/admin/classes');
        }

        try {
            await db.query(
                'INSERT INTO classes (name, department_id, semester_id, academic_year_id) VALUES (?, ?, ?, ?)',
                [name.trim(), department_id, semester_id, academic_year_id]
            );
            req.flash('success', `Class "${name}" created successfully!`);
            res.redirect('/admin/classes');
        } catch (err) {
            console.error('Create class error:', err);
            req.flash('error', 'Could not create class.');
            res.redirect('/admin/classes');
        }
    },

    // POST /admin/classes/:id/edit
    async updateClass(req, res) {
        const { id } = req.params;
        const { name, department_id, semester_id, academic_year_id } = req.body;
        try {
            await db.query(
                'UPDATE classes SET name = ?, department_id = ?, semester_id = ?, academic_year_id = ? WHERE id = ?',
                [name.trim(), department_id, semester_id, academic_year_id, id]
            );
            req.flash('success', 'Class details updated successfully.');
            res.redirect('/admin/classes');
        } catch (err) {
            console.error('Update class error:', err);
            req.flash('error', 'Failed to update class.');
            res.redirect('/admin/classes');
        }
    },

    // POST /admin/classes/:id/delete (Safe Deletion)
    async deleteClass(req, res) {
        const { id } = req.params;
        try {
            const [[enrolled]] = await db.query('SELECT COUNT(*) AS c FROM enrollments WHERE class_id = ?', [id]);
            if (enrolled && enrolled.c > 0) {
                req.flash('error', `Cannot delete class with ${enrolled.c} enrolled students. Reassign students first.`);
                return res.redirect('/admin/classes');
            }

            await db.query('DELETE FROM classes WHERE id = ?', [id]);
            req.flash('success', 'Class removed successfully.');
            res.redirect('/admin/classes');
        } catch (err) {
            console.error('Delete class error:', err);
            req.flash('error', 'Cannot delete class with active relationships.');
            res.redirect('/admin/classes');
        }
    },

    // ============================================================
    // 6. FACULTY ASSIGNMENTS (List, Assign, Remove)
    // ============================================================

    // GET /admin/assignments
    async listAssignments(req, res) {
        try {
            const { dept, class_id } = req.query;

            let query = `
                SELECT
                    fa.id AS assignment_id,
                    f.id AS faculty_id,
                    f.employee_id,
                    u.full_name AS faculty_name,
                    sub.id AS subject_id,
                    sub.name AS subject_name,
                    sub.code AS subject_code,
                    c.id AS class_id,
                    c.name AS class_name,
                    d.id AS department_id,
                    d.name AS department_name,
                    d.code AS dept_code,
                    COUNT(DISTINCT t.id) AS timetable_slots_count,
                    COUNT(DISTINCT cs.id) AS conducted_sessions_count
                FROM faculty_assignments fa
                JOIN faculty f     ON f.id = fa.faculty_id
                JOIN users u       ON u.id = f.user_id
                JOIN subjects sub  ON sub.id = fa.subject_id
                JOIN classes c     ON c.id = fa.class_id
                JOIN departments d ON d.id = c.department_id
                LEFT JOIN timetable t ON t.assignment_id = fa.id
                LEFT JOIN class_sessions cs ON cs.assignment_id = fa.id
                WHERE 1=1
            `;
            const params = [];

            if (dept) {
                query += ' AND d.id = ?';
                params.push(dept);
            }
            if (class_id) {
                query += ' AND c.id = ?';
                params.push(class_id);
            }

            query += `
                GROUP BY fa.id
                ORDER BY c.name ASC, sub.code ASC
            `;

            const [assignments] = await db.query(query, params);
            const [departments] = await db.query('SELECT * FROM departments ORDER BY name');
            const [classes]     = await db.query('SELECT * FROM classes ORDER BY name');
            const [subjects]    = await db.query('SELECT s.*, d.code AS dept_code FROM subjects s JOIN departments d ON d.id = s.department_id ORDER BY s.code');
            const [facultyList] = await db.query(`
                SELECT f.id, f.employee_id, u.full_name, d.code AS dept_code
                FROM faculty f
                JOIN users u ON u.id = f.user_id
                JOIN departments d ON d.id = f.department_id
                WHERE u.is_active = 1
                ORDER BY u.full_name ASC
            `);

            if (wantsJson(req)) {
                return res.json({
                    success: true,
                    user: req.session.user,
                    assignments, departments, classes, subjects, facultyList,
                    filters: { dept: dept || '', class_id: class_id || '' }
                });
            }
            return res.sendFile(path.join(__dirname, '../views_html/admin/assignments.html'));

        } catch (err) {
            console.error('List assignments error:', err);
            if (wantsJson(req)) return res.status(500).json({ success: false, message: 'Could not load faculty assignments.' });
            req.flash('error', 'Could not load faculty assignments.');
            res.redirect('/admin/dashboard');
        }
    },

    // POST /admin/assignments/create
    async createAssignment(req, res) {
        const { faculty_id, subject_id, class_id } = req.body;
        if (!faculty_id || !subject_id || !class_id) {
            req.flash('error', 'Please select a Faculty member, Subject, and Class section.');
            return res.redirect('/admin/assignments');
        }

        try {
            await db.query(
                'INSERT INTO faculty_assignments (faculty_id, subject_id, class_id) VALUES (?, ?, ?)',
                [faculty_id, subject_id, class_id]
            );
            req.flash('success', 'Faculty teaching assignment created successfully!');
            res.redirect('/admin/assignments');
        } catch (err) {
            console.error('Create assignment error:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'This subject is already assigned to this faculty member for the selected class.');
            } else {
                req.flash('error', 'Failed to assign faculty to class.');
            }
            res.redirect('/admin/assignments');
        }
    },

    // POST /admin/assignments/:id/delete (Safe Deletion)
    async deleteAssignment(req, res) {
        const { id } = req.params;
        try {
            const [[sessRow]] = await db.query('SELECT COUNT(*) AS c FROM class_sessions WHERE assignment_id = ?', [id]);
            if (sessRow && sessRow.c > 0) {
                req.flash('error', `Cannot remove assignment because ${sessRow.c} class sessions and attendance records are tied to it.`);
                return res.redirect('/admin/assignments');
            }

            await db.query('DELETE FROM faculty_assignments WHERE id = ?', [id]);
            req.flash('success', 'Faculty assignment removed.');
            res.redirect('/admin/assignments');
        } catch (err) {
            console.error('Delete assignment error:', err);
            req.flash('error', 'Cannot delete assignment with active records.');
            res.redirect('/admin/assignments');
        }
    },

    // ============================================================
    // 7. TIMETABLE MASTER VIEW (Section, Faculty, Weekday Filters)
    // ============================================================

    // GET /admin/timetable
    async viewTimetable(req, res) {
        try {
            const { class_id, faculty_id, day } = req.query;

            let query = `
                SELECT
                    t.id,
                    t.day_of_week,
                    t.start_time,
                    t.end_time,
                    t.classroom,
                    sub.code AS subject_code,
                    sub.name AS subject_name,
                    u.full_name AS faculty_name,
                    c.name AS class_name,
                    c.id AS class_id,
                    d.code AS dept_code
                FROM timetable t
                JOIN faculty_assignments fa ON fa.id = t.assignment_id
                JOIN faculty f              ON f.id = fa.faculty_id
                JOIN users u                ON u.id = f.user_id
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                JOIN departments d          ON d.id = c.department_id
                WHERE 1=1
            `;
            const params = [];

            if (class_id) {
                query += ' AND c.id = ?';
                params.push(class_id);
            }
            if (faculty_id) {
                query += ' AND f.id = ?';
                params.push(faculty_id);
            }
            if (day) {
                query += ' AND t.day_of_week = ?';
                params.push(day);
            }

            query += `
                ORDER BY
                    c.name ASC,
                    FIELD(t.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday'),
                    t.start_time ASC
            `;

            const [timetableSlots] = await db.query(query, params);
            const [classes]        = await db.query('SELECT * FROM classes ORDER BY name');
            const [facultyList]    = await db.query(`
                SELECT f.id, u.full_name, d.code AS dept_code
                FROM faculty f
                JOIN users u ON u.id = f.user_id
                JOIN departments d ON d.id = f.department_id
                ORDER BY u.full_name ASC
            `);

            if (wantsJson(req)) {
                return res.json({
                    success: true,
                    user: req.session.user,
                    timetableSlots, classes, facultyList,
                    filters: { class_id: class_id || '', faculty_id: faculty_id || '', day: day || '' }
                });
            }
            return res.sendFile(path.join(__dirname, '../views_html/admin/timetable.html'));

        } catch (err) {
            console.error('Timetable view error:', err);
            if (wantsJson(req)) return res.status(500).json({ success: false, message: 'Could not load timetable schedule.' });
            req.flash('error', 'Could not load timetable schedule.');
            res.redirect('/admin/dashboard');
        }
    }
};

module.exports = adminCrudController;
