// controllers/adminController.js
// Admin dashboard and analytics
// Supports both Plain HTML5 views and Express JSON API responses

const db = require('../config/db');
const path = require('path');

const THRESHOLD = parseInt(process.env.ATTENDANCE_THRESHOLD || 75);

// Helper: check if client expects JSON
function wantsJson(req) {
    return req.xhr || 
           (req.headers.accept && req.headers.accept.includes('application/json')) ||
           (req.originalUrl && req.originalUrl.startsWith('/api'));
}

const adminController = {

    async dashboard(req, res) {
        try {
            // --- 1. Real entity counts from MySQL ---
            const [[studentRow]]  = await db.query('SELECT COUNT(*) AS c FROM users WHERE role = "student" AND is_active = 1');
            const [[facultyRow]]  = await db.query('SELECT COUNT(*) AS c FROM users WHERE role = "faculty" AND is_active = 1');
            const [[subjectRow]]  = await db.query('SELECT COUNT(*) AS c FROM subjects');
            const [[deptRow]]     = await db.query('SELECT COUNT(*) AS c FROM departments');
            const [[classRow]]    = await db.query('SELECT COUNT(*) AS c FROM classes');

            // --- 2. Overall attendance counts (present/absent/late) ---
            const [attRows] = await db.query(`
                SELECT status, COUNT(*) AS cnt
                FROM attendance
                GROUP BY status
            `);

            const chartData = { present: 0, absent: 0, late: 0, total: 0 };
            attRows.forEach(r => {
                chartData[r.status] = Number(r.cnt);
                chartData.total += Number(r.cnt);
            });

            // --- 3. 14-session attendance trend (% per date) ---
            const [trendRows] = await db.query(`
                SELECT sub.date, sub.total, sub.present_count
                FROM (
                    SELECT
                        cs.session_date AS date,
                        COUNT(a.id) AS total,
                        SUM(a.status IN ('present','late')) AS present_count
                    FROM class_sessions cs
                    JOIN attendance a ON a.session_id = cs.id
                    GROUP BY cs.session_date
                    ORDER BY cs.session_date DESC
                    LIMIT 14
                ) sub
                ORDER BY sub.date ASC
            `);

            const trendData = {
                labels: trendRows.map(r => {
                    const d = new Date(r.date);
                    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }),
                values: trendRows.map(r => {
                    const total = Number(r.total) || 0;
                    const present = Number(r.present_count) || 0;
                    return total > 0 ? Math.round((present / total) * 100) : 0;
                })
            };

            // --- 4. Department-wise attendance ---
            const [deptStatRows] = await db.query(`
                SELECT d.code, COUNT(a.id) AS total,
                       SUM(a.status IN ('present','late')) AS present_count
                FROM departments d
                JOIN students st ON st.department_id = d.id
                JOIN attendance a ON a.student_id = st.id
                GROUP BY d.id, d.code
            `);

            const deptStats = deptStatRows.map(r => {
                const total = Number(r.total) || 0;
                const present = Number(r.present_count) || 0;
                return {
                    code: r.code,
                    pct:  total > 0 ? Math.round((present / total) * 100) : 0
                };
            });

            // --- 5. Students below threshold ---
            const [lowRows] = await db.query(`
                SELECT u.full_name, st.roll_number, d.code AS dept_code,
                       COUNT(a.id) AS total,
                       SUM(a.status IN ('present','late')) AS present_count
                FROM students st
                JOIN users u      ON u.id = st.user_id
                JOIN departments d ON d.id = st.department_id
                JOIN attendance a  ON a.student_id = st.id
                GROUP BY st.id
                HAVING ROUND(present_count / total * 100) < ?
                ORDER BY present_count / total ASC
            `, [THRESHOLD]);

            const lowAttendanceStudents = lowRows.map(r => {
                const total = Number(r.total) || 0;
                const present = Number(r.present_count) || 0;
                return {
                    full_name:   r.full_name,
                    roll_number: r.roll_number,
                    dept_code:   r.dept_code,
                    pct: total > 0 ? Math.round((present / total) * 100) : 0
                };
            });

            // --- 6. Unread notifications ---
            const [[notifRow]] = await db.query(
                'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
                [req.session.user.id]
            );

            const responseData = {
                user: req.session.user,
                stats: {
                    totalStudents:     studentRow.c,
                    totalFaculty:      facultyRow.c,
                    totalDepartments:  deptRow.c,
                    totalClasses:      classRow.c,
                    totalSubjects:     subjectRow.c,
                    lowAttendanceCount: lowAttendanceStudents.length
                },
                chartData,
                trendData,
                deptStats,
                lowAttendanceStudents,
                notifCount: notifRow ? notifRow.c : 0
            };

            if (wantsJson(req)) {
                return res.json({ success: true, ...responseData });
            }

            return res.sendFile(path.join(__dirname, '../views_html/admin/dashboard.html'));

        } catch (err) {
            console.error('Admin dashboard error:', err);
            if (wantsJson(req)) {
                return res.status(500).json({ success: false, message: 'Could not load dashboard statistics.' });
            }
            return res.status(500).sendFile(path.join(__dirname, '../views_html/error.html'));
        }
    }
};

module.exports = adminController;
