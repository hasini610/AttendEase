// controllers/studentController.js
// Handles complete Student Module: Dashboard, Timetable, Subject Attendance, History, and Warnings

const db = require('../config/db');

// Helper: Resolve student record & class enrollment for the authenticated user
async function getStudent(userId) {
    const [rows] = await db.query(`
        SELECT
            s.id,
            s.roll_number,
            s.department_id,
            s.semester_id,
            s.academic_year_id,
            d.name AS department_name,
            d.code AS dept_code,
            c.id AS class_id,
            c.name AS class_name
        FROM students s
        JOIN departments d      ON d.id = s.department_id
        LEFT JOIN enrollments e ON e.student_id = s.id
        LEFT JOIN classes c     ON c.id = e.class_id
        WHERE s.user_id = ?
    `, [userId]);
    return rows[0] || null;
}

const studentController = {

    // ============================================================
    // 1. STUDENT DASHBOARD (Scoped to authenticated student)
    // ============================================================
    async dashboard(req, res) {
        try {
            const student = await getStudent(req.session.user.id);
            if (!student) {
                req.flash('error', 'Student academic record not found. Please contact administration.');
                return req.session.destroy(() => {
                    res.clearCookie('attendease_sid', { path: '/' });
                    res.redirect('/login');
                });
            }

            const threshold = parseInt(process.env.ATTENDANCE_THRESHOLD || '75', 10);
            const classId = student.class_id;

            // 1. Subject-wise attendance summaries for enrolled class
            let subjectStats = [];
            if (classId) {
                const [rows] = await db.query(`
                    SELECT
                        sub.id AS subject_id,
                        sub.name AS subject_name,
                        sub.code AS subject_code,
                        sub.credits,
                        u.full_name AS faculty_name,
                        COUNT(cs.id) AS total_sessions,
                        SUM(a.status = 'present') AS present_count,
                        SUM(a.status = 'late') AS late_count,
                        SUM(a.status = 'absent') AS absent_count
                    FROM faculty_assignments fa
                    JOIN subjects sub           ON sub.id = fa.subject_id
                    JOIN faculty f              ON f.id = fa.faculty_id
                    JOIN users u                ON u.id = f.user_id
                    LEFT JOIN class_sessions cs ON cs.assignment_id = fa.id
                    LEFT JOIN attendance a      ON a.session_id = cs.id AND a.student_id = ?
                    WHERE fa.class_id = ?
                    GROUP BY fa.id, sub.id
                    ORDER BY sub.code ASC
                `, [student.id, classId]);

                subjectStats = rows.map(s => {
                    const total    = Number(s.total_sessions) || 0;
                    const present  = Number(s.present_count) || 0;
                    const late     = Number(s.late_count) || 0;
                    const absent   = Number(s.absent_count) || 0;
                    const attended = present + late;
                    const pct      = total > 0 ? Math.round((attended / total) * 100) : 0;
                    const isLow    = total > 0 && pct < threshold;

                    // Calculate sessions needed to reach 75% if below threshold
                    // Target: (attended + x) / (total + x) >= 0.75 => x >= (0.75 * total - attended) / 0.25
                    let neededToPass = 0;
                    if (isLow) {
                        neededToPass = Math.max(0, Math.ceil((0.75 * total - attended) / 0.25));
                    }

                    return {
                        ...s,
                        total,
                        present,
                        late,
                        absent,
                        attended,
                        pct,
                        isLow,
                        neededToPass
                    };
                });
            }

            // Overall totals
            const totalSessions = subjectStats.reduce((acc, s) => acc + s.total, 0);
            const totalPresent  = subjectStats.reduce((acc, s) => acc + s.present, 0);
            const totalLate     = subjectStats.reduce((acc, s) => acc + s.late, 0);
            const totalAbsent   = subjectStats.reduce((acc, s) => acc + s.absent, 0);
            const totalAttended = totalPresent + totalLate;
            const overallPct    = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : 0;
            const lowSubjects   = subjectStats.filter(s => s.isLow);

            // 2. Today's Timetable lectures for student's section
            const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const todayDay = weekdays[new Date().getDay()];

            let todayLectures = [];
            let weeklySchedule = [];
            if (classId) {
                const [ttRows] = await db.query(`
                    SELECT
                        t.id,
                        t.day_of_week,
                        t.start_time,
                        t.end_time,
                        t.classroom,
                        sub.code AS subject_code,
                        sub.name AS subject_name,
                        u.full_name AS faculty_name
                    FROM timetable t
                    JOIN faculty_assignments fa ON fa.id = t.assignment_id
                    JOIN subjects sub           ON sub.id = fa.subject_id
                    JOIN faculty f              ON f.id = fa.faculty_id
                    JOIN users u                ON u.id = f.user_id
                    WHERE fa.class_id = ? AND t.day_of_week = ?
                    ORDER BY t.start_time ASC
                `, [classId, todayDay]);
                todayLectures = ttRows;

                const [wkRows] = await db.query(`
                    SELECT
                        t.id,
                        t.day_of_week,
                        t.start_time,
                        t.end_time,
                        t.classroom,
                        sub.code AS subject_code,
                        sub.name AS subject_name,
                        c.name AS class_name,
                        u.full_name AS faculty_name
                    FROM timetable t
                    JOIN faculty_assignments fa ON fa.id = t.assignment_id
                    JOIN subjects sub           ON sub.id = fa.subject_id
                    JOIN classes c              ON c.id = fa.class_id
                    JOIN faculty f              ON f.id = fa.faculty_id
                    JOIN users u                ON u.id = f.user_id
                    WHERE fa.class_id = ?
                    ORDER BY FIELD(t.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'), t.start_time ASC
                `, [classId]);
                weeklySchedule = wkRows;
            }

            // 3. Recent Attendance Activity (Last 5 marked sessions)
            const [recentAttendance] = await db.query(`
                SELECT
                    a.id,
                    a.status,
                    a.marked_at,
                    cs.session_date,
                    cs.session_number,
                    cs.topic,
                    sub.code AS subject_code,
                    sub.name AS subject_name,
                    u.full_name AS faculty_name
                FROM attendance a
                JOIN class_sessions cs      ON cs.id = a.session_id
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN faculty f              ON f.id = fa.faculty_id
                JOIN users u                ON u.id = f.user_id
                WHERE a.student_id = ?
                ORDER BY cs.session_date DESC, cs.id DESC
                LIMIT 5
            `, [student.id]);

            // Unread notifications count
            const [[notifRow]] = await db.query(
                'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
                [req.session.user.id]
            );

            res.render('student/dashboard', {
                title: 'Student Dashboard - AttendEase',
                pageTitle: 'My Attendance Dashboard',
                activePage: 'dashboard',
                user: req.session.user,
                student,
                subjectStats,
                totalSessions,
                totalPresent,
                totalLate,
                totalAbsent,
                totalAttended,
                overallPct,
                threshold,
                lowSubjects,
                todayLectures,
                todayDay,
                weeklySchedule,
                recentAttendance,
                notifCount: notifRow ? notifRow.c : 0
            });

        } catch (err) {
            console.error('Student dashboard error:', err);
            res.status(500).render('error', {
                title: 'Dashboard Error',
                message: 'Could not load your student dashboard. Please try again.',
                statusCode: 500,
                user: req.session ? req.session.user : null
            });
        }
    },

    // ============================================================
    // 2. MY TIMETABLE (Weekly schedule for enrolled section)
    // ============================================================
    async myTimetable(req, res) {
        try {
            const student = await getStudent(req.session.user.id);
            if (!student || !student.class_id) {
                req.flash('error', 'You are not enrolled in a class section yet.');
                return res.redirect('/student/dashboard');
            }

            const { day } = req.query;

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
                    f.designation
                FROM timetable t
                JOIN faculty_assignments fa ON fa.id = t.assignment_id
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN faculty f              ON f.id = fa.faculty_id
                JOIN users u                ON u.id = f.user_id
                WHERE fa.class_id = ?
            `;
            const params = [student.class_id];

            if (day) {
                query += ' AND t.day_of_week = ?';
                params.push(day);
            }

            query += `
                ORDER BY
                    FIELD(t.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday'),
                    t.start_time ASC
            `;

            const [timetableSlots] = await db.query(query, params);

            res.render('student/timetable', {
                title: 'My Timetable - AttendEase',
                pageTitle: 'My Class Schedule',
                activePage: 'timetable',
                user: req.session.user,
                student,
                timetableSlots,
                filters: { day: day || '' }
            });

        } catch (err) {
            console.error('Student timetable error:', err);
            req.flash('error', 'Could not load timetable.');
            res.redirect('/student/dashboard');
        }
    },

    // ============================================================
    // 3. MY ATTENDANCE (Subject-wise standing & 75% threshold status)
    // ============================================================
    async myAttendance(req, res) {
        try {
            const student = await getStudent(req.session.user.id);
            if (!student || !student.class_id) {
                req.flash('error', 'Enrollment details missing.');
                return res.redirect('/student/dashboard');
            }

            const threshold = parseInt(process.env.ATTENDANCE_THRESHOLD || '75', 10);

            const [rows] = await db.query(`
                SELECT
                    sub.id AS subject_id,
                    sub.name AS subject_name,
                    sub.code AS subject_code,
                    sub.credits,
                    u.full_name AS faculty_name,
                    f.designation,
                    COUNT(cs.id) AS total_sessions,
                    SUM(a.status = 'present') AS present_count,
                    SUM(a.status = 'late') AS late_count,
                    SUM(a.status = 'absent') AS absent_count
                FROM faculty_assignments fa
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN faculty f              ON f.id = fa.faculty_id
                JOIN users u                ON u.id = f.user_id
                LEFT JOIN class_sessions cs ON cs.assignment_id = fa.id
                LEFT JOIN attendance a      ON a.session_id = cs.id AND a.student_id = ?
                WHERE fa.class_id = ?
                GROUP BY fa.id, sub.id
                ORDER BY sub.code ASC
            `, [student.id, student.class_id]);

            const subjectStats = rows.map(s => {
                const total    = Number(s.total_sessions) || 0;
                const present  = Number(s.present_count) || 0;
                const late     = Number(s.late_count) || 0;
                const absent   = Number(s.absent_count) || 0;
                const attended = present + late;
                const pct      = total > 0 ? Math.round((attended / total) * 100) : 0;
                const isLow    = total > 0 && pct < threshold;

                let neededToPass = 0;
                if (isLow) {
                    neededToPass = Math.max(0, Math.ceil((0.75 * total - attended) / 0.25));
                }

                return {
                    ...s,
                    total,
                    present,
                    late,
                    absent,
                    attended,
                    pct,
                    isLow,
                    neededToPass
                };
            });

            const totalSessions = subjectStats.reduce((acc, s) => acc + s.total, 0);
            const totalPresent  = subjectStats.reduce((acc, s) => acc + s.present, 0);
            const totalLate     = subjectStats.reduce((acc, s) => acc + s.late, 0);
            const totalAbsent   = subjectStats.reduce((acc, s) => acc + s.absent, 0);
            const totalAttended = totalPresent + totalLate;
            const overallPct    = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : 0;
            const lowSubjects   = subjectStats.filter(s => s.isLow);

            res.render('student/attendance', {
                title: 'Subject Attendance - AttendEase',
                pageTitle: 'My Subject Attendance',
                activePage: 'attendance',
                user: req.session.user,
                student,
                subjectStats,
                totalSessions,
                totalPresent,
                totalLate,
                totalAbsent,
                totalAttended,
                overallPct,
                threshold,
                lowSubjects
            });

        } catch (err) {
            console.error('My attendance error:', err);
            req.flash('error', 'Could not load attendance details.');
            res.redirect('/student/dashboard');
        }
    },

    // ============================================================
    // 4. ATTENDANCE HISTORY (Date-wise logs, filters for subject & date)
    // ============================================================
    async attendanceHistory(req, res) {
        try {
            const student = await getStudent(req.session.user.id);
            if (!student) return res.redirect('/student/dashboard');

            const { subject_id, status, date_from, date_to } = req.query;

            let query = `
                SELECT
                    a.id,
                    a.status,
                    a.marked_at,
                    cs.session_date,
                    cs.session_number,
                    cs.topic,
                    sub.id AS subject_id,
                    sub.code AS subject_code,
                    sub.name AS subject_name,
                    u.full_name AS faculty_name
                FROM attendance a
                JOIN class_sessions cs      ON cs.id = a.session_id
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN faculty f              ON f.id = fa.faculty_id
                JOIN users u                ON u.id = f.user_id
                WHERE a.student_id = ?
            `;
            const params = [student.id];

            if (subject_id) {
                query += ' AND sub.id = ?';
                params.push(subject_id);
            }
            if (status) {
                query += ' AND a.status = ?';
                params.push(status);
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
                ORDER BY cs.session_date DESC, cs.id DESC
            `;

            const [records] = await db.query(query, params);

            // Fetch list of enrolled subjects for filter dropdown
            const [enrolledSubjects] = await db.query(`
                SELECT DISTINCT sub.id, sub.code, sub.name
                FROM faculty_assignments fa
                JOIN subjects sub ON sub.id = fa.subject_id
                WHERE fa.class_id = ?
                ORDER BY sub.code ASC
            `, [student.class_id]);

            res.render('student/history', {
                title: 'Attendance History - AttendEase',
                pageTitle: 'My Attendance History',
                activePage: 'history',
                user: req.session.user,
                student,
                records,
                enrolledSubjects,
                filters: {
                    subject_id: subject_id || '',
                    status: status || '',
                    date_from: date_from || '',
                    date_to: date_to || ''
                }
            });

        } catch (err) {
            console.error('Student attendance history error:', err);
            req.flash('error', 'Could not load attendance logs.');
            res.redirect('/student/dashboard');
        }
    }
};

module.exports = studentController;
