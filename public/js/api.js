// public/js/api.js
// Centralized API client and DOM helpers for AttendEase

const AttendEase = {
    // Current authenticated user cache
    currentUser: null,

    // Safe HTML escaping helper
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // Format MySQL date to YYYY-MM-DD safely
    formatDate(d) {
        if (!d) return '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return String(d);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    // Format time from HH:MM:SS to 12-hour format (e.g. 9:00 AM)
    formatTime12(timeStr) {
        if (!timeStr) return '';
        const parts = timeStr.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const suff = h >= 12 ? 'PM' : 'AM';
        const hr = h % 12 || 12;
        const min = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
        return `${hr}${min} ${suff}`;
    },

    // Display a dismissible flash alert banner
    showFlash(message, type = 'success') {
        const container = document.getElementById('flashContainer');
        if (!container) return;

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show aesthetic-alert d-flex align-items-center`;
        alertDiv.setAttribute('role', 'alert');

        const icon = document.createElement('i');
        icon.className = type === 'error' ? 'bi bi-exclamation-triangle-fill me-2 fs-5' : 'bi bi-check-circle-fill me-2 fs-5';
        alertDiv.appendChild(icon);

        const msgSpan = document.createElement('span');
        msgSpan.textContent = message;
        alertDiv.appendChild(msgSpan);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'alert');
        closeBtn.setAttribute('aria-label', 'Close');
        alertDiv.appendChild(closeBtn);

        container.replaceChildren(alertDiv);
    },

    // Authenticated API request helper with session expiration handling
    async apiFetch(url, options = {}) {
        const headers = {
            'Accept': 'application/json',
            ...(options.headers || {})
        };

        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof URLSearchParams)) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }

        try {
            const res = await fetch(url, { credentials: 'same-origin', ...options, headers });

            // Session expired or unauthenticated
            if (res.status === 401) {
                window.location.href = '/login';
                throw new Error('Session expired. Please log in again.');
            }

            // Forbidden / Cross-role violation
            if (res.status === 403) {
                const errData = await res.json().catch(() => ({}));
                AttendEase.showFlash(errData.message || 'Access Forbidden: Insufficient permissions for this resource.', 'error');
                throw new Error(errData.message || 'Forbidden');
            }

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.message || data.error || `HTTP error ${res.status}`);
                }
                return data;
            }

            if (!res.ok) {
                throw new Error(`HTTP error ${res.status}`);
            }
            return await res.text();
        } catch (err) {
            console.error('API Fetch error:', err);
            throw err;
        }
    },

    // Fetch current logged-in user profile
    async getCurrentUser() {
        if (AttendEase.currentUser) return AttendEase.currentUser;
        try {
            const data = await AttendEase.apiFetch('/api/auth/me');
            AttendEase.currentUser = data.user;
            return data.user;
        } catch (err) {
            return null;
        }
    }
};

window.AttendEase = AttendEase;
