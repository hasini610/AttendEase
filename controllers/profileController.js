// controllers/profileController.js
// Handles user profile view, detail updates, and secure password changes

const bcrypt = require('bcryptjs');
const db     = require('../config/db');

const profileController = {

    // GET /:role/profile
    async showProfile(req, res) {
        try {
            const user = req.session.user;
            let roleDetails = null;

            if (user.role === 'student') {
                const [rows] = await db.query(`
                    SELECT s.roll_number, d.name AS department_name, d.code AS dept_code,
                           c.name AS class_name, sem.name AS semester_name, ay.year_label
                    FROM students s
                    LEFT JOIN departments d   ON d.id = s.department_id
                    LEFT JOIN enrollments e   ON e.student_id = s.id
                    LEFT JOIN classes c       ON c.id = e.class_id
                    LEFT JOIN semesters sem   ON sem.id = s.semester_id
                    LEFT JOIN academic_years ay ON ay.id = s.academic_year_id
                    WHERE s.user_id = ?
                `, [user.id]);
                roleDetails = rows[0] || {};
            } else if (user.role === 'faculty') {
                const [rows] = await db.query(`
                    SELECT f.employee_id, f.designation, d.name AS department_name, d.code AS dept_code
                    FROM faculty f
                    LEFT JOIN departments d ON d.id = f.department_id
                    WHERE f.user_id = ?
                `, [user.id]);
                roleDetails = rows[0] || {};
            }

            // Get unread notification count
            const [[notifRow]] = await db.query(
                'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
                [user.id]
            );

            res.render('profile/index', {
                title: 'My Profile - AttendEase',
                pageTitle: 'Profile & Settings',
                activePage: 'profile',
                user,
                roleDetails,
                notifCount: notifRow ? notifRow.c : 0,
                flash: {
                    success: req.flash('success'),
                    error: req.flash('error')
                }
            });

        } catch (err) {
            console.error('Profile view error:', err);
            req.flash('error', 'Could not load profile.');
            res.redirect(`/${req.session.user.role}/dashboard`);
        }
    },

    // POST /:role/profile/update
    async updateProfile(req, res) {
        const { full_name, phone } = req.body;
        const userId = req.session.user.id;
        const role = req.session.user.role;

        try {
            await db.query(
                'UPDATE users SET full_name = ?, phone = ? WHERE id = ?',
                [full_name.trim(), phone ? phone.trim() : null, userId]
            );

            // Update session
            req.session.user.full_name = full_name.trim();

            req.flash('success', 'Profile updated successfully.');
            res.redirect(`/${role}/profile`);
        } catch (err) {
            console.error('Profile update error:', err);
            req.flash('error', 'Could not update profile.');
            res.redirect(`/${role}/profile`);
        }
    },

    // POST /:role/profile/change-password
    async changePassword(req, res) {
        const { current_password, new_password, confirm_password } = req.body;
        const userId = req.session.user.id;
        const role = req.session.user.role;

        if (!current_password || !new_password || !confirm_password) {
            req.flash('error', 'All password fields are required.');
            return res.redirect(`/${role}/profile`);
        }

        if (new_password !== confirm_password) {
            req.flash('error', 'New passwords do not match.');
            return res.redirect(`/${role}/profile`);
        }

        if (new_password.length < 6) {
            req.flash('error', 'New password must be at least 6 characters.');
            return res.redirect(`/${role}/profile`);
        }

        try {
            const [[user]] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);

            const match = await bcrypt.compare(current_password, user.password);
            if (!match) {
                req.flash('error', 'Current password is incorrect.');
                return res.redirect(`/${role}/profile`);
            }

            const hashed = await bcrypt.hash(new_password, 10);
            await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);

            req.flash('success', 'Password changed successfully!');
            res.redirect(`/${role}/profile`);

        } catch (err) {
            console.error('Change password error:', err);
            req.flash('error', 'Server error while changing password.');
            res.redirect(`/${role}/profile`);
        }
    }
};

module.exports = profileController;
