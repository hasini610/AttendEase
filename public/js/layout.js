// public/js/layout.js
// Renders dynamic Topbar and Sidebar based on authenticated user session and role

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check for flash message in query parameters or session
    const urlParams = new URLSearchParams(window.location.search);
    const successMsg = urlParams.get('success') || urlParams.get('msg');
    const errorMsg = urlParams.get('error');

    if (successMsg) {
        AttendEase.showFlash(decodeURIComponent(successMsg), 'success');
        // Clean URL without reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    } else if (errorMsg) {
        AttendEase.showFlash(decodeURIComponent(errorMsg), 'error');
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    // 2. Fetch authenticated user data
    const user = await AttendEase.getCurrentUser();
    if (!user) {
        // If not on login page and not authenticated, redirect
        if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
        }
        return;
    }

    // 3. Render Topbar
    const topbarContainer = document.getElementById('topbarHeader');
    if (topbarContainer) {
        const pageTitle = topbarContainer.getAttribute('data-page-title') || document.title.split('-')[0].trim() || 'Dashboard';
        const userInitial = (user.full_name || user.username || 'U').charAt(0).toUpperCase();

        const roleBadgeMap = {
            admin: '<span class="badge bg-danger-subtle text-danger rounded-pill px-2 fs-11 fw-semibold">Admin</span>',
            faculty: '<span class="badge bg-primary-subtle text-primary rounded-pill px-2 fs-11 fw-semibold">Faculty</span>',
            student: '<span class="badge bg-success-subtle text-success rounded-pill px-2 fs-11 fw-semibold">Student</span>'
        };

        const profileUrl = user.role === 'admin' ? '/admin/profile' : (user.role === 'faculty' ? '/faculty/profile' : '/student/profile');

        topbarContainer.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <button class="btn btn-sm d-lg-none rail-toggler p-1" id="mobileRailToggle" type="button" aria-label="Toggle Navigation">
                    <i class="bi bi-list fs-4"></i>
                </button>
                <div class="topbar-page-identity">
                    <h1 class="topbar-title mb-0">${AttendEase.escapeHtml(pageTitle)}</h1>
                    <span class="topbar-college-label d-none d-md-inline text-muted fs-12">Geethanjali College of Engineering and Technology</span>
                </div>
            </div>

            <div class="d-flex align-items-center gap-3">
                <div class="topbar-notif-box position-relative" title="Notifications">
                    <button class="btn btn-icon-round position-relative" type="button" id="notifBtn">
                        <i class="bi bi-bell fs-5 text-secondary"></i>
                        <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger fs-10" id="notifCountBadge" style="display:none;">0</span>
                    </button>
                </div>

                <div class="dropdown">
                    <button class="btn user-profile-btn d-flex align-items-center gap-2 p-1" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <div class="avatar-circle">${AttendEase.escapeHtml(userInitial)}</div>
                        <div class="d-none d-sm-block text-start lh-1">
                            <span class="user-name-display d-block fw-bold fs-13 text-dark">${AttendEase.escapeHtml(user.full_name || user.username)}</span>
                            <div class="mt-1">${roleBadgeMap[user.role] || ''}</div>
                        </div>
                        <i class="bi bi-chevron-down fs-11 text-muted ms-1"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3 mt-2 fs-13">
                        <li class="px-3 py-2 border-bottom">
                            <strong class="d-block text-dark">${AttendEase.escapeHtml(user.full_name || user.username)}</strong>
                            <small class="text-muted">${AttendEase.escapeHtml(user.email || '')}</small>
                        </li>
                        <li><a class="dropdown-item py-2" href="${profileUrl}"><i class="bi bi-person-circle me-2"></i>My Profile</a></li>
                        <li><a class="dropdown-item py-2" href="${profileUrl}#changePassword"><i class="bi bi-shield-lock me-2"></i>Change Password</a></li>
                        <li><hr class="dropdown-divider my-1"></li>
                        <li><a class="dropdown-item text-danger py-2" href="/logout"><i class="bi bi-box-arrow-right me-2"></i>Sign Out</a></li>
                    </ul>
                </div>
            </div>
        `;
    }

    // 4. Render Sidebar Rail Navigation
    const sidebarContainer = document.getElementById('sidebarRail');
    if (sidebarContainer) {
        const activePage = document.body.getAttribute('data-active-page') || '';
        const role = user.role;

        let navLinks = '';

        if (role === 'admin') {
            const adminItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-fill', url: '/admin/dashboard' },
                { id: 'students', label: 'Students', icon: 'bi-people-fill', url: '/admin/students' },
                { id: 'faculty', label: 'Faculty', icon: 'bi-person-badge-fill', url: '/admin/faculty' },
                { id: 'departments', label: 'Departments', icon: 'bi-building', url: '/admin/departments' },
                { id: 'classes', label: 'Classes', icon: 'bi-diagram-3-fill', url: '/admin/classes' },
                { id: 'subjects', label: 'Subjects', icon: 'bi-book-fill', url: '/admin/subjects' },
                { id: 'assignments', label: 'Teaching Allocations', icon: 'bi-person-lines-fill', url: '/admin/assignments' },
                { id: 'timetable', label: 'Timetable', icon: 'bi-calendar3', url: '/admin/timetable' },
                { id: 'reports', label: 'Reports & Analytics', icon: 'bi-bar-chart-line-fill', url: '/admin/reports' },
                { id: 'low_attendance', label: 'Low Attendance', icon: 'bi-exclamation-triangle-fill', url: '/admin/reports/low-attendance' },
                { id: 'profile', label: 'Profile & Settings', icon: 'bi-gear-fill', url: '/admin/profile' }
            ];
            navLinks = adminItems.map(item => `
                <a href="${item.url}" class="rail-link ${activePage === item.id ? 'active' : ''}" data-bs-toggle="tooltip" data-bs-placement="right" title="${item.label}">
                    <i class="bi ${item.icon}"></i>
                    <span class="rail-label">${item.label}</span>
                </a>
            `).join('');
        } else if (role === 'faculty') {
            const facultyItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-fill', url: '/faculty/dashboard' },
                { id: 'timetable', label: 'My Timetable', icon: 'bi-calendar3', url: '/faculty/timetable' },
                { id: 'sessions', label: 'Class Sessions', icon: 'bi-collection-play-fill', url: '/faculty/sessions' },
                { id: 'mark', label: 'Mark Attendance', icon: 'bi-calendar-check-fill', url: '/faculty/mark' },
                { id: 'history', label: 'Attendance History', icon: 'bi-clock-history', url: '/faculty/history' },
                { id: 'reports', label: 'Reports & Analytics', icon: 'bi-bar-chart-line-fill', url: '/faculty/reports' },
                { id: 'profile', label: 'Profile & Settings', icon: 'bi-gear-fill', url: '/faculty/profile' }
            ];
            navLinks = facultyItems.map(item => `
                <a href="${item.url}" class="rail-link ${activePage === item.id ? 'active' : ''}" data-bs-toggle="tooltip" data-bs-placement="right" title="${item.label}">
                    <i class="bi ${item.icon}"></i>
                    <span class="rail-label">${item.label}</span>
                </a>
            `).join('');
        } else if (role === 'student') {
            const studentItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-fill', url: '/student/dashboard' },
                { id: 'attendance', label: 'My Attendance', icon: 'bi-calendar-check-fill', url: '/student/attendance' },
                { id: 'timetable', label: 'My Timetable', icon: 'bi-calendar3', url: '/student/timetable' },
                { id: 'history', label: 'Attendance History', icon: 'bi-clock-history', url: '/student/history' },
                { id: 'profile', label: 'Profile & Settings', icon: 'bi-gear-fill', url: '/student/profile' }
            ];
            navLinks = studentItems.map(item => `
                <a href="${item.url}" class="rail-link ${activePage === item.id ? 'active' : ''}" data-bs-toggle="tooltip" data-bs-placement="right" title="${item.label}">
                    <i class="bi ${item.icon}"></i>
                    <span class="rail-label">${item.label}</span>
                </a>
            `).join('');
        }

        const homeUrl = role === 'admin' ? '/admin/dashboard' : (role === 'faculty' ? '/faculty/dashboard' : '/student/dashboard');

        sidebarContainer.innerHTML = `
            <a href="${homeUrl}" class="rail-brand" title="AttendEase Home">
                <div class="rail-glyph">
                    <i class="bi bi-mortarboard-fill"></i>
                </div>
            </a>
            <nav class="rail-nav">
                ${navLinks}
            </nav>
            <div class="rail-footer">
                <a href="/logout" class="rail-link rail-logout" data-bs-toggle="tooltip" data-bs-placement="right" title="Sign Out">
                    <i class="bi bi-box-arrow-left"></i>
                    <span class="rail-label">Sign Out</span>
                </a>
            </div>
        `;

        // Initialize Bootstrap tooltips on rendered sidebar links
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            sidebarContainer.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                new bootstrap.Tooltip(el);
            });
        }
    }

    // 5. Mobile Sidebar Toggler and Overlay
    let overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    const mobileToggle = document.getElementById('mobileRailToggle');
    const rail = document.querySelector('.sidebar-rail');
    if (mobileToggle && rail) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            rail.classList.toggle('open');
            overlay.classList.toggle('show');
        });

        overlay.addEventListener('click', () => {
            rail.classList.remove('open');
            overlay.classList.remove('show');
        });

        // Close sidebar on click outside
        document.addEventListener('click', (e) => {
            if (rail.classList.contains('open') && !rail.contains(e.target) && !mobileToggle.contains(e.target)) {
                rail.classList.remove('open');
                overlay.classList.remove('show');
            }
        });
    }
});
