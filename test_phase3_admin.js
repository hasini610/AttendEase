// test_phase3_admin.js
// Comprehensive automated test suite for Phase 3: Admin Module

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
    console.log('🧪 AttendEase Phase 3: Admin Module Automated Verification Suite');
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
        // TEST SUITE 1: AUTHENTICATION & DEMO ACCOUNTS
        // -------------------------------------------------------------
        console.log('📋 Test Suite 1: Authentication & Demo Account Login');
        const adminClient = new SessionClient();
        const adminLoginRes = await adminClient.login('admin', 'Admin@123');
        assert(adminLoginRes.status === 302 && adminLoginRes.location === '/admin/dashboard', 'Admin login successful and redirects to /admin/dashboard');

        const facultyClient = new SessionClient();
        const facultyLoginRes = await facultyClient.login('prof_anand', 'password123');
        assert(facultyLoginRes.status === 302 && facultyLoginRes.location === '/faculty/dashboard', 'Faculty demo (prof_anand) login successful and redirects to /faculty/dashboard');

        const studentClient = new SessionClient();
        const studentLoginRes = await studentClient.login('stu_arun', 'password123');
        assert(studentLoginRes.status === 302 && studentLoginRes.location === '/student/dashboard', 'Student demo (stu_arun) login successful and redirects to /student/dashboard');

        // -------------------------------------------------------------
        // TEST SUITE 2: RBAC (ROLE-BASED ACCESS CONTROL) SECURITY
        // -------------------------------------------------------------
        console.log('\n🔒 Test Suite 2: Role-Based Authorization & Security');
        const anonClient = new SessionClient();
        const anonRes = await anonClient.request('/admin/dashboard');
        assert(anonRes.status === 302 && anonRes.location === '/login', 'Unauthenticated user redirected to /login when accessing admin page');

        const studentToAdminRes = await studentClient.request('/admin/dashboard');
        assert(studentToAdminRes.status === 403, 'Student blocked from admin dashboard with 403 Forbidden');

        const studentToStudentsRes = await studentClient.request('/admin/students');
        assert(studentToStudentsRes.status === 403, 'Student blocked from student CRUD with 403 Forbidden');

        const facultyToAdminRes = await facultyClient.request('/admin/dashboard');
        assert(facultyToAdminRes.status === 403, 'Faculty blocked from admin dashboard with 403 Forbidden');

        const facultyToDepartmentsRes = await facultyClient.request('/admin/departments');
        assert(facultyToDepartmentsRes.status === 403, 'Faculty blocked from department CRUD with 403 Forbidden');

        // -------------------------------------------------------------
        // TEST SUITE 3: ADMIN DASHBOARD REAL COUNTS
        // -------------------------------------------------------------
        console.log('\n📊 Test Suite 3: Admin Dashboard Statistics');
        const dashRes = await adminClient.request('/admin/dashboard');
        assert(dashRes.status === 200, 'Admin dashboard loads with status 200 OK');
        assert(dashRes.text.includes('Students') && dashRes.text.includes('Faculty') && dashRes.text.includes('Departments') && dashRes.text.includes('Sections') && dashRes.text.includes('Subjects'),
            'Admin dashboard renders all 5 entity stat cards');

        // Compare real DB counts with dashboard numbers
        const [[{ countStudents }]] = await db.query('SELECT COUNT(*) AS countStudents FROM students s JOIN users u ON u.id = s.user_id WHERE u.is_active = 1');
        const [[{ countFaculty }]] = await db.query('SELECT COUNT(*) AS countFaculty FROM faculty f JOIN users u ON u.id = f.user_id WHERE u.is_active = 1');
        const [[{ countDepts }]] = await db.query('SELECT COUNT(*) AS countDepts FROM departments');
        const [[{ countClasses }]] = await db.query('SELECT COUNT(*) AS countClasses FROM classes');
        const [[{ countSubjects }]] = await db.query('SELECT COUNT(*) AS countSubjects FROM subjects');

        assert(dashRes.text.includes(String(countStudents)), `Dashboard displays accurate active student count (${countStudents})`);
        assert(dashRes.text.includes(String(countFaculty)), `Dashboard displays accurate active faculty count (${countFaculty})`);
        assert(dashRes.text.includes(String(countDepts)), `Dashboard displays accurate departments count (${countDepts})`);
        assert(dashRes.text.includes(String(countClasses)), `Dashboard displays accurate classes/sections count (${countClasses})`);
        assert(dashRes.text.includes(String(countSubjects)), `Dashboard displays accurate subjects count (${countSubjects})`);

        // -------------------------------------------------------------
        // TEST SUITE 4: STUDENTS CRUD & PAGINATION
        // -------------------------------------------------------------
        console.log('\n🎓 Test Suite 4: Students Management (CRUD, Search, Paginate, Toggle, Safe Delete)');
        const studentsListRes = await adminClient.request('/admin/students?page=1');
        assert(studentsListRes.status === 200, 'Students list loads with status 200 OK');
        assert(studentsListRes.text.includes('Enrolled Students'), 'Students list displays table');

        // Search test
        const studentSearchRes = await adminClient.request('/admin/students?q=Arun');
        assert(studentSearchRes.status === 200 && studentSearchRes.text.includes('Arun'), 'Student search filters by name correctly');

        // Create student
        const testRoll = `TEST_STU_${Date.now().toString().slice(-5)}`;
        const testEmail = `test_${Date.now()}@test.edu`;
        const createStudentBody = new URLSearchParams({
            full_name: 'Test Student CRUD',
            roll_number: testRoll,
            email: testEmail,
            phone: '9876500001',
            department_id: '1',
            class_id: '1',
            password: 'password123'
        }).toString();

        const createStudentRes = await adminClient.request('/admin/students/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: createStudentBody
        });
        assert(createStudentRes.status === 302, 'Student creation returns 302 redirect');

        const [[createdStudent]] = await db.query('SELECT s.*, u.is_active FROM students s JOIN users u ON u.id = s.user_id WHERE s.roll_number = ?', [testRoll]);
        assert(createdStudent && createdStudent.roll_number === testRoll, 'New student verified in database');

        // Edit student
        const editStudentBody = new URLSearchParams({
            full_name: 'Test Student Renamed',
            roll_number: testRoll,
            email: `renamed_${testEmail}`,
            phone: '9876500002',
            department_id: '1',
            class_id: '1'
        }).toString();

        const editStudentRes = await adminClient.request(`/admin/students/${createdStudent.id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: editStudentBody
        });
        assert(editStudentRes.status === 302, 'Student update returns 302 redirect');

        const [[updatedStudent]] = await db.query('SELECT u.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [createdStudent.id]);
        assert(updatedStudent && updatedStudent.full_name === 'Test Student Renamed', 'Student edits persisted in database');

        // Toggle student status
        const toggleRes1 = await adminClient.request(`/admin/students/${createdStudent.id}/toggle`, { method: 'POST' });
        assert(toggleRes1.status === 302, 'Student status toggle returns 302 redirect');
        const [[toggledUser1]] = await db.query('SELECT u.is_active FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [createdStudent.id]);
        assert(toggledUser1.is_active === 0, 'Student deactivated successfully (is_active = 0)');

        const toggleRes2 = await adminClient.request(`/admin/students/${createdStudent.id}/toggle`, { method: 'POST' });
        const [[toggledUser2]] = await db.query('SELECT u.is_active FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [createdStudent.id]);
        assert(toggledUser2.is_active === 1, 'Student reactivated successfully (is_active = 1)');

        // Safe delete test student (0 attendance records) -> succeeds
        const deleteStudentRes = await adminClient.request(`/admin/students/${createdStudent.id}/delete`, { method: 'POST' });
        assert(deleteStudentRes.status === 302, 'Deleting unreferenced test student succeeds with 302 redirect');
        const [[deletedCheck]] = await db.query('SELECT id FROM students WHERE id = ?', [createdStudent.id]);
        assert(!deletedCheck, 'Unreferenced student safely removed from database');

        // Safe delete PROTECTED student (has attendance records) -> blocked!
        const [[protectedStudent]] = await db.query('SELECT s.id, u.full_name FROM students s JOIN users u ON u.id = s.user_id JOIN attendance a ON a.student_id = s.id LIMIT 1');
        await adminClient.request(`/admin/students/${protectedStudent.id}/delete`, { method: 'POST' });
        const [[stillExists]] = await db.query('SELECT id FROM students WHERE id = ?', [protectedStudent.id]);
        assert(stillExists && stillExists.id === protectedStudent.id, 'Foreign key safety: Student with attendance records is protected from deletion');

        // -------------------------------------------------------------
        // TEST SUITE 5: FACULTY CRUD & STATUS
        // -------------------------------------------------------------
        console.log('\n👩‍🏫 Test Suite 5: Faculty Management (CRUD, Search, Toggle, Safe Delete)');
        const facultyListRes = await adminClient.request('/admin/faculty');
        assert(facultyListRes.status === 200, 'Faculty directory loads with status 200 OK');

        // Search test
        const facultySearchRes = await adminClient.request('/admin/faculty?q=Dwight');
        assert(facultySearchRes.status === 200 && facultySearchRes.text.includes('Dwight Schrute'), 'Faculty search filters by name correctly');

        // Create faculty
        const testEmpId = `TEST_FAC_${Date.now().toString().slice(-4)}`;
        const testFacEmail = `prof_test_${Date.now()}@college.edu`;
        const createFacBody = new URLSearchParams({
            full_name: 'Professor Test Case',
            email: testFacEmail,
            phone: '9876543210',
            employee_id: testEmpId,
            department_id: '1',
            designation: 'Assistant Professor',
            password: 'password123'
        }).toString();

        const createFacRes = await adminClient.request('/admin/faculty/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: createFacBody
        });
        assert(createFacRes.status === 302, 'Faculty creation returns 302 redirect');

        const [[createdFaculty]] = await db.query('SELECT f.*, u.is_active FROM faculty f JOIN users u ON u.id = f.user_id WHERE f.employee_id = ?', [testEmpId]);
        assert(createdFaculty && createdFaculty.employee_id === testEmpId, 'New faculty verified in database');

        // Edit faculty
        const editFacBody = new URLSearchParams({
            full_name: 'Professor Test Case Ph.D',
            email: testFacEmail,
            phone: '9876543211',
            employee_id: testEmpId,
            department_id: '1',
            designation: 'Associate Professor'
        }).toString();
        const editFacRes = await adminClient.request(`/admin/faculty/${createdFaculty.id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: editFacBody
        });
        assert(editFacRes.status === 302, 'Faculty update returns 302 redirect');
        const [[updatedFaculty]] = await db.query('SELECT designation FROM faculty WHERE id = ?', [createdFaculty.id]);
        assert(updatedFaculty.designation === 'Associate Professor', 'Faculty designation update persisted in database');

        // Toggle faculty status
        await adminClient.request(`/admin/faculty/${createdFaculty.id}/toggle`, { method: 'POST' });
        const [[toggledFac1]] = await db.query('SELECT u.is_active FROM faculty f JOIN users u ON u.id = f.user_id WHERE f.id = ?', [createdFaculty.id]);
        assert(toggledFac1.is_active === 0, 'Faculty deactivated successfully (is_active = 0)');

        await adminClient.request(`/admin/faculty/${createdFaculty.id}/toggle`, { method: 'POST' });
        const [[toggledFac2]] = await db.query('SELECT u.is_active FROM faculty f JOIN users u ON u.id = f.user_id WHERE f.id = ?', [createdFaculty.id]);
        assert(toggledFac2.is_active === 1, 'Faculty reactivated successfully (is_active = 1)');

        // Delete test faculty (0 assignments) -> succeeds
        await adminClient.request(`/admin/faculty/${createdFaculty.id}/delete`, { method: 'POST' });
        const [[deletedFacCheck]] = await db.query('SELECT id FROM faculty WHERE id = ?', [createdFaculty.id]);
        assert(!deletedFacCheck, 'Unassigned test faculty safely removed from database');

        // Attempt deleting protected faculty (e.g. prof_anand)
        const [[protectedFaculty]] = await db.query('SELECT f.id, u.full_name FROM faculty f JOIN users u ON u.id = f.user_id JOIN faculty_assignments fa ON fa.faculty_id = f.id LIMIT 1');
        await adminClient.request(`/admin/faculty/${protectedFaculty.id}/delete`, { method: 'POST' });
        const [[stillFacExists]] = await db.query('SELECT id FROM faculty WHERE id = ?', [protectedFaculty.id]);
        assert(stillFacExists && stillFacExists.id === protectedFaculty.id, 'Foreign key safety: Assigned faculty member protected from deletion');

        // -------------------------------------------------------------
        // TEST SUITE 6: DEPARTMENTS CRUD
        // -------------------------------------------------------------
        console.log('\n🏢 Test Suite 6: Departments Management');
        const deptsListRes = await adminClient.request('/admin/departments');
        assert(deptsListRes.status === 200, 'Departments directory loads with status 200 OK');

        // Create department
        const testDeptCode = `T${Date.now().toString().slice(-3)}`;
        const createDeptBody = new URLSearchParams({
            name: 'Test Department Unit',
            code: testDeptCode
        }).toString();
        await adminClient.request('/admin/departments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: createDeptBody
        });
        const [[createdDept]] = await db.query('SELECT * FROM departments WHERE code = ?', [testDeptCode]);
        assert(createdDept && createdDept.code === testDeptCode, 'New department created in database');

        // Edit department
        const editDeptBody = new URLSearchParams({
            name: 'Updated Department Unit',
            code: testDeptCode
        }).toString();
        await adminClient.request(`/admin/departments/${createdDept.id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: editDeptBody
        });
        const [[updatedDept]] = await db.query('SELECT name FROM departments WHERE id = ?', [createdDept.id]);
        assert(updatedDept.name === 'Updated Department Unit', 'Department name update persisted in database');

        // Safe delete test department (0 students/faculty/subjects) -> succeeds
        await adminClient.request(`/admin/departments/${createdDept.id}/delete`, { method: 'POST' });
        const [[deletedDeptCheck]] = await db.query('SELECT id FROM departments WHERE id = ?', [createdDept.id]);
        assert(!deletedDeptCheck, 'Empty test department safely removed from database');

        // Safe delete protected department (e.g. CSE) -> blocked
        const [[cseDept]] = await db.query("SELECT id FROM departments WHERE code = 'CSE'");
        await adminClient.request(`/admin/departments/${cseDept.id}/delete`, { method: 'POST' });
        const [[cseCheck]] = await db.query('SELECT id FROM departments WHERE id = ?', [cseDept.id]);
        assert(cseCheck && cseCheck.id === cseDept.id, 'Foreign key safety: Department with enrolled students and faculty protected from deletion');

        // -------------------------------------------------------------
        // TEST SUITE 7: CLASSES & SECTIONS CRUD
        // -------------------------------------------------------------
        console.log('\n🏛️ Test Suite 7: Classes / Sections Management');
        const classesListRes = await adminClient.request('/admin/classes');
        assert(classesListRes.status === 200, 'Classes directory loads with status 200 OK');

        // Create class
        const testClassName = `SEC-T${Date.now().toString().slice(-3)}`;
        const createClassBody = new URLSearchParams({
            name: testClassName,
            department_id: '1',
            semester_id: '1',
            academic_year_id: '1'
        }).toString();
        await adminClient.request('/admin/classes/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: createClassBody
        });
        const [[createdClass]] = await db.query('SELECT * FROM classes WHERE name = ?', [testClassName]);
        assert(createdClass && createdClass.name === testClassName, 'New class section created in database');

        // Edit class
        const editClassName = `${testClassName}-REV`;
        const editClassBody = new URLSearchParams({
            name: editClassName,
            department_id: '1',
            semester_id: '1',
            academic_year_id: '1'
        }).toString();
        await adminClient.request(`/admin/classes/${createdClass.id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: editClassBody
        });
        const [[updatedClass]] = await db.query('SELECT name FROM classes WHERE id = ?', [createdClass.id]);
        assert(updatedClass.name === editClassName, 'Class details updated successfully in database');

        // Safe delete test class (0 students) -> succeeds
        await adminClient.request(`/admin/classes/${createdClass.id}/delete`, { method: 'POST' });
        const [[deletedClassCheck]] = await db.query('SELECT id FROM classes WHERE id = ?', [createdClass.id]);
        assert(!deletedClassCheck, 'Empty test class safely removed from database');

        // Safe delete protected class (CSE-A, has 25 students) -> blocked
        const [[protectedClass]] = await db.query("SELECT id FROM classes WHERE name = 'CSE-A'");
        await adminClient.request(`/admin/classes/${protectedClass.id}/delete`, { method: 'POST' });
        const [[protClassCheck]] = await db.query('SELECT id FROM classes WHERE id = ?', [protectedClass.id]);
        assert(protClassCheck && protClassCheck.id === protectedClass.id, 'Foreign key safety: Class with enrolled students protected from deletion');

        // -------------------------------------------------------------
        // TEST SUITE 8: SUBJECTS CRUD
        // -------------------------------------------------------------
        console.log('\n📚 Test Suite 8: Subjects / Course Curriculum Management');
        const subjectsListRes = await adminClient.request('/admin/subjects');
        assert(subjectsListRes.status === 200, 'Subjects directory loads with status 200 OK');

        // Create subject
        const testSubCode = `CS${Date.now().toString().slice(-4)}`;
        const createSubBody = new URLSearchParams({
            code: testSubCode,
            name: 'Introduction to Agentic Intelligence',
            department_id: '1',
            semester_id: '1',
            credits: '4'
        }).toString();
        await adminClient.request('/admin/subjects/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: createSubBody
        });
        const [[createdSub]] = await db.query('SELECT * FROM subjects WHERE code = ?', [testSubCode]);
        assert(createdSub && createdSub.code === testSubCode, 'New subject created in database');

        // Edit subject
        const editSubBody = new URLSearchParams({
            code: testSubCode,
            name: 'Advanced Agentic Intelligence',
            department_id: '1',
            semester_id: '1',
            credits: '5'
        }).toString();
        await adminClient.request(`/admin/subjects/${createdSub.id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: editSubBody
        });
        const [[updatedSub]] = await db.query('SELECT name, credits FROM subjects WHERE id = ?', [createdSub.id]);
        assert(updatedSub.name === 'Advanced Agentic Intelligence' && updatedSub.credits === 5, 'Subject update persisted in database');

        // Safe delete test subject (0 assignments) -> succeeds
        await adminClient.request(`/admin/subjects/${createdSub.id}/delete`, { method: 'POST' });
        const [[deletedSubCheck]] = await db.query('SELECT id FROM subjects WHERE id = ?', [createdSub.id]);
        assert(!deletedSubCheck, 'Unreferenced test subject safely removed from database');

        // Safe delete protected subject -> blocked
        const [[protectedSub]] = await db.query('SELECT s.id FROM subjects s JOIN faculty_assignments fa ON fa.subject_id = s.id LIMIT 1');
        await adminClient.request(`/admin/subjects/${protectedSub.id}/delete`, { method: 'POST' });
        const [[protSubCheck]] = await db.query('SELECT id FROM subjects WHERE id = ?', [protectedSub.id]);
        assert(protSubCheck && protSubCheck.id === protectedSub.id, 'Foreign key safety: Subject mapped to faculty assignments protected from deletion');

        // -------------------------------------------------------------
        // TEST SUITE 9: FACULTY TEACHING ASSIGNMENTS
        // -------------------------------------------------------------
        console.log('\n🧑‍🏫 Test Suite 9: Faculty Assignments');
        const assignmentsListRes = await adminClient.request('/admin/assignments');
        assert(assignmentsListRes.status === 200, 'Faculty assignments view loads with status 200 OK');
        assert(assignmentsListRes.text.includes('Active Teaching Allocations'), 'Assignments table rendered');

        // Create assignment for a new faculty and subject
        const [[facForAssign]] = await db.query('SELECT id FROM faculty LIMIT 1');
        const tempSubCode = `TMP${Date.now().toString().slice(-4)}`;
        const [tempSubRes] = await db.query("INSERT INTO subjects (code, name, department_id, credits) VALUES (?, 'Temporary Subject', 1, 3)", [tempSubCode]);
        const tempSubId = tempSubRes.insertId;

        const assignBody = new URLSearchParams({
            faculty_id: String(facForAssign.id),
            subject_id: String(tempSubId),
            class_id: '1'
        }).toString();

        await adminClient.request('/admin/assignments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: assignBody
        });

        const [[newAssign]] = await db.query('SELECT * FROM faculty_assignments WHERE faculty_id = ? AND subject_id = ?', [facForAssign.id, tempSubId]);
        assert(newAssign && newAssign.id, 'New faculty teaching assignment created');

        // Remove assignment (has 0 sessions) -> succeeds
        await adminClient.request(`/admin/assignments/${newAssign.id}/delete`, { method: 'POST' });
        const [[deletedAssignCheck]] = await db.query('SELECT id FROM faculty_assignments WHERE id = ?', [newAssign.id]);
        assert(!deletedAssignCheck, 'Unreferenced faculty assignment successfully deleted');

        // Clean up temp subject
        await db.query('DELETE FROM subjects WHERE id = ?', [tempSubId]);

        // Safe delete protected assignment (has class sessions) -> blocked
        const [[protectedAssign]] = await db.query('SELECT fa.id FROM faculty_assignments fa JOIN class_sessions cs ON cs.assignment_id = fa.id LIMIT 1');
        await adminClient.request(`/admin/assignments/${protectedAssign.id}/delete`, { method: 'POST' });
        const [[protAssignCheck]] = await db.query('SELECT id FROM faculty_assignments WHERE id = ?', [protectedAssign.id]);
        assert(protAssignCheck && protAssignCheck.id === protectedAssign.id, 'Foreign key safety: Faculty assignment with recorded sessions protected from deletion');

        // -------------------------------------------------------------
        // TEST SUITE 10: MASTER TIMETABLE VIEW
        // -------------------------------------------------------------
        console.log('\n📅 Test Suite 10: Master Timetable View');
        const timetableRes = await adminClient.request('/admin/timetable');
        assert(timetableRes.status === 200, 'Master timetable view loads with status 200 OK');
        assert(timetableRes.text.includes('Scheduled Class Slots'), 'Timetable displays scheduled periods');

        // Test section filter
        const [[firstClass]] = await db.query('SELECT id, name FROM classes LIMIT 1');
        const timetableClassFilterRes = await adminClient.request(`/admin/timetable?class_id=${firstClass.id}`);
        assert(timetableClassFilterRes.status === 200 && timetableClassFilterRes.text.includes(firstClass.name),
            `Timetable filters accurately by class section (${firstClass.name})`);

        // Test weekday filter
        const timetableDayFilterRes = await adminClient.request('/admin/timetable?day=Monday');
        assert(timetableDayFilterRes.status === 200 && timetableDayFilterRes.text.includes('Monday'),
            'Timetable filters accurately by weekday (Monday)');

        // -------------------------------------------------------------
        // TEST SUITE 11: DATA INTEGRITY CHECK
        // -------------------------------------------------------------
        console.log('\n🛡️ Test Suite 11: Dataset Integrity Verification');
        const [[{ stuCount }]] = await db.query('SELECT COUNT(*) AS stuCount FROM students');
        const [[{ facCount }]] = await db.query('SELECT COUNT(*) AS facCount FROM faculty');
        const [[{ attCount }]] = await db.query('SELECT COUNT(*) AS attCount FROM attendance');
        const [[{ ttCount }]] = await db.query('SELECT COUNT(*) AS ttCount FROM timetable');

        assert(stuCount >= 200, `Dataset intact: Student count = ${stuCount} (>= 200)`);
        assert(facCount >= 15, `Dataset intact: Faculty count = ${facCount} (>= 15)`);
        assert(attCount >= 40000, `Dataset intact: Attendance records = ${attCount} (>= 40,000)`);
        assert(ttCount === 160, `Dataset intact: Timetable slots = ${ttCount} (= 160)`);

        console.log('\n================================================================');
        console.log(`🏁 Phase 3 Verification Completed: ${passed} PASSED, ${failed} FAILED`);
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
