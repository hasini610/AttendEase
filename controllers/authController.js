// controllers/authController.js
// Handles authentication, login verification, session regeneration, and logout

const bcrypt = require('bcryptjs');
const db     = require('../config/db');

const authController = {

    // GET /login - Show login page
    showLogin(req, res) {
        // If already authenticated, redirect to appropriate role dashboard
        if (req.session && req.session.user && req.session.user.role) {
            const dashboardMap = {
                admin:   '/admin/dashboard',
                faculty: '/faculty/dashboard',
                student: '/student/dashboard'
            };
            const dest = dashboardMap[req.session.user.role];
            if (dest) {
                return res.redirect(dest);
            }
        }

        res.render('auth/login', {
            title: 'Login - AttendEase',
            error: req.flash('error'),
            success: req.flash('success')
        });
    },

    // POST /login - Process login credentials securely
    async processLogin(req, res) {
        const { username, password } = req.body;
        const isJson = req.xhr || req.headers.accept?.includes('json') || req.is('json');

        // 1. Basic input validation
        if (!username || !password || !username.trim() || !password.trim()) {
            const errorMsg = 'Please enter both username/email and password.';
            if (isJson) {
                return res.status(400).json({ success: false, message: errorMsg });
            }
            req.flash('error', errorMsg);
            return res.redirect('/login');
        }

        const identifier = username.trim();
        const plainPassword = password.trim();

        try {
            // 2. Retrieve user using parameterized query to prevent SQL injection
            // Match against either username OR email (case-insensitive in standard MySQL collation)
            const [rows] = await db.query(
                `SELECT id, username, email, password, role, full_name, is_active
                 FROM users
                 WHERE (username = ? OR email = ?)
                 LIMIT 1`,
                [identifier, identifier]
            );

            // Generic error message to prevent account enumeration attacks
            const invalidCredsMsg = 'Invalid username or password.';

            if (rows.length === 0) {
                if (isJson) {
                    return res.status(401).json({ success: false, message: invalidCredsMsg });
                }
                req.flash('error', invalidCredsMsg);
                return res.redirect('/login');
            }

            const user = rows[0];

            // 3. Check if account is active
            if (!user.is_active) {
                const inactiveMsg = 'Your account has been deactivated. Please contact your college administrator.';
                if (isJson) {
                    return res.status(403).json({ success: false, message: inactiveMsg });
                }
                req.flash('error', inactiveMsg);
                return res.redirect('/login');
            }

            // 4. Verify password with bcrypt
            const passwordMatch = await bcrypt.compare(plainPassword, user.password);

            if (!passwordMatch) {
                if (isJson) {
                    return res.status(401).json({ success: false, message: invalidCredsMsg });
                }
                req.flash('error', invalidCredsMsg);
                return res.redirect('/login');
            }

            // 5. Determine dashboard redirect URL based on verified role
            const dashboardMap = {
                admin:   '/admin/dashboard',
                faculty: '/faculty/dashboard',
                student: '/student/dashboard'
            };
            const redirectUrl = dashboardMap[user.role] || '/login';

            // 6. Regenerate session to prevent Session Fixation attacks
            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error:', err);
                    const errMsg = 'A session error occurred. Please try again.';
                    if (isJson) return res.status(500).json({ success: false, message: errMsg });
                    req.flash('error', errMsg);
                    return res.redirect('/login');
                }

                // 7. Store ONLY necessary non-sensitive user fields in session
                req.session.user = {
                    id:        user.id,
                    username:  user.username,
                    role:      user.role,
                    full_name: user.full_name,
                    email:     user.email
                };

                // Save session before redirecting
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('Session save error:', saveErr);
                    }

                    if (isJson) {
                        return res.json({
                            success: true,
                            redirectUrl: redirectUrl,
                            message: `Welcome back, ${user.full_name}!`
                        });
                    }

                    res.redirect(redirectUrl);
                });
            });

        } catch (err) {
            console.error('Login process error:', err);
            const serverErrMsg = 'A server error occurred. Please try again shortly.';
            if (isJson) {
                return res.status(500).json({ success: false, message: serverErrMsg });
            }
            req.flash('error', serverErrMsg);
            res.redirect('/login');
        }
    },

    // GET /logout - Secure logout: destroy session, clear cookie, redirect
    logout(req, res) {
        const cookieName = 'attendease_sid';

        if (req.session) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Logout error destroying session:', err);
                }
                res.clearCookie(cookieName, { path: '/' });
                res.redirect('/login');
            });
        } else {
            res.clearCookie(cookieName, { path: '/' });
            res.redirect('/login');
        }
    }
};

module.exports = authController;
