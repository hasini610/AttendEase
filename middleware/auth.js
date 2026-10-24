const path = require('path');

// middleware/auth.js
// Server-side authentication and role-based access control (RBAC) middleware

/**
 * isLoggedIn
 * Ensures the request is from an authenticated session.
 * If not authenticated, redirects to /login with an informative flash message.
 */
function isLoggedIn(req, res, next) {
    if (req.session && req.session.user && req.session.user.id) {
        return next();
    }

    // Save target URL so user can be redirected back after logging in
    if (req.method === 'GET' && !req.xhr) {
        req.session.returnTo = req.originalUrl;
    }

    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }

    req.flash('error', 'Please sign in to access this page.');
    res.redirect('/login');
}

/**
 * isAdmin
 * Ensures the authenticated user has the 'admin' role.
 * Never trusts client headers/inputs; only checks server-verified session state.
 */
function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }

    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
    }

    res.status(403).sendFile(path.join(__dirname, '../views_html/error.html'));
}

/**
 * isFaculty
 * Ensures the authenticated user has the 'faculty' role.
 */
function isFaculty(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'faculty') {
        return next();
    }

    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Faculty access required.' });
    }

    res.status(403).sendFile(path.join(__dirname, '../views_html/error.html'));
}

/**
 * isStudent
 * Ensures the authenticated user has the 'student' role.
 */
function isStudent(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'student') {
        return next();
    }

    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Student access required.' });
    }

    res.status(403).sendFile(path.join(__dirname, '../views_html/error.html'));
}

/**
 * redirectIfLoggedIn
 * If already logged in, redirects immediately to role dashboard instead of showing login form.
 */
function redirectIfLoggedIn(req, res, next) {
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
        // If session has unknown/corrupted role, clear session to prevent loop
        return req.session.destroy(() => {
            res.clearCookie('attendease_sid', { path: '/' });
            next();
        });
    }
    next();
}

module.exports = {
    isLoggedIn,
    isAdmin,
    isFaculty,
    isStudent,
    redirectIfLoggedIn
};
