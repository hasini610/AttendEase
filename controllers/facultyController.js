// controllers/facultyController.js
// Handles complete Faculty Module: Dashboard, Personal Timetable, Sessions, Attendance Marking, History, and Reports

const db = require('../config/db');

// Helper: Resolve faculty record for the authenticated session user
async function getFaculty(userId) {
    const [rows] = await db.query(`
        SELECT f.id, f.employee_id, f.designation, d.id AS department_id, d.name AS department_name, d.code AS dept_code
        FROM faculty f
        JOIN departments d ON d.id = f.department_id
        WHERE f.user_id = ?
    `, [userId]);
    return rows[0] || null;
}

const facultyController = {

    // ============================================================
    // 1. FACULTY DASHBOARD (Scoped to authenticated faculty)
    // ============================================================
    async dashboard(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) {
                req.flash('error', 'Faculty profile not found. Please contact your college administrator.');
                return req.session.destroy(() => {
                    res.clearCookie('attendease_sid', { path: '/' });
                    res.redirect('/login');
                });
            }

            const facultyId = faculty.id;

            // Assigned classes with student count and conducted session count
            const [assignments] = await db.query(`
                SELECT
                    fa.id AS assignment_id,
                    s.id AS subject_id,
                    s.name AS subject_name,
                    s.code AS subject_code,
                    c.id AS class_id,
                    c.name AS class_name,
                    d.code AS dept_code,
                    (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e WHERE e.class_id = c.id) AS student_count,
                    (SELECT COUNT(*) FROM class_sessions cs WHERE cs.assignment_id = fa.id) AS session_count
                FROM faculty_assignments fa
                JOIN subjects s    ON s.id = fa.subject_id
                JOIN classes  c    ON c.id = fa.class_id
                JOIN departments d ON d.id = c.department_id
                WHERE fa.faculty_id = ?
                ORDER BY c.name ASC, s.code ASC
            `, [facultyId]);

            // Today's scheduled lectures based on current weekday
            const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayDay = weekdays[new Date().getDay()];

            const [todayLectures] = await db.query(`
                SELECT
                    t.id,
                    t.day_of_week,
                    t.start_time,
                    t.end_time,
                    t.classroom,
                    s.code AS subject_code,
                    s.name AS subject_name,
                    c.name AS class_name,
                    c.id AS class_id,
                    fa.id AS assignment_id
                FROM timetable t
                JOIN faculty_assignments fa ON fa.id = t.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                WHERE fa.faculty_id = ? AND t.day_of_week = ?
                ORDER BY t.start_time ASC
            `, [facultyId, todayDay]);

            // Upcoming lectures across the week
            const [weeklySchedule] = await db.query(`
                SELECT
                    t.id,
                    t.day_of_week,
                    t.start_time,
                    t.end_time,
                    t.classroom,
                    s.code AS subject_code,
                    s.name AS subject_name,
                    c.name AS class_name,
                    c.id AS class_id,
                    fa.id AS assignment_id,
                    (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e WHERE e.class_id = c.id) AS student_count
                FROM timetable t
                JOIN faculty_assignments fa ON fa.id = t.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                WHERE fa.faculty_id = ?
                ORDER BY FIELD(t.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'), t.start_time ASC
            `, [facultyId]);

            // Recent attendance activity (Last 5 conducted sessions)
            const [recentSessions] = await db.query(`
                SELECT
                    cs.id AS session_id,
                    cs.session_date,
                    cs.session_number,
                    cs.topic,
                    s.code AS subject_code,
                    s.name AS subject_name,
                    c.name AS class_name,
                    COUNT(a.id) AS total_marked,
                    SUM(a.status = 'present') AS present_count,
                    SUM(a.status = 'late') AS late_count,
                    SUM(a.status = 'absent') AS absent_count
                FROM class_sessions cs
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                LEFT JOIN attendance a      ON a.session_id = cs.id
                WHERE fa.faculty_id = ?
                GROUP BY cs.id
                ORDER BY cs.session_date DESC, cs.id DESC
                LIMIT 5
            `, [facultyId]);

            // Attendance breakdown chart data across all faculty's sessions
            const [attRows] = await db.query(`
                SELECT a.status, COUNT(*) AS cnt
                FROM attendance a
                JOIN class_sessions cs      ON cs.id = a.session_id
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                WHERE fa.faculty_id = ?
                GROUP BY a.status
            `, [facultyId]);

            const chartData = { present: 0, absent: 0, late: 0, total: 0 };
            attRows.forEach(r => {
                chartData[r.status] = Number(r.cnt);
                chartData.total += Number(r.cnt);
            });

            // Total unique students enrolled in this faculty's classes
            const [[stuRow]] = await db.query(`
                SELECT COUNT(DISTINCT e.student_id) AS cnt
                FROM enrollments e
                JOIN faculty_assignments fa ON fa.class_id = e.class_id
                WHERE fa.faculty_id = ?
            `, [facultyId]);

            // Total sessions conducted by this faculty member
            const [[sessRow]] = await db.query(`
                SELECT COUNT(*) AS cnt
                FROM class_sessions cs
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                WHERE fa.faculty_id = ?
            `, [facultyId]);

            // Students with overall attendance < 75% in this faculty's assigned classes
            const threshold = parseInt(process.env.ATTENDANCE_THRESHOLD || '75', 10);
            const [[lowRow]] = await db.query(`
                SELECT COUNT(DISTINCT student_id) AS cnt
                FROM (
                    SELECT a.student_id,
                           COUNT(*) AS total_sessions,
                           SUM(a.status IN ('present','late')) AS attended_sessions
                    FROM attendance a
                    JOIN class_sessions cs      ON cs.id = a.session_id
                    JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                    WHERE fa.faculty_id = ?
                    GROUP BY a.student_id
                    HAVING ROUND((attended_sessions / total_sessions) * 100) < ?
                ) t
            `, [facultyId, threshold]);

            // Overall attendance percentage calculation
            const overallPct = chartData.total > 0
                ? Math.round(((chartData.present + chartData.late) / chartData.total) * 100)
                : 0;

            res.render('faculty/dashboard', {
                title: 'Faculty Dashboard - AttendEase',
                pageTitle: 'Faculty Dashboard',
                activePage: 'dashboard',
                user: req.session.user,
                faculty,
                assignments,
                todayLectures,
                weeklySchedule,
                recentSessions,
                todayDay,
                chartData,
                stats: {
                    assignedClasses:    assignments.length,
                    totalStudents:      stuRow ? stuRow.cnt : 0,
                    sessionsTaken:      sessRow ? sessRow.cnt : 0,
                    lowAttendanceCount: lowRow ? lowRow.cnt : 0,
                    overallPct
                }
            });

        } catch (err) {
            console.error('Faculty dashboard error:', err);
            res.status(500).render('error', {
                title: 'Dashboard Error',
                message: 'Could not load faculty dashboard. Please try again.',
                statusCode: 500,
                user: req.session ? req.session.user : null
            });
        }
    },

    // ============================================================
    // 2. PERSONAL TIMETABLE (Filtered by weekday and class)
    // ============================================================
    async timetable(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) {
                req.flash('error', 'Faculty profile not found.');
                return res.redirect('/faculty/dashboard');
            }

            const { day, class_id } = req.query;

            let query = `
                SELECT
                    t.id,
                    t.day_of_week,
                    t.start_time,
                    t.end_time,
                    t.classroom,
                    s.code AS subject_code,
                    s.name AS subject_name,
                    c.name AS class_name,
                    c.id AS class_id,
                    d.code AS dept_code
                FROM timetable t
                JOIN faculty_assignments fa ON fa.id = t.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                JOIN departments d          ON d.id = c.department_id
                WHERE fa.faculty_id = ?
            `;
            const params = [faculty.id];

            if (day) {
                query += ' AND t.day_of_week = ?';
                params.push(day);
            }
            if (class_id) {
                query += ' AND c.id = ?';
                params.push(class_id);
            }

            query += `
                ORDER BY
                    FIELD(t.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday'),
                    t.start_time ASC
            `;

            const [timetableSlots] = await db.query(query, params);

            // Fetch this faculty's assigned classes for filter dropdown
            const [assignedClasses] = await db.query(`
                SELECT DISTINCT c.id, c.name
                FROM classes c
                JOIN faculty_assignments fa ON fa.class_id = c.id
                WHERE fa.faculty_id = ?
                ORDER BY c.name ASC
            `, [faculty.id]);

            res.render('faculty/timetable', {
                title: 'My Timetable - AttendEase',
                pageTitle: 'My Teaching Schedule',
                activePage: 'timetable',
                user: req.session.user,
                faculty,
                timetableSlots,
                assignedClasses,
                filters: { day: day || '', class_id: class_id || '' }
            });

        } catch (err) {
            console.error('Faculty timetable error:', err);
            req.flash('error', 'Could not load timetable.');
            res.redirect('/faculty/dashboard');
        }
    },

    // ============================================================
    // 3. CLASS SESSIONS (List, Filter, Create Session)
    // ============================================================
    async listSessions(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) return res.redirect('/faculty/dashboard');

            const { assignment_id, class_id } = req.query;

            let query = `
                SELECT
                    cs.id,
                    cs.session_date,
                    cs.session_number,
                    cs.topic,
                    cs.created_at,
                    fa.id AS assignment_id,
                    s.name AS subject_name,
                    s.code AS subject_code,
                    c.name AS class_name,
                    c.id AS class_id,
                    COUNT(a.id) AS total_marked,
                    SUM(a.status = 'present') AS present_count,
                    SUM(a.status = 'late') AS late_count,
                    SUM(a.status = 'absent') AS absent_count
                FROM class_sessions cs
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                LEFT JOIN attendance a      ON a.session_id = cs.id
                WHERE fa.faculty_id = ?
            `;
            const params = [faculty.id];

            if (assignment_id) {
                query += ' AND fa.id = ?';
                params.push(assignment_id);
            }
            if (class_id) {
                query += ' AND c.id = ?';
                params.push(class_id);
            }

            query += `
                GROUP BY cs.id
                ORDER BY cs.session_date DESC, cs.session_number DESC
            `;

            const [sessions] = await db.query(query, params);

            // Fetch assigned subjects & classes for creation modal & filters
            const [assignments] = await db.query(`
                SELECT fa.id, s.name AS subject_name, s.code AS subject_code, c.name AS class_name, c.id AS class_id
                FROM faculty_assignments fa
                JOIN subjects s ON s.id = fa.subject_id
                JOIN classes c  ON c.id = fa.class_id
                WHERE fa.faculty_id = ?
                ORDER BY c.name, s.code
            `, [faculty.id]);

            res.render('faculty/sessions', {
                title: 'Class Sessions - AttendEase',
                pageTitle: 'Manage Class Sessions',
                activePage: 'sessions',
                user: req.session.user,
                faculty,
                sessions,
                assignments,
                filters: { assignment_id: assignment_id || '', class_id: class_id || '' }
            });

        } catch (err) {
            console.error('List sessions error:', err);
            req.flash('error', 'Could not load sessions.');
            res.redirect('/faculty/dashboard');
        }
    },

    // POST /faculty/sessions/create
    async createSession(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) return res.redirect('/faculty/dashboard');

            const { assignment_id, session_date, session_number, topic } = req.body;

            if (!assignment_id || !session_date) {
                req.flash('error', 'Please select an assigned class and specify the session date.');
                return res.redirect('/faculty/sessions');
            }

            // Authorization check: Verify assignment_id belongs to authenticated faculty
            const [[assignment]] = await db.query(`
                SELECT id FROM faculty_assignments WHERE id = ? AND faculty_id = ?
            `, [assignment_id, faculty.id]);

            if (!assignment) {
                req.flash('error', 'Unauthorized: You are not assigned to teach this class/subject.');
                return res.redirect('/faculty/sessions');
            }

            const sessNum = parseInt(session_number, 10) || 1;

            const [insertResult] = await db.query(`
                INSERT INTO class_sessions (assignment_id, session_date, session_number, topic)
                VALUES (?, ?, ?, ?)
            `, [assignment_id, session_date, sessNum, topic ? topic.trim() : null]);

            req.flash('success', 'Class session created successfully! You can now mark attendance.');
            res.redirect(`/faculty/mark/${insertResult.insertId}`);

        } catch (err) {
            console.error('Create session error:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'A class session for this subject and date with the same session number already exists.');
            } else {
                req.flash('error', 'Failed to create class session.');
            }
            res.redirect('/faculty/sessions');
        }
    },

    // ============================================================
    // 4. MARK ATTENDANCE (Enrolled Students, Bulk Tools, Transactions)
    // ============================================================

    // GET /faculty/mark - Session selector or direct session sheet
    async showMarkAttendance(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) return res.redirect('/faculty/dashboard');

            const sessionId = req.params.sessionId || req.query.session_id;

            // If no sessionId specified, render session picker with recently conducted sessions & creation modal
            if (!sessionId) {
                const [assignments] = await db.query(`
                    SELECT fa.id, s.name AS subject_name, s.code AS subject_code, c.name AS class_name
                    FROM faculty_assignments fa
                    JOIN subjects s ON s.id = fa.subject_id
                    JOIN classes c  ON c.id = fa.class_id
                    WHERE fa.faculty_id = ?
                    ORDER BY c.name, s.code
                `, [faculty.id]);

                const [availableSessions] = await db.query(`
                    SELECT
                        cs.id, cs.session_date, cs.session_number, cs.topic,
                        s.code AS subject_code, s.name AS subject_name, c.name AS class_name,
                        COUNT(a.id) AS marked_count,
                        (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e WHERE e.class_id = c.id) AS enrolled_count
                    FROM class_sessions cs
                    JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                    JOIN subjects s             ON s.id = fa.subject_id
                    JOIN classes c              ON c.id = fa.class_id
                    LEFT JOIN attendance a      ON a.session_id = cs.id
                    WHERE fa.faculty_id = ?
                    GROUP BY cs.id
                    ORDER BY cs.session_date DESC, cs.id DESC
                    LIMIT 20
                `, [faculty.id]);

                return res.render('faculty/mark_select', {
                    title: 'Mark Attendance - AttendEase',
                    pageTitle: 'Mark Student Attendance',
                    activePage: 'mark',
                    user: req.session.user,
                    faculty,
                    assignments,
                    availableSessions
                });
            }

            // Verify session belongs to authenticated faculty
            const [sessionRows] = await db.query(`
                SELECT
                    cs.id, cs.session_date, cs.session_number, cs.topic,
                    fa.id AS assignment_id, fa.class_id,
                    s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
                    c.name AS class_name, d.code AS dept_code
                FROM class_sessions cs
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                JOIN departments d          ON d.id = c.department_id
                WHERE cs.id = ? AND fa.faculty_id = ?
            `, [sessionId, faculty.id]);

            if (sessionRows.length === 0) {
                req.flash('error', 'Class session not found or you are not authorized to mark attendance for this lecture.');
                return res.redirect('/faculty/sessions');
            }

            const sessionData = sessionRows[0];

            // Fetch all students enrolled in this section and their current attendance status
            const [students] = await db.query(`
                SELECT
                    s.id AS student_id,
                    s.roll_number,
                    u.full_name,
                    u.email,
                    u.is_active,
                    a.status AS current_status,
                    a.marked_at
                FROM enrollments e
                JOIN students s         ON s.id = e.student_id
                JOIN users u            ON u.id = s.user_id
                LEFT JOIN attendance a  ON a.student_id = s.id AND a.session_id = ?
                WHERE e.class_id = ?
                ORDER BY s.roll_number ASC
            `, [sessionData.id, sessionData.class_id]);

            res.render('faculty/mark', {
                title: `Mark Attendance - ${sessionData.class_name} (${sessionData.subject_code})`,
                pageTitle: 'Attendance Register',
                activePage: 'mark',
                user: req.session.user,
                faculty,
                sessionData,
                students
            });

        } catch (err) {
            console.error('Show mark attendance error:', err);
            req.flash('error', 'Error loading attendance sheet.');
            res.redirect('/faculty/dashboard');
        }
    },

    // POST /faculty/mark/:sessionId - Save attendance with transaction & student enrollment validation
    async saveAttendance(req, res) {
        const sessionId = req.params.sessionId;
        const submittedAttendance = req.body.attendance || {}; // { [student_id]: 'present' | 'absent' | 'late' }

        let connection;
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) {
                req.flash('error', 'Unauthorized.');
                return res.redirect('/login');
            }

            // Verify session belongs to authenticated faculty
            const [sessionRows] = await db.query(`
                SELECT cs.id, fa.class_id
                FROM class_sessions cs
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                WHERE cs.id = ? AND fa.faculty_id = ?
            `, [sessionId, faculty.id]);

            if (sessionRows.length === 0) {
                req.flash('error', 'Unauthorized: You cannot mark attendance for this session.');
                return res.redirect('/faculty/sessions');
            }

            const classId = sessionRows[0].class_id;

            // Fetch enrolled student IDs for this section to prevent unauthorized or unenrolled student marking
            const [enrolledRows] = await db.query(`
                SELECT student_id FROM enrollments WHERE class_id = ?
            `, [classId]);
            const enrolledStudentIds = new Set(enrolledRows.map(r => String(r.student_id)));

            // Build standardized studentId -> status pairs (supports object, array, or s_ prefix)
            const studentStatusPairs = [];
            if (Array.isArray(submittedAttendance)) {
                submittedAttendance.forEach((val, idx) => {
                    if (val) studentStatusPairs.push({ studentId: String(idx), status: String(val).toLowerCase().trim() });
                });
            } else if (typeof submittedAttendance === 'object' && submittedAttendance !== null) {
                for (const [rawKey, rawVal] of Object.entries(submittedAttendance)) {
                    const cleanStudentId = String(rawKey).replace(/^s_/, '');
                    studentStatusPairs.push({ studentId: cleanStudentId, status: String(rawVal).toLowerCase().trim() });
                }
            }

            if (studentStatusPairs.length === 0) {
                req.flash('error', 'No student attendance records were submitted.');
                return res.redirect(`/faculty/mark/${sessionId}`);
            }

            // Verify all submitted student IDs belong to this class section
            for (const item of studentStatusPairs) {
                if (!enrolledStudentIds.has(String(item.studentId))) {
                    req.flash('error', `Security violation: Student #${item.studentId} is not enrolled in this class section.`);
                    return res.redirect(`/faculty/mark/${sessionId}`);
                }
            }

            // Use MySQL transaction for atomic update of all student statuses
            connection = await db.getConnection();
            await connection.beginTransaction();

            const validStatuses = ['present', 'absent', 'late'];

            for (const item of studentStatusPairs) {
                const status = validStatuses.includes(item.status) ? item.status : 'absent';
                await connection.query(`
                    INSERT INTO attendance (session_id, student_id, status)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        marked_at = CURRENT_TIMESTAMP
                `, [sessionId, item.studentId, status]);
            }

            await connection.commit();

            req.flash('success', `Attendance recorded successfully for ${studentStatusPairs.length} students!`);
            res.redirect(`/faculty/history`);

        } catch (err) {
            if (connection) await connection.rollback();
            console.error('Save attendance error:', err);
            req.flash('error', 'Failed to save attendance records.');
            res.redirect(`/faculty/mark/${sessionId}`);
        } finally {
            if (connection) connection.release();
        }
    },

    // ============================================================
    // 5. ATTENDANCE HISTORY (Session-wise records & filters)
    // ============================================================
    async attendanceHistory(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) return res.redirect('/faculty/dashboard');

            const { class_id, date_from, date_to } = req.query;

            let query = `
                SELECT
                    cs.id AS session_id,
                    cs.session_date,
                    cs.session_number,
                    cs.topic,
                    s.name AS subject_name,
                    s.code AS subject_code,
                    c.name AS class_name,
                    c.id AS class_id,
                    COUNT(a.id) AS total_marked,
                    SUM(a.status = 'present') AS present_count,
                    SUM(a.status = 'late') AS late_count,
                    SUM(a.status = 'absent') AS absent_count
                FROM class_sessions cs
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                LEFT JOIN attendance a      ON a.session_id = cs.id
                WHERE fa.faculty_id = ?
            `;
            const params = [faculty.id];

            if (class_id) {
                query += ' AND c.id = ?';
                params.push(class_id);
            }
            if (date_from) {
                query += ' AND cs.session_date >= ?';
                params.push(date_from);
            }
            if (date_to) {
                query += ' AND cs.session_date <= ?';
                params.push(date_to);
            }

            query += `
                GROUP BY cs.id
                ORDER BY cs.session_date DESC, cs.id DESC
            `;

            const [rawSessions] = await db.query(query, params);

            const sessions = rawSessions.map(sess => {
                const total = Number(sess.total_marked) || 0;
                const attended = (Number(sess.present_count) || 0) + (Number(sess.late_count) || 0);
                const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
                return { ...sess, pct };
            });

            // Assigned classes for filter
            const [classes] = await db.query(`
                SELECT DISTINCT c.id, c.name
                FROM classes c
                JOIN faculty_assignments fa ON fa.class_id = c.id
                WHERE fa.faculty_id = ?
                ORDER BY c.name
            `, [faculty.id]);

            res.render('faculty/history', {
                title: 'Attendance History - AttendEase',
                pageTitle: 'Attendance History',
                activePage: 'history',
                user: req.session.user,
                faculty,
                sessions,
                classes,
                filters: { class_id: class_id || '', date_from: date_from || '', date_to: date_to || '' }
            });

        } catch (err) {
            console.error('Attendance history error:', err);
            req.flash('error', 'Could not load attendance history.');
            res.redirect('/faculty/dashboard');
        }
    },

    // GET /faculty/history/:sessionId - View single session roster details
    async sessionDetails(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) return res.redirect('/faculty/dashboard');

            const sessionId = req.params.sessionId;

            const [sessionRows] = await db.query(`
                SELECT
                    cs.id, cs.session_date, cs.session_number, cs.topic,
                    s.name AS subject_name, s.code AS subject_code,
                    c.name AS class_name, c.id AS class_id
                FROM class_sessions cs
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                WHERE cs.id = ? AND fa.faculty_id = ?
            `, [sessionId, faculty.id]);

            if (sessionRows.length === 0) {
                req.flash('error', 'Session not found or access denied.');
                return res.redirect('/faculty/history');
            }

            const sessionData = sessionRows[0];

            const [studentRecords] = await db.query(`
                SELECT
                    s.id AS student_id,
                    s.roll_number,
                    u.full_name,
                    u.email,
                    COALESCE(a.status, 'absent') AS status,
                    a.marked_at
                FROM enrollments e
                JOIN students s        ON s.id = e.student_id
                JOIN users u           ON u.id = s.user_id
                LEFT JOIN attendance a ON a.student_id = s.id AND a.session_id = ?
                WHERE e.class_id = ?
                ORDER BY s.roll_number ASC
            `, [sessionId, sessionData.class_id]);

            res.render('faculty/session_detail', {
                title: `Session ${sessionData.session_date} - AttendEase`,
                pageTitle: 'Lecture Attendance Details',
                activePage: 'history',
                user: req.session.user,
                faculty,
                sessionData,
                studentRecords
            });

        } catch (err) {
            console.error('Session details error:', err);
            req.flash('error', 'Could not load session details.');
            res.redirect('/faculty/history');
        }
    },

    // ============================================================
    // 6. ATTENDANCE REPORTS (Percentages, Low Attendance <75%, Chart.js)
    // ============================================================
    async attendanceReports(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) return res.redirect('/faculty/dashboard');

            const { class_id } = req.query;

            // 1. Subject & Section breakdown
            let summaryQuery = `
                SELECT
                    fa.id AS assignment_id,
                    s.name AS subject_name,
                    s.code AS subject_code,
                    c.id AS class_id,
                    c.name AS class_name,
                    COUNT(DISTINCT cs.id) AS total_sessions,
                    COUNT(a.id) AS total_marks,
                    SUM(a.status = 'present') AS present_count,
                    SUM(a.status = 'late') AS late_count,
                    SUM(a.status = 'absent') AS absent_count
                FROM faculty_assignments fa
                JOIN subjects s             ON s.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                LEFT JOIN class_sessions cs ON cs.assignment_id = fa.id
                LEFT JOIN attendance a      ON a.session_id = cs.id
                WHERE fa.faculty_id = ?
            `;
            const summaryParams = [faculty.id];

            if (class_id) {
                summaryQuery += ' AND c.id = ?';
                summaryParams.push(class_id);
            }

            summaryQuery += ' GROUP BY fa.id ORDER BY c.name, s.code';

            const [rawSummaries] = await db.query(summaryQuery, summaryParams);

            const summaries = rawSummaries.map(s => {
                const totalMarks = Number(s.total_marks) || 0;
                const attended = (Number(s.present_count) || 0) + (Number(s.late_count) || 0);
                const pct = totalMarks > 0 ? Math.round((attended / totalMarks) * 100) : 0;
                return { ...s, pct };
            });

            // 2. Low Attendance Students (< 75% threshold) across faculty's subjects
            const threshold = parseInt(process.env.ATTENDANCE_THRESHOLD || '75', 10);

            let lowStuQuery = `
                SELECT
                    s.id AS student_id,
                    s.roll_number,
                    u.full_name,
                    u.email,
                    c.name AS class_name,
                    sub.code AS subject_code,
                    sub.name AS subject_name,
                    COUNT(a.id) AS total_lectures,
                    SUM(a.status IN ('present','late')) AS attended_lectures,
                    ROUND((SUM(a.status IN ('present','late')) / COUNT(a.id)) * 100) AS attendance_pct
                FROM attendance a
                JOIN class_sessions cs      ON cs.id = a.session_id
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                JOIN students s             ON s.id = a.student_id
                JOIN users u                ON u.id = s.user_id
                WHERE fa.faculty_id = ?
            `;
            const lowStuParams = [faculty.id];

            if (class_id) {
                lowStuQuery += ' AND c.id = ?';
                lowStuParams.push(class_id);
            }

            lowStuQuery += `
                GROUP BY s.id, fa.id
                HAVING attendance_pct < ?
                ORDER BY attendance_pct ASC, u.full_name ASC
            `;
            lowStuParams.push(threshold);

            const [lowAttendanceStudents] = await db.query(lowStuQuery, lowStuParams);

            // 3. Overall Chart Data (Status distribution)
            let totalPresent = 0, totalLate = 0, totalAbsent = 0;
            summaries.forEach(s => {
                totalPresent += Number(s.present_count) || 0;
                totalLate    += Number(s.late_count) || 0;
                totalAbsent  += Number(s.absent_count) || 0;
            });

            const [assignedClasses] = await db.query(`
                SELECT DISTINCT c.id, c.name
                FROM classes c
                JOIN faculty_assignments fa ON fa.class_id = c.id
                WHERE fa.faculty_id = ?
                ORDER BY c.name
            `, [faculty.id]);

            res.render('faculty/reports', {
                title: 'Attendance Reports - AttendEase',
                pageTitle: 'Attendance Analytics & Reports',
                activePage: 'reports',
                user: req.session.user,
                faculty,
                summaries,
                lowAttendanceStudents,
                assignedClasses,
                threshold,
                filters: { class_id: class_id || '' },
                chartTotals: {
                    present: totalPresent,
                    late: totalLate,
                    absent: totalAbsent,
                    total: totalPresent + totalLate + totalAbsent
                }
            });

        } catch (err) {
            console.error('Attendance reports error:', err);
            req.flash('error', 'Could not load attendance reports.');
            res.redirect('/faculty/dashboard');
        }
    },

    // ============================================================
    // 7. FACULTY CSV EXPORT (Scoped strictly to faculty's assigned subjects)
    // ============================================================
    async exportCsv(req, res) {
        try {
            const faculty = await getFaculty(req.session.user.id);
            if (!faculty) return res.status(403).send('Forbidden');

            const { class_id, subject_id, status, date_from, date_to } = req.query;

            // Build conditions – always scoped to this faculty's assignments
            const conditions = ['fa.faculty_id = ?'];
            const params = [faculty.id];

            if (class_id && /^\d+$/.test(class_id)) {
                conditions.push('c.id = ?');
                params.push(class_id);
            }
            if (subject_id && /^\d+$/.test(subject_id)) {
                conditions.push('sub.id = ?');
                params.push(subject_id);
            }
            if (status && ['present','absent','late'].includes(status)) {
                conditions.push('a.status = ?');
                params.push(status);
            }
            if (date_from && /^\d{4}-\d{2}-\d{2}$/.test(date_from)) {
                conditions.push('cs.session_date >= ?');
                params.push(date_from);
            }
            if (date_to && /^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
                conditions.push('cs.session_date <= ?');
                params.push(date_to);
            }

            const where = 'WHERE ' + conditions.join(' AND ');

            const [rows] = await db.query(`
                SELECT
                    cs.session_date,
                    sub.code          AS subject_code,
                    sub.name          AS subject_name,
                    c.name            AS class_name,
                    st.roll_number,
                    u_stu.full_name   AS student_name,
                    a.status,
                    cs.topic
                FROM attendance a
                JOIN class_sessions cs      ON cs.id = a.session_id
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                JOIN students st            ON st.id = a.student_id
                JOIN users u_stu            ON u_stu.id = st.user_id
                ${where}
                ORDER BY cs.session_date DESC, sub.code, st.roll_number
                LIMIT 50000
            `, params);

            function csvCell(v) {
                const s = (v == null) ? '' : String(v);
                const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
                if (safe.includes(',') || safe.includes('"') || safe.includes('\n'))
                    return '"' + safe.replace(/"/g, '""') + '"';
                return safe;
            }
            function csvRow(cells) { return cells.map(csvCell).join(','); }

            const filename = `faculty_attendance_${faculty.employee_id}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            res.write('Session Date,Class,Subject Code,Subject Name,Roll Number,Student Name,Status,Topic\n');
            for (const r of rows) {
                res.write(csvRow([
                    (d => { const dt = new Date(d); return isNaN(dt) ? String(d) : `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; })(r.session_date),
                    r.class_name, r.subject_code, r.subject_name,
                    r.roll_number, r.student_name, r.status, r.topic || ''
                ]) + '\n');
            }
            res.end();

        } catch (err) {
            console.error('Faculty CSV export error:', err);
            res.status(500).send('Export failed.');
        }
    }
};

module.exports = facultyController;
