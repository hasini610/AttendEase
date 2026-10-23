/**
 * test_phase6_reports.js
 * Phase 6 – Reports, Charts & Analytics
 * Automated integration test suite for AttendEase
 *
 * Prerequisites:
 *   - Node.js server running on http://localhost:3000  (npm run dev)
 *   - MySQL `attendease` database seeded with Phase 4 data
 *   - Admin  login: admin / Admin123!
 *   - Faculty login: walter.white / Faculty123!
 *   - Student login: any student (e.g. piper.chapman / Student123!)
 *
 * Run: node test_phase6_reports.js
 */

const http = require('http');
const https = require('https');

// ─── config ────────────────────────────────────────────────────────────────
const BASE       = 'http://localhost:3000';
const ADMIN_UN   = 'admin';
const ADMIN_PW   = 'Admin@123';
const FAC_UN     = 'prof_anand';
const FAC_PW     = 'password123';
const STU_UN     = 'stu_arun';
const STU_PW     = 'password123';
// ───────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
    if (cond) {
        console.log(`  ✅  ${label}`);
        passed++;
    } else {
        console.error(`  ❌  ${label}`);
        failed++;
        failures.push(label);
    }
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────
function request(options, body = null) {
    return new Promise((resolve, reject) => {
        const lib = options.protocol === 'https:' ? https : http;
        const req = lib.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function parseCookies(setCookieArr) {
    const cookies = {};
    (setCookieArr || []).forEach(c => {
        const [pair] = c.split(';');
        const [k, v] = pair.split('=');
        if (k && v !== undefined) cookies[k.trim()] = v.trim();
    });
    return cookies;
}

function cookieHeader(cookies) {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function urlParse(u) {
    const url = new URL(u, BASE);
    return {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname + url.search,
        protocol: url.protocol
    };
}

// ─── Login helper ──────────────────────────────────────────────────────────
async function login(username, password) {
    // GET login page for CSRF / session cookie
    const getRes = await request({ ...urlParse('/login'), method: 'GET' });
    const cookies = parseCookies(
        Array.isArray(getRes.headers['set-cookie'])
            ? getRes.headers['set-cookie']
            : [getRes.headers['set-cookie']].filter(Boolean)
    );

    const body = new URLSearchParams({ username, password }).toString();
    const postRes = await request({
        ...urlParse('/login'),
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'Cookie': cookieHeader(cookies)
        }
    }, body);

    // Merge cookies from POST response
    const newCookies = parseCookies(
        Array.isArray(postRes.headers['set-cookie'])
            ? postRes.headers['set-cookie']
            : [postRes.headers['set-cookie']].filter(Boolean)
    );

    return { ...cookies, ...newCookies };
}

async function get(path, cookies) {
    return request({
        ...urlParse(path),
        method: 'GET',
        headers: { Cookie: cookieHeader(cookies) }
    });
}

// ─── Test groups ───────────────────────────────────────────────────────────
async function testAdminReports(cookies) {
    console.log('\n📊  Admin Reports & Analytics');

    // GET /admin/reports
    const r1 = await get('/admin/reports', cookies);
    assert(r1.status === 200, 'GET /admin/reports returns 200');
    assert(r1.body.includes('Reports'), 'Admin reports page has "Reports" heading');
    assert(r1.body.includes('Attendance Status'), 'Admin reports page has status chart section');
    assert(r1.body.includes('Attendance Trend'), 'Admin reports page has trend chart section');
    assert(r1.body.includes('Department Comparison'), 'Admin reports page has department chart section');
    assert(r1.body.includes('Section Comparison'), 'Admin reports page has section comparison');
    assert(r1.body.includes('Subject Attendance'), 'Admin reports page has subject chart section');
    assert(r1.body.includes('Low Attendance Alert') || r1.body.includes('Below'), 'Admin reports page has low-attendance section');

    // Filter by dept_id=1
    const r2 = await get('/admin/reports?dept_id=1', cookies);
    assert(r2.status === 200, 'GET /admin/reports?dept_id=1 returns 200');

    // Filter by invalid dept_id (SQL injection attempt should be safely ignored)
    const r3 = await get('/admin/reports?dept_id=1+OR+1=1', cookies);
    assert(r3.status === 200, 'SQL injection in dept_id handled gracefully (page still loads)');
    // page should not contain a raw MySQL error
    assert(!r3.body.toLowerCase().includes('mysql'), 'No raw MySQL error leaked to UI');

    // Date range filter
    const r4 = await get('/admin/reports?date_from=2025-01-01&date_to=2025-12-31', cookies);
    assert(r4.status === 200, 'GET /admin/reports with date range returns 200');

    // Combined filters
    const r5 = await get('/admin/reports?dept_id=1&class_id=1', cookies);
    assert(r5.status === 200, 'GET /admin/reports combined filters returns 200');
}

async function testAdminCsvExport(cookies) {
    console.log('\n📥  Admin CSV Export');

    const r1 = await get('/admin/reports/export', cookies);
    assert(r1.status === 200, 'GET /admin/reports/export returns 200');
    assert(
        (r1.headers['content-type'] || '').includes('text/csv'),
        'Export Content-Type is text/csv'
    );
    assert(
        (r1.headers['content-disposition'] || '').includes('attachment'),
        'Export Content-Disposition is attachment'
    );

    // Check header row
    const firstLine = r1.body.split('\n')[0];
    assert(firstLine.includes('Session Date'), 'CSV header includes Session Date');
    assert(firstLine.includes('Student Name'), 'CSV header includes Student Name');
    assert(firstLine.includes('Status'), 'CSV header includes Status');

    // No formula injection (check no leading =, +, - in data cells that aren't quoted/prefixed)
    // A simple check: no cell starting with = outside quotes
    const lines = r1.body.split('\n').slice(1);
    const hasUnsafeCell = lines.some(line => {
        const cells = line.split(',');
        return cells.some(cell => /^[=+\-@]/.test(cell.trim()));
    });
    assert(!hasUnsafeCell, 'CSV data cells are safe from formula injection (=, +, -, @)');

    // Export with filter
    const r2 = await get('/admin/reports/export?dept_id=1', cookies);
    assert(r2.status === 200, 'GET /admin/reports/export?dept_id=1 returns 200');
    assert(
        (r2.headers['content-type'] || '').includes('text/csv'),
        'Filtered export Content-Type is text/csv'
    );
}

async function testAdminLowAttendance(cookies) {
    console.log('\n⚠️   Admin Low Attendance Report');

    const r1 = await get('/admin/reports/low-attendance', cookies);
    assert(r1.status === 200, 'GET /admin/reports/low-attendance returns 200');
    assert(r1.body.includes('Low Attendance'), 'Low-attendance page rendered correctly');
    assert(r1.body.includes('Sessions Needed') || r1.body.includes('classes'), 'Shows sessions needed column');

    const r2 = await get('/admin/reports/low-attendance?dept_id=1', cookies);
    assert(r2.status === 200, 'GET /admin/reports/low-attendance?dept_id=1 returns 200');
}

async function testFacultyReports(cookies) {
    console.log('\n👨‍🏫  Faculty Reports & CSV Export');

    const r1 = await get('/faculty/reports', cookies);
    assert(r1.status === 200, 'GET /faculty/reports returns 200');
    assert(r1.body.includes('Attendance'), 'Faculty reports page has attendance content');
    assert(r1.body.includes('Export CSV'), 'Faculty reports page has Export CSV button');

    // Faculty CSV export
    const r2 = await get('/faculty/reports/export', cookies);
    assert(r2.status === 200, 'GET /faculty/reports/export returns 200');
    assert(
        (r2.headers['content-type'] || '').includes('text/csv'),
        'Faculty export Content-Type is text/csv'
    );
    assert(
        (r2.headers['content-disposition'] || '').includes('.csv'),
        'Faculty export has .csv in filename'
    );

    // CSV header check
    const firstLine = r2.body.split('\n')[0];
    assert(firstLine.includes('Roll Number') || firstLine.includes('Student'), 'Faculty CSV has student info header');
    assert(firstLine.includes('Status'), 'Faculty CSV has status header');

    // Faculty export should NOT expose admin data (no 'admin' username or sensitive fields)
    assert(!r2.body.includes('password'), 'Faculty CSV does not include password fields');

    // Filter by class
    const r3 = await get('/faculty/reports/export?class_id=1', cookies);
    assert(r3.status === 200, 'Faculty export with class filter returns 200');
}

async function testAuthGuards(adminCookies, facCookies, stuCookies) {
    console.log('\n🔒  Authorization Guards');

    // Unauthenticated access should redirect to login
    const r1 = await get('/admin/reports', {});
    assert(r1.status === 302 || r1.status === 401, 'Unauthenticated /admin/reports redirects (302) or 401');

    const r2 = await get('/admin/reports/export', {});
    assert(r2.status === 302 || r2.status === 401, 'Unauthenticated /admin/reports/export redirects or 401');

    // Faculty cannot access admin reports
    if (facCookies) {
        const r3 = await get('/admin/reports', facCookies);
        assert(r3.status === 302 || r3.status === 403, 'Faculty cannot access /admin/reports');

        const r4 = await get('/admin/reports/export', facCookies);
        assert(r4.status === 302 || r4.status === 403, 'Faculty cannot export admin CSV');
    }

    // Student cannot access admin reports
    if (stuCookies) {
        const r5 = await get('/admin/reports', stuCookies);
        assert(r5.status === 302 || r5.status === 403, 'Student cannot access /admin/reports');

        // Student cannot access faculty reports
        const r6 = await get('/faculty/reports', stuCookies);
        assert(r6.status === 302 || r6.status === 403, 'Student cannot access /faculty/reports');

        // Student cannot access faculty CSV export
        const r7 = await get('/faculty/reports/export', stuCookies);
        assert(r7.status === 302 || r7.status === 403, 'Student cannot access /faculty/reports/export');
    }
}

async function testRegressionPhase3to5(adminCookies, facCookies, stuCookies) {
    console.log('\n🔄  Regression – Phases 3–5 still operational');

    // Phase 3 – Admin core
    const adPaths = ['/admin/dashboard', '/admin/students', '/admin/faculty', '/admin/departments', '/admin/subjects', '/admin/timetable'];
    for (const p of adPaths) {
        const r = await get(p, adminCookies);
        assert(r.status === 200, `Phase-3: GET ${p} still returns 200`);
    }

    // Phase 4 – Faculty core
    const facPaths = ['/faculty/dashboard', '/faculty/timetable', '/faculty/sessions', '/faculty/reports'];
    for (const p of facPaths) {
        const r = await get(p, facCookies);
        assert(r.status === 200, `Phase-4: GET ${p} still returns 200`);
    }

    // Phase 5 – Student core
    if (stuCookies) {
        const stuPaths = ['/student/dashboard', '/student/attendance', '/student/timetable'];
        for (const p of stuPaths) {
            const r = await get(p, stuCookies);
            assert(r.status === 200, `Phase-5: GET ${p} still returns 200`);
        }
    }
}

// ─── Main runner ──────────────────────────────────────────────────────────
(async function main() {
    console.log('='.repeat(60));
    console.log('  AttendEase – Phase 6 Reports & Analytics Test Suite');
    console.log('='.repeat(60));
    console.log(`  Base URL: ${BASE}`);
    console.log('');

    let adminCookies, facCookies, stuCookies;

    try {
        console.log('🔑  Logging in as admin...');
        adminCookies = await login(ADMIN_UN, ADMIN_PW);
        const adminCheck = await get('/admin/dashboard', adminCookies);
        assert(adminCheck.status === 200, 'Admin login successful');
    } catch (e) {
        console.error('❌  Could not log in as admin:', e.message);
        console.error('    Is the server running on', BASE, '?');
        process.exit(1);
    }

    try {
        console.log('🔑  Logging in as faculty...');
        facCookies = await login(FAC_UN, FAC_PW);
        const facCheck = await get('/faculty/dashboard', facCookies);
        assert(facCheck.status === 200, 'Faculty login successful');
    } catch (e) {
        console.log('⚠️   Faculty login failed (non-fatal):', e.message);
    }

    try {
        console.log('🔑  Logging in as student...');
        stuCookies = await login(STU_UN, STU_PW);
        const stuCheck = await get('/student/dashboard', stuCookies);
        assert(stuCheck.status === 200, 'Student login successful');
    } catch (e) {
        console.log('⚠️   Student login failed (non-fatal):', e.message);
    }

    await testAdminReports(adminCookies);
    await testAdminCsvExport(adminCookies);
    await testAdminLowAttendance(adminCookies);
    if (facCookies) await testFacultyReports(facCookies);
    await testAuthGuards(adminCookies, facCookies, stuCookies);
    await testRegressionPhase3to5(adminCookies, facCookies, stuCookies);

    console.log('\n' + '='.repeat(60));
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failures.length) {
        console.log('\n  Failed tests:');
        failures.forEach(f => console.log(`    - ${f}`));
    }
    console.log('='.repeat(60));
    process.exit(failed > 0 ? 1 : 0);
})();
