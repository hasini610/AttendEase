// app.js
// Entry point for the AttendEase Student Attendance Management System

require('dotenv').config();

const express         = require('express');
const session         = require('express-session');
const MySQLStore      = require('express-mysql-session')(session);
const flash           = require('connect-flash');
const path            = require('path');
const methodOverride  = require('method-override');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---- 1. Frontend: Plain HTML5, Bootstrap 5, Vanilla JS (No EJS Template Engine) ----
// Frontend HTML views are served directly from views_html via route handlers / sendFile

// ---- 2. Static Files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- 3. Body Parsers ----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- 4. Method Override (support PUT/DELETE in HTML forms) ----
app.use(methodOverride('_method'));

// ---- 5. Production-Ready Session Store (MySQL) ----
const sessionStoreOptions = {
    host:               process.env.DB_HOST     || 'localhost',
    port:               process.env.DB_PORT     || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'attendease',
    clearExpired:       true,
    checkExpirationInterval: 900000, // check every 15 min
    expiration:         86400000,    // 1 day
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires:    'expires',
            data:       'data'
        }
    }
};

let sessionStore;
try {
    sessionStore = new MySQLStore(sessionStoreOptions);
    console.log('✅ [Sessions]: MySQL persistent session store configured.');
} catch (storeErr) {
    console.warn('⚠️ [Sessions]: Falling back to standard memory session store:', storeErr.message);
}

app.use(session({
    key:               'attendease_sid',
    secret:            process.env.SESSION_SECRET || 'attendease_super_secret_key_2024',
    store:             sessionStore,
    resave:            false,
    saveUninitialized: false,
    cookie: {
        maxAge:   1000 * 60 * 60 * 8, // 8 hours
        httpOnly: true,                // Prevents XSS cookie theft
        secure:   process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'lax'                // CSRF mitigation
    }
}));

// ---- 6. Flash Messages ----
app.use(flash());

// ---- 7. Global Template Variables Middleware ----
app.use((req, res, next) => {
    res.locals.user         = req.session ? req.session.user : null;
    res.locals.notifCount   = 0;
    res.locals.currentPath  = req.path;
    res.locals.flashSuccess = req.flash('success');
    res.locals.flashError   = req.flash('error');
    res.locals.collegeName  = 'Geethanjali College of Engineering and Technology';
    res.locals.formatDate   = (d) => {
        if (!d) return '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return String(d);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    next();
});

// ---- 8. Application Routes ----
const authRoutes    = require('./routes/auth');
const adminRoutes   = require('./routes/admin');
const facultyRoutes = require('./routes/faculty');
const studentRoutes = require('./routes/student');

app.use('/',              authRoutes);
app.use('/admin',         adminRoutes);
app.use('/faculty',       facultyRoutes);
app.use('/student',       studentRoutes);
// API aliases — HTML pages fetch from /api/student/* and /api/faculty/*
app.use('/api/student',   studentRoutes);
app.use('/api/faculty',   facultyRoutes);
app.use('/api/admin',     adminRoutes);

// ---- 9. Root Route Handler ----
app.get('/', (req, res) => {
    if (req.session && req.session.user && req.session.user.role) {
        const dashboardMap = {
            admin:   '/admin/dashboard',
            faculty: '/faculty/dashboard',
            student: '/student/dashboard'
        };
        return res.redirect(dashboardMap[req.session.user.role] || '/login');
    }
    res.redirect('/login');
});

// ---- 10. 404 Route Handler ----
app.use((req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (wantsJson) {
        return res.status(404).json({ success: false, message: 'The requested resource could not be found.' });
    }
    res.status(404).sendFile(path.join(__dirname, 'views_html/error.html'));
});

// ---- 11. Centralized Error Handler ----
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (wantsJson) {
        return res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
    }
    res.status(500).sendFile(path.join(__dirname, 'views_html/error.html'));
});

// ---- 12. Start Express Server ----
app.listen(PORT, () => {
    console.log(`🚀 AttendEase Server active at http://localhost:${PORT}`);
});
