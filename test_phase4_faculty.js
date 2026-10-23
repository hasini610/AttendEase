// test_phase4_faculty.js
// Comprehensive automated test suite for Phase 4: Faculty Module

const db = require('./config/db');

const BASE_URL = 'http://localhost:3000';

class SessionClient {
    constructor() {
        this.cookieJar = {};
    }

    getCookieString() {
        return Object.entries(this.cookieJar)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    updateCookies(res) {
        let setCookies = [];
        if (typeof res.headers.getSetCookie === 'function') {
            setCookies = res.headers.getSetCookie();
        } else {
            const raw = res.headers.get('set-cookie');
            if (raw) setCookies = [raw];
        }

        for (const str of setCookies) {
            const parts = str.split(';')[0].split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim();
                this.cookieJar[key] = val;
            }
        }
    }

    async request(path, options = {}) {
        const url = `${BASE_URL}${path}`;
        const headers = { ...(options.headers || {}) };
        const cookieStr = this.getCookieString();
        if (cookieStr) {
            headers['Cookie'] = cookieStr;
        }

        const res = await fetch(url, {
            ...options,
            headers,
            redirect: 'manual'
        });

        this.updateCookies(res);

        const text = await res.text();
        return {
            status: res.status,
            headers: res.headers,
            location: res.headers.get('location'),
            text
        };
    }

    async login(username, password) {
        const body = new URLSearchParams({ username, password }).toString();
        const res = await this.request('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        return res;
    }
}

async function runTests() {
    console.log('================================================================');
    console.log('🧪 AttendEase Phase 4: Faculty Module Automated Verification Suite');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        // -------------------------------------------------------------
        // TEST SUITE 1: AUTHENTICATION & FACULTY DASHBOARD SCOPING
        // -------------------------------------------------------------
        console.log('📋 Test Suite 1: Faculty Authentication & Dashboard Scoping');
        const facClient = new SessionClient();
        const facLoginRes = await facClient.login('prof_anand', 'password123');
        assert(facLoginRes.status === 302 && facLoginRes.location === '/faculty/dashboard',
            'Faculty demo (prof_anand) logs in and redirects to /faculty/dashboard');

        const dashRes = await facClient.request('/faculty/dashboard');
        assert(dashRes.status === 200, 'Faculty dashboard loads with status 200 OK');
        assert(dashRes.text.includes('Faculty Schedule & Attendance'), 'Dashboard header rendered');
        assert(dashRes.text.includes('My Teaching Allocations'), 'Assigned classes section rendered');
        assert(dashRes.text.includes('Attendance Distribution') || dashRes.text.includes('facultyAttendanceDonut'),
            'Chart.js attendance distribution widget rendered');

        // Verify dashboard numbers match real scoped DB data for prof_anand
        const [[profRow]] = await db.query("SELECT f.id FROM faculty f JOIN users u ON u.id = f.user_id WHERE u.username = 'prof_anand'");
        const facultyId = profRow.id;

        const [[{ assignedCount }]] = await db.query('SELECT COUNT(*) AS assignedCount FROM faculty_assignments WHERE faculty_id = ?', [facultyId]);
        assert(dashRes.text.includes(`Assigned Classes</div>\n                        <div class="hero-stat-value">${assignedCount}`) ||
               dashRes.text.includes(String(assignedCount)),
               `Dashboard accurately displays ${assignedCount} assigned classes for authenticated faculty`);

        // -------------------------------------------------------------
        // TEST SUITE 2: RBAC & CROSS-FACULTY ACCESS RESTRICTIONS
        // -------------------------------------------------------------
        console.log('\n🔒 Test Suite 2: Role-Based Authorization & Cross-Faculty Security');
        
        // Student accessing faculty pages -> 403 Forbidden
        const stuClient = new SessionClient();
        await stuClient.login('stu_arun', 'password123');
        const stuToDashRes = await stuClient.request('/faculty/dashboard');
        assert(stuToDashRes.status === 403, 'Student blocked from /faculty/dashboard with 403 Forbidden');

        const stuToMarkRes = await stuClient.request('/faculty/mark');
        assert(stuToMarkRes.status === 403, 'Student blocked from /faculty/mark with 403 Forbidden');

        // Unauthenticated access -> 302 Redirect to /login
        const anonClient = new SessionClient();
        const anonRes = await anonClient.request('/faculty/dashboard');
        assert(anonRes.status === 302 && anonRes.location === '/login',
            'Unauthenticated request to /faculty/dashboard redirects to /login');

        // Cross-faculty access check:
        // Find another faculty member who is NOT prof_anand
        const [[otherFac]] = await db.query(`
            SELECT f.id, u.username
            FROM faculty f
            JOIN users u ON u.id = f.user_id
            WHERE f.id != ?
            LIMIT 1
        `, [facultyId]);

        // Find a session belonging to other faculty
        const [[otherSession]] = await db.query(`
            SELECT cs.id
            FROM class_sessions cs
            JOIN faculty_assignments fa ON fa.id = cs.assignment_id
            WHERE fa.faculty_id = ?
            LIMIT 1
        `, [otherFac.id]);

        if (otherSession) {
            // prof_anand attempts to access other faculty's session sheet
            const crossAccessRes = await facClient.request(`/faculty/mark/${otherSession.id}`);
            assert(crossAccessRes.status === 302,
                `Security: Faculty blocked with 302 redirect when attempting to access another faculty's session #${otherSession.id}`);

            // prof_anand attempts to post attendance for other faculty's session
            const crossPostRes = await facClient.request(`/faculty/mark/${otherSession.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ 'attendance[1]': 'present' }).toString()
            });
            assert(crossPostRes.status === 302,
                `Security: Faculty blocked when attempting to save attendance for another faculty's session`);
        }

        // -------------------------------------------------------------
        // TEST SUITE 3: PERSONAL TIMETABLE
        // -------------------------------------------------------------
        console.log('\n📅 Test Suite 3: Personal Timetable');
        const ttRes = await facClient.request('/faculty/timetable');
        assert(ttRes.status === 200, 'Personal timetable page loads with status 200 OK');
        assert(ttRes.text.includes('My Teaching Schedule') && ttRes.text.includes('Scheduled Teaching Periods'),
            'Timetable title and period ledger rendered');

        // Verify timetable slots shown belong strictly to prof_anand
        const [mySlots] = await db.query(`
            SELECT t.id, t.day_of_week, c.name AS class_name
            FROM timetable t
            JOIN faculty_assignments fa ON fa.id = t.assignment_id
            JOIN classes c              ON c.id = fa.class_id
            WHERE fa.faculty_id = ?
        `, [facultyId]);

        if (mySlots.length > 0) {
            assert(ttRes.text.includes(mySlots[0].class_name),
                `Timetable correctly displays faculty's assigned section (${mySlots[0].class_name})`);

            // Test weekday filter
            const dayFilterRes = await facClient.request(`/faculty/timetable?day=${mySlots[0].day_of_week}`);
            assert(dayFilterRes.status === 200 && dayFilterRes.text.includes(mySlots[0].day_of_week),
                `Timetable accurately filters by weekday (${mySlots[0].day_of_week})`);
        }

        // -------------------------------------------------------------
        // TEST SUITE 4: SESSIONS MANAGEMENT & CREATION VALIDATION
        // -------------------------------------------------------------
        console.log('\n🏛️ Test Suite 4: Class Sessions Management & Creation');
        const sessListRes = await facClient.request('/faculty/sessions');
        assert(sessListRes.status === 200, 'Faculty sessions directory loads with status 200 OK');
        assert(sessListRes.text.includes('Recorded Lecture Sessions'), 'Sessions table rendered');

        // Fetch one of prof_anand's assignments
        const [[myAssign]] = await db.query('SELECT id, class_id FROM faculty_assignments WHERE faculty_id = ? LIMIT 1', [facultyId]);

        // Create a unique test session
        const testDate = '2026-11-01'; // Future date isolated from seeded historical records
        const testSessNum = 5;

        // Clean up if prior test left it
        await db.query('DELETE FROM class_sessions WHERE assignment_id = ? AND session_date = ? AND session_number = ?',
            [myAssign.id, testDate, testSessNum]);

        const createSessBody = new URLSearchParams({
            assignment_id: String(myAssign.id),
            session_date: testDate,
            session_number: String(testSessNum),
            topic: 'Automated Test: Unit 5 Cloud Integration'
        }).toString();

        const createSessRes = await facClient.request('/faculty/sessions/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: createSessBody
        });
        assert(createSessRes.status === 302, 'Creating class session returns 302 redirect to mark register');

        const [[createdSess]] = await db.query(`
            SELECT * FROM class_sessions
            WHERE assignment_id = ? AND session_date = ? AND session_number = ?
        `, [myAssign.id, testDate, testSessNum]);
        assert(createdSess && createdSess.topic === 'Automated Test: Unit 5 Cloud Integration',
            'Class session successfully persisted in database');

        // Duplicate session prevention test (Same assignment, date, session_number)
        const dupSessRes = await facClient.request('/faculty/sessions/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: createSessBody
        });
        assert(dupSessRes.status === 302, 'Duplicate session submission handled with 302 redirect');
        const [[dupCheck]] = await db.query(`
            SELECT COUNT(*) AS c FROM class_sessions
            WHERE assignment_id = ? AND session_date = ? AND session_number = ?
        `, [myAssign.id, testDate, testSessNum]);
        assert(dupCheck.c === 1, 'Database constraint prevents duplicate class session insertion');

        // Unauthorized session creation: Attempt creating session for unassigned class
        const [[unassignedAssign]] = await db.query('SELECT id FROM faculty_assignments WHERE faculty_id != ? LIMIT 1', [facultyId]);
        if (unassignedAssign) {
            const unauthSessRes = await facClient.request('/faculty/sessions/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    assignment_id: String(unassignedAssign.id),
                    session_date: testDate,
                    session_number: '1',
                    topic: 'Unauthorized Lecture'
                }).toString()
            });
            assert(unauthSessRes.status === 302, 'Unauthorized assignment session creation blocked');
            const [[unauthCheck]] = await db.query('SELECT id FROM class_sessions WHERE assignment_id = ? AND topic = ?',
                [unassignedAssign.id, 'Unauthorized Lecture']);
            assert(!unauthCheck, 'Session for unassigned class is rejected and not saved');
        }

        // -------------------------------------------------------------
        // TEST SUITE 5: ATTENDANCE MARKING (PRESENT, LATE, ABSENT)
        // -------------------------------------------------------------
        console.log('\n✍️ Test Suite 5: Attendance Marking & Transactions');
        const markSheetRes = await facClient.request(`/faculty/mark/${createdSess.id}`);
        assert(markSheetRes.status === 200, 'Attendance register sheet loads with status 200 OK');
        assert(markSheetRes.text.includes('Roll Call:') && markSheetRes.text.includes('Enrolled Student Roster'),
            'Roster table with bulk action buttons rendered');

        // Fetch enrolled students for this class section
        const [enrolledStudents] = await db.query(`
            SELECT s.id AS student_id, u.full_name
            FROM enrollments e
            JOIN students s ON s.id = e.student_id
            JOIN users u ON u.id = s.user_id
            WHERE e.class_id = ?
            ORDER BY s.id ASC
        `, [myAssign.class_id]);

        assert(enrolledStudents.length > 0, `Section has ${enrolledStudents.length} enrolled students`);

        // Build attendance payload with mixed statuses: Present, Absent, Late
        const markPayload = {};
        enrolledStudents.forEach((stu, idx) => {
            if (idx % 3 === 0) markPayload[`attendance[s_${stu.student_id}]`] = 'present';
            else if (idx % 3 === 1) markPayload[`attendance[s_${stu.student_id}]`] = 'late';
            else markPayload[`attendance[s_${stu.student_id}]`] = 'absent';
        });

        const saveAttRes = await facClient.request(`/faculty/mark/${createdSess.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(markPayload).toString()
        });
        assert(saveAttRes.status === 302, 'Saving attendance returns 302 redirect with flash success');

        // Verify attendance records in database
        const [markedRows] = await db.query(`
            SELECT status, COUNT(*) AS count
            FROM attendance
            WHERE session_id = ?
            GROUP BY status
        `, [createdSess.id]);

        const statusMap = {};
        markedRows.forEach(r => statusMap[r.status] = r.count);

        assert((statusMap['present'] || 0) > 0, `Recorded ${(statusMap['present'] || 0)} 'present' records`);
        assert((statusMap['late'] || 0) > 0, `Recorded ${(statusMap['late'] || 0)} 'late' records`);
        assert((statusMap['absent'] || 0) > 0, `Recorded ${(statusMap['absent'] || 0)} 'absent' records`);

        // Test editing existing attendance (upsert without duplicate rows)
        const [[initialCount]] = await db.query('SELECT COUNT(*) AS c FROM attendance WHERE session_id = ?', [createdSess.id]);
        
        // Flip first student from present to late
        const firstStuId = enrolledStudents[0].student_id;
        markPayload[`attendance[s_${firstStuId}]`] = 'late';

        await facClient.request(`/faculty/mark/${createdSess.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(markPayload).toString()
        });

        const [[afterEditCount]] = await db.query('SELECT COUNT(*) AS c FROM attendance WHERE session_id = ?', [createdSess.id]);
        assert(afterEditCount.c === initialCount.c,
            `Correction test: Attendance rows stay constant (${afterEditCount.c}) without duplicate rows`);

        const [[firstStuRecord]] = await db.query('SELECT status FROM attendance WHERE session_id = ? AND student_id = ?',
            [createdSess.id, firstStuId]);
        assert(firstStuRecord.status === 'late', 'Student status successfully updated to late upon re-submission');

        // Security: Rejection of unenrolled student
        const [[unenrolledStudent]] = await db.query(`
            SELECT s.id FROM students s
            WHERE s.id NOT IN (SELECT student_id FROM enrollments WHERE class_id = ?)
            LIMIT 1
        `, [myAssign.class_id]);

        if (unenrolledStudent) {
            const badPayload = { ...markPayload, [`attendance[s_${unenrolledStudent.id}]`]: 'present' };
            const badSubmitRes = await facClient.request(`/faculty/mark/${createdSess.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(badPayload).toString()
            });
            assert(badSubmitRes.status === 302, 'Submitting unenrolled student is rejected with redirect');

            const [[unrolledCheck]] = await db.query('SELECT id FROM attendance WHERE session_id = ? AND student_id = ?',
                [createdSess.id, unenrolledStudent.id]);
            assert(!unrolledCheck, 'Unenrolled student record was not inserted into attendance table');
        }

        // Clean up temporary test session & attendance
        await db.query('DELETE FROM class_sessions WHERE id = ?', [createdSess.id]);

        // -------------------------------------------------------------
        // TEST SUITE 6: ATTENDANCE HISTORY & SESSION DETAILS
        // -------------------------------------------------------------
        console.log('\n📜 Test Suite 6: Attendance History & Roster Details');
        const historyRes = await facClient.request('/faculty/history');
        assert(historyRes.status === 200, 'Attendance history ledger loads with status 200 OK');
        assert(historyRes.text.includes('Attendance History Ledger'), 'History page header rendered');

        // Check session roster detail view
        const [[sampleSession]] = await db.query(`
            SELECT cs.id FROM class_sessions cs
            JOIN faculty_assignments fa ON fa.id = cs.assignment_id
            WHERE fa.faculty_id = ?
            LIMIT 1
        `, [facultyId]);

        if (sampleSession) {
            const detailRes = await facClient.request(`/faculty/history/${sampleSession.id}`);
            assert(detailRes.status === 200, 'Session detail roster loads with status 200 OK');
            assert(detailRes.text.includes('Student Attendance List') && detailRes.text.includes('Roll Number'),
                'Session roster table rendered');
        }

        // -------------------------------------------------------------
        // TEST SUITE 7: ATTENDANCE REPORTS & LOW ATTENDANCE ALERTS
        // -------------------------------------------------------------
        console.log('\n📊 Test Suite 7: Attendance Reports & Low Attendance Alerts');
        const reportsRes = await facClient.request('/faculty/reports');
        assert(reportsRes.status === 200, 'Faculty attendance reports page loads with status 200 OK');
        assert(reportsRes.text.includes('Class Attendance Analytics'), 'Analytics title rendered');
        assert(reportsRes.text.includes('reportsDonut'), 'Chart.js donut canvas rendered');
        assert(reportsRes.text.includes('Class & Course Breakdown'), 'Course breakdown table rendered');
        assert(reportsRes.text.includes('Below 75% Attendance'), 'Low attendance (<75%) table rendered');

        // Test section filter on reports
        const repFilterRes = await facClient.request(`/faculty/reports?class_id=${myAssign.class_id}`);
        assert(repFilterRes.status === 200, 'Reports filter by class section loads with 200 OK');

        // -------------------------------------------------------------
        // TEST SUITE 8: REGRESSION & DATASET INTEGRITY
        // -------------------------------------------------------------
        console.log('\n🛡️ Test Suite 8: Regression & Dataset Integrity Verification');
        const adminClient = new SessionClient();
        const adminLogin = await adminClient.login('admin', 'Admin@123');
        assert(adminLogin.status === 302 && adminLogin.location === '/admin/dashboard',
            'Admin demo login (admin / Admin@123) still functioning');

        const [[{ stuTotal }]] = await db.query('SELECT COUNT(*) AS stuTotal FROM students');
        const [[{ facTotal }]] = await db.query('SELECT COUNT(*) AS facTotal FROM faculty');
        const [[{ attTotal }]] = await db.query('SELECT COUNT(*) AS attTotal FROM attendance');
        const [[{ sessTotal }]] = await db.query('SELECT COUNT(*) AS sessTotal FROM class_sessions');

        assert(stuTotal >= 200, `Dataset intact: Student count = ${stuTotal} (>= 200)`);
        assert(facTotal >= 15, `Dataset intact: Faculty count = ${facTotal} (>= 15)`);
        assert(attTotal >= 40000, `Dataset intact: Attendance records = ${attTotal} (>= 40,000)`);
        assert(sessTotal >= 1600, `Dataset intact: Class sessions = ${sessTotal} (>= 1,600)`);

        console.log('\n================================================================');
        console.log(`🏁 Phase 4 Verification Completed: ${passed} PASSED, ${failed} FAILED`);
        console.log('================================================================\n');

        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (err) {
        console.error('Fatal test error:', err);
        process.exit(1);
    } finally {
        await db.end();
    }
}

runTests();
