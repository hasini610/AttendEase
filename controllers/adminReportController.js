// controllers/adminReportController.js
// Phase 6: College-wide Attendance Analytics, Reports, and CSV Export for Admin
// Denominator: total rows in attendance table (one per student per session).
// "Late" counts as attended (present+late / total * 100).

const db = require('../config/db');

const THRESHOLD = parseInt(process.env.ATTENDANCE_THRESHOLD || '75', 10);

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────────────────
// Escape a single cell value safely:
//   - wrap in quotes if it contains comma / quote / newline
//   - double internal quotes
//   - prepend apostrophe to block spreadsheet formula injection
function csvCell(value) {
    const str = (value === null || value === undefined) ? '' : String(value);
    // Block formula injection characters at start of string
    const safe = /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
        return '"' + safe.replace(/"/g, '""') + '"';
    }
    return safe;
}
function csvRow(cells) { return cells.map(csvCell).join(','); }
function csvHeader(...cols) { return cols.join(','); }

// ─────────────────────────────────────────────────────────────────────────────
// Build a dynamic WHERE clause from shared filter params
// Filters: dept_id, class_id, subject_id, faculty_id, date_from, date_to
// All params are validated server-side; values are always parameterised.
// ─────────────────────────────────────────────────────────────────────────────
function buildAttendanceFilters(query) {
    const { dept_id, class_id, subject_id, faculty_id, date_from, date_to } = query;
    const conditions = [];
    const params = [];

    if (dept_id && /^\d+$/.test(dept_id)) {
        conditions.push('d.id = ?');
        params.push(dept_id);
    }
    if (class_id && /^\d+$/.test(class_id)) {
        conditions.push('c.id = ?');
        params.push(class_id);
    }
    if (subject_id && /^\d+$/.test(subject_id)) {
        conditions.push('sub.id = ?');
        params.push(subject_id);
    }
    if (faculty_id && /^\d+$/.test(faculty_id)) {
        conditions.push('fa.faculty_id = ?');
        params.push(faculty_id);
    }
    if (date_from && /^\d{4}-\d{2}-\d{2}$/.test(date_from)) {
        conditions.push('cs.session_date >= ?');
        params.push(date_from);
    }
    if (date_to && /^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
        conditions.push('cs.session_date <= ?');
        params.push(date_to);
    }

    return {
        whereClause: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '',
        params
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared attendance aggregation query (admin-scoped – all data visible)
// Returns department, class, subject, faculty breakdown with totals
// ─────────────────────────────────────────────────────────────────────────────
async function runAggregateReport(filterQuery) {
    const { whereClause, params } = buildAttendanceFilters(filterQuery);

    // 1. Overall totals
    const [overallRows] = await db.query(`
        SELECT
            COUNT(a.id)                                   AS total,
            SUM(a.status = 'present')                     AS present_count,
            SUM(a.status = 'late')                        AS late_count,
            SUM(a.status = 'absent')                      AS absent_count,
            SUM(a.status IN ('present','late'))            AS attended
        FROM attendance a
        JOIN class_sessions cs      ON cs.id = a.session_id
        JOIN faculty_assignments fa ON fa.id = cs.assignment_id
        JOIN subjects sub           ON sub.id = fa.subject_id
        JOIN classes c              ON c.id = fa.class_id
        JOIN departments d          ON d.id = c.department_id
        JOIN faculty f              ON f.id = fa.faculty_id
        ${whereClause}
    `, params);

    const overall = overallRows[0] || { total: 0, present_count: 0, late_count: 0, absent_count: 0, attended: 0 };
    overall.total        = Number(overall.total) || 0;
    overall.present_count = Number(overall.present_count) || 0;
    overall.late_count   = Number(overall.late_count) || 0;
    overall.absent_count = Number(overall.absent_count) || 0;
    overall.attended     = Number(overall.attended) || 0;
    overall.pct          = overall.total > 0 ? Math.round((overall.attended / overall.total) * 100) : 0;

    // 2. Attendance trend (last 14 distinct session dates matching filter)
    const [trendRows] = await db.query(`
        SELECT sub2.date, sub2.total, sub2.attended FROM (
            SELECT
                cs.session_date AS date,
                COUNT(a.id)                             AS total,
                SUM(a.status IN ('present','late'))      AS attended
            FROM attendance a
            JOIN class_sessions cs      ON cs.id = a.session_id
            JOIN faculty_assignments fa ON fa.id = cs.assignment_id
            JOIN subjects sub           ON sub.id = fa.subject_id
            JOIN classes c              ON c.id = fa.class_id
            JOIN departments d          ON d.id = c.department_id
            JOIN faculty f              ON f.id = fa.faculty_id
            ${whereClause}
            GROUP BY cs.session_date
            ORDER BY cs.session_date DESC
            LIMIT 14
        ) sub2
        ORDER BY sub2.date ASC
    `, params);

    const trendData = {
        labels: trendRows.map(r => {
            const d = new Date(r.date);
            return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }),
        values: trendRows.map(r => {
            const t = Number(r.total) || 0;
            const a = Number(r.attended) || 0;
            return t > 0 ? Math.round((a / t) * 100) : 0;
        })
    };

    // 3. Department-wise
    const [deptRows] = await db.query(`
        SELECT
            d.id, d.name AS dept_name, d.code AS dept_code,
            COUNT(a.id)                          AS total,
            SUM(a.status IN ('present','late'))   AS attended
        FROM attendance a
        JOIN class_sessions cs      ON cs.id = a.session_id
        JOIN faculty_assignments fa ON fa.id = cs.assignment_id
        JOIN subjects sub           ON sub.id = fa.subject_id
        JOIN classes c              ON c.id = fa.class_id
        JOIN departments d          ON d.id = c.department_id
        JOIN faculty f              ON f.id = fa.faculty_id
        ${whereClause}
        GROUP BY d.id, d.name, d.code
        ORDER BY d.code ASC
    `, params);

    const deptStats = deptRows.map(r => {
        const t = Number(r.total) || 0;
        const a = Number(r.attended) || 0;
        return { ...r, total: t, attended: a, pct: t > 0 ? Math.round((a/t)*100) : 0 };
    });

    // 4. Section-wise
    const [classRows] = await db.query(`
        SELECT
            c.id, c.name AS class_name, d.code AS dept_code,
            COUNT(a.id)                          AS total,
            SUM(a.status IN ('present','late'))   AS attended,
            SUM(a.status = 'present')             AS present_count,
            SUM(a.status = 'late')                AS late_count,
            SUM(a.status = 'absent')              AS absent_count
        FROM attendance a
        JOIN class_sessions cs      ON cs.id = a.session_id
        JOIN faculty_assignments fa ON fa.id = cs.assignment_id
        JOIN subjects sub           ON sub.id = fa.subject_id
        JOIN classes c              ON c.id = fa.class_id
        JOIN departments d          ON d.id = c.department_id
        JOIN faculty f              ON f.id = fa.faculty_id
        ${whereClause}
        GROUP BY c.id, c.name, d.code
        ORDER BY d.code ASC, c.name ASC
    `, params);

    const classStats = classRows.map(r => {
        const t = Number(r.total) || 0;
        const a = Number(r.attended) || 0;
        return { ...r, total: t, attended: a,
            present_count: Number(r.present_count)||0,
            late_count: Number(r.late_count)||0,
            absent_count: Number(r.absent_count)||0,
            pct: t > 0 ? Math.round((a/t)*100) : 0 };
    });

    // 5. Subject-wise
    const [subjectRows] = await db.query(`
        SELECT
            sub.id, sub.code AS subject_code, sub.name AS subject_name, d.code AS dept_code,
            COUNT(a.id)                          AS total,
            SUM(a.status IN ('present','late'))   AS attended,
            SUM(a.status = 'present')             AS present_count,
            SUM(a.status = 'late')                AS late_count,
            SUM(a.status = 'absent')              AS absent_count
        FROM attendance a
        JOIN class_sessions cs      ON cs.id = a.session_id
        JOIN faculty_assignments fa ON fa.id = cs.assignment_id
        JOIN subjects sub           ON sub.id = fa.subject_id
        JOIN classes c              ON c.id = fa.class_id
        JOIN departments d          ON d.id = c.department_id
        JOIN faculty f              ON f.id = fa.faculty_id
        ${whereClause}
        GROUP BY sub.id, sub.code, sub.name, d.code
        ORDER BY d.code ASC, sub.code ASC
    `, params);

    const subjectStats = subjectRows.map(r => {
        const t = Number(r.total) || 0;
        const a = Number(r.attended) || 0;
        return { ...r, total: t, attended: a,
            present_count: Number(r.present_count)||0,
            late_count: Number(r.late_count)||0,
            absent_count: Number(r.absent_count)||0,
            pct: t > 0 ? Math.round((a/t)*100) : 0 };
    });

    // 6. Students below threshold
    const [lowRows] = await db.query(`
        SELECT
            st.id AS student_id,
            st.roll_number,
            u.full_name,
            d.code AS dept_code,
            c.name AS class_name,
            COUNT(a.id)                          AS total,
            SUM(a.status IN ('present','late'))   AS attended,
            ROUND(SUM(a.status IN ('present','late')) / COUNT(a.id) * 100) AS pct
        FROM attendance a
        JOIN class_sessions cs      ON cs.id = a.session_id
        JOIN faculty_assignments fa ON fa.id = cs.assignment_id
        JOIN subjects sub           ON sub.id = fa.subject_id
        JOIN classes c              ON c.id = fa.class_id
        JOIN departments d          ON d.id = c.department_id
        JOIN faculty f              ON f.id = fa.faculty_id
        JOIN students st            ON st.id = a.student_id
        JOIN users u                ON u.id = st.user_id
        ${whereClause}
        GROUP BY st.id, st.roll_number, u.full_name, d.code, c.name
        HAVING pct < ?
        ORDER BY pct ASC, u.full_name ASC
    `, [...params, THRESHOLD]);

    return { overall, trendData, deptStats, classStats, subjectStats, lowRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch filter dropdowns (all options for admin)
// ─────────────────────────────────────────────────────────────────────────────
async function loadFilterOptions() {
    const [departments]   = await db.query('SELECT id, name, code FROM departments ORDER BY code');
    const [classes]       = await db.query('SELECT c.id, c.name, d.code AS dept_code FROM classes c JOIN departments d ON d.id = c.department_id ORDER BY d.code, c.name');
    const [subjects]      = await db.query('SELECT s.id, s.code, s.name, d.code AS dept_code FROM subjects s JOIN departments d ON d.id = s.department_id ORDER BY d.code, s.code');
    const [facultyList]   = await db.query('SELECT f.id, u.full_name, d.code AS dept_code FROM faculty f JOIN users u ON u.id = f.user_id JOIN departments d ON d.id = f.department_id WHERE u.is_active=1 ORDER BY u.full_name');
    return { departments, classes, subjects, facultyList };
}

const adminReportController = {

    // ──────────────────────────────────────────────────────────────
    // GET /admin/reports  – Analytics & Report Page
    // ──────────────────────────────────────────────────────────────
    async showReports(req, res) {
        try {
            const { dept_id, class_id, subject_id, faculty_id, date_from, date_to } = req.query;

            const { overall, trendData, deptStats, classStats, subjectStats, lowRows } =
                await runAggregateReport(req.query);

            const filterOptions = await loadFilterOptions();

            const [[notifRow]] = await db.query(
                'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
                [req.session.user.id]
            );

            res.render('admin/reports', {
                title: 'Attendance Reports & Analytics - AttendEase',
                pageTitle: 'Reports & Analytics',
                activePage: 'reports',
                user: req.session.user,
                notifCount: notifRow ? notifRow.c : 0,
                threshold: THRESHOLD,
                overall,
                trendData,
                deptStats,
                classStats,
                subjectStats,
                lowRows,
                filterOptions,
                filters: { dept_id: dept_id||'', class_id: class_id||'', subject_id: subject_id||'',
                           faculty_id: faculty_id||'', date_from: date_from||'', date_to: date_to||'' }
            });
        } catch (err) {
            console.error('Admin reports error:', err);
            req.flash('error', 'Could not load analytics report.');
            res.redirect('/admin/dashboard');
        }
    },

    // ──────────────────────────────────────────────────────────────
    // GET /admin/reports/export  – CSV export (student-level detail)
    // Same filters as showReports. Respects all auth and role rules.
    // ──────────────────────────────────────────────────────────────
    async exportCsv(req, res) {
        try {
            const { dept_id, class_id, subject_id, faculty_id, date_from, date_to } = req.query;
            const { whereClause, params } = buildAttendanceFilters(req.query);

            // Student-level attendance detail rows
            const [rows] = await db.query(`
                SELECT
                    cs.session_date,
                    sub.code          AS subject_code,
                    sub.name          AS subject_name,
                    d.code            AS dept_code,
                    c.name            AS class_name,
                    u_fac.full_name   AS faculty_name,
                    st.roll_number,
                    u_stu.full_name   AS student_name,
                    a.status,
                    cs.topic
                FROM attendance a
                JOIN class_sessions cs      ON cs.id = a.session_id
                JOIN faculty_assignments fa ON fa.id = cs.assignment_id
                JOIN subjects sub           ON sub.id = fa.subject_id
                JOIN classes c              ON c.id = fa.class_id
                JOIN departments d          ON d.id = c.department_id
                JOIN faculty f              ON f.id = fa.faculty_id
                JOIN users u_fac            ON u_fac.id = f.user_id
                JOIN students st            ON st.id = a.student_id
                JOIN users u_stu            ON u_stu.id = st.user_id
                ${whereClause}
                ORDER BY cs.session_date DESC, d.code, c.name, sub.code, st.roll_number
                LIMIT 50000
            `, params);

            // Build filename from active filters
            const parts = ['attendance'];
            if (dept_id) parts.push('dept' + dept_id);
            if (class_id) parts.push('class' + class_id);
            if (subject_id) parts.push('sub' + subject_id);
            if (date_from) parts.push('from' + date_from);
            if (date_to) parts.push('to' + date_to);
            const filename = parts.join('_') + '.csv';

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            // Write header
            res.write(csvHeader(
                'Session Date', 'Department', 'Class/Section', 'Subject Code',
                'Subject Name', 'Faculty', 'Roll Number', 'Student Name',
                'Status', 'Topic'
            ) + '\n');

            // Write rows
            for (const r of rows) {
                res.write(csvRow([
                    (d => { const dt = new Date(d); return isNaN(dt) ? String(d) : `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; })(r.session_date),
                    r.dept_code, r.class_name, r.subject_code,
                    r.subject_name, r.faculty_name, r.roll_number,
                    r.student_name, r.status, r.topic || ''
                ]) + '\n');
            }

            res.end();
        } catch (err) {
            console.error('Admin CSV export error:', err);
            res.status(500).send('Export failed.');
        }
    },

    // ──────────────────────────────────────────────────────────────
    // GET /admin/reports/low-attendance  – Students below threshold
    // Optional filters: dept_id, class_id, date_from, date_to
    // ──────────────────────────────────────────────────────────────
    async lowAttendanceReport(req, res) {
        try {
            const { lowRows } = await runAggregateReport(req.query);
            const filterOptions = await loadFilterOptions();
            const { dept_id, class_id, date_from, date_to } = req.query;

            const [[notifRow]] = await db.query(
                'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
                [req.session.user.id]
            );

            res.render('admin/low_attendance', {
                title: 'Low Attendance Students - AttendEase',
                pageTitle: 'Low Attendance Report',
                activePage: 'reports',
                user: req.session.user,
                notifCount: notifRow ? notifRow.c : 0,
                threshold: THRESHOLD,
                lowRows,
                filterOptions,
                filters: { dept_id: dept_id||'', class_id: class_id||'',
                           date_from: date_from||'', date_to: date_to||'' }
            });
        } catch (err) {
            console.error('Low attendance report error:', err);
            req.flash('error', 'Could not load low attendance report.');
            res.redirect('/admin/reports');
        }
    }
};

module.exports = adminReportController;
