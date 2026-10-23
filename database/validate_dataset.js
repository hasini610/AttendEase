// database/validate_dataset.js
// Exhaustive validation suite for AttendEase synthetic dataset

const bcrypt = require('bcryptjs');
const db     = require('../config/db');

async function validate() {
    console.log('====================================================');
    console.log('   AttendEase Dataset Verification & Quality Audit  ');
    console.log('====================================================\n');

    let totalChecks = 0;
    let passedChecks = 0;

    function report(testName, passed, details = '') {
        totalChecks++;
        if (passed) {
            passedChecks++;
            console.log(`✅ [PASS] ${testName} ${details ? '(' + details + ')' : ''}`);
        } else {
            console.error(`❌ [FAIL] ${testName} - ${details}`);
        }
    }

    try {
        // --- 1. RECORD COUNTS ---
        const [[deptCount]]    = await db.query('SELECT COUNT(*) AS c FROM departments');
        const [[classCount]]   = await db.query('SELECT COUNT(*) AS c FROM classes');
        const [[subjCount]]    = await db.query('SELECT COUNT(*) AS c FROM subjects');
        const [[facCount]]     = await db.query('SELECT COUNT(*) AS c FROM faculty');
        const [[stuCount]]     = await db.query('SELECT COUNT(*) AS c FROM students');
        const [[enrollCount]]  = await db.query('SELECT COUNT(*) AS c FROM enrollments');
        const [[assignCount]]  = await db.query('SELECT COUNT(*) AS c FROM faculty_assignments');
        const [[timeCount]]    = await db.query('SELECT COUNT(*) AS c FROM timetable');
        const [[sessionCount]] = await db.query('SELECT COUNT(*) AS c FROM class_sessions');
        const [[attCount]]     = await db.query('SELECT COUNT(*) AS c FROM attendance');

        report('Departments Count = 4', deptCount.c === 4, `found ${deptCount.c}`);
        report('Classes/Sections Count = 8', classCount.c === 8, `found ${classCount.c}`);
        report('Subjects Count = 20', subjCount.c === 20, `found ${subjCount.c}`);
        report('Faculty Count = 15', facCount.c === 15, `found ${facCount.c}`);
        report('Students Count = 200', stuCount.c === 200, `found ${stuCount.c}`);
        report('Enrollments Count = 200', enrollCount.c === 200, `found ${enrollCount.c}`);
        report('Faculty Assignments = 40 (5 per section)', assignCount.c === 40, `found ${assignCount.c}`);
        report('Timetable Slots = 160 (20 per section)', timeCount.c === 160, `found ${timeCount.c}`);
        report('Historical Sessions = 1600 (10 weeks)', sessionCount.c === 1600, `found ${sessionCount.c}`);
        report('Attendance Records = 40000', attCount.c === 40000, `found ${attCount.c}`);

        // --- 2. DEPARTMENTAL INTEGRITY ---
        const [deptCodes] = await db.query('SELECT code FROM departments ORDER BY code');
        const codesStr = deptCodes.map(d => d.code).join(',');
        report('Departments match CSE, ECE, EEE, IT', codesStr === 'CSE,ECE,EEE,IT', codesStr);

        // --- 3. SECTION BALANCE (25 students per section) ---
        const [sectionEnrollments] = await db.query(`
            SELECT c.name, COUNT(e.student_id) AS cnt
            FROM classes c
            LEFT JOIN enrollments e ON e.class_id = c.id
            GROUP BY c.id
        `);
        const all25 = sectionEnrollments.every(s => s.cnt === 25);
        report('Each of the 8 sections has exactly 25 students', all25, sectionEnrollments.map(s => `${s.name}: ${s.cnt}`).join(', '));

        // --- 4. TIMETABLE CONFLICT CHECKS ---
        // 4a. Faculty Conflict: Is any faculty member scheduled twice at the same (day, start_time)?
        const [facConflicts] = await db.query(`
            SELECT fa.faculty_id, t.day_of_week, t.start_time, COUNT(*) AS clash_count
            FROM timetable t
            JOIN faculty_assignments fa ON fa.id = t.assignment_id
            GROUP BY fa.faculty_id, t.day_of_week, t.start_time
            HAVING clash_count > 1
        `);
        report('Zero Faculty Timetable Time Conflicts', facConflicts.length === 0, `${facConflicts.length} clashes found`);

        // 4b. Classroom Conflict: Is any classroom scheduled twice at the same (day, start_time)?
        const [roomConflicts] = await db.query(`
            SELECT t.classroom, t.day_of_week, t.start_time, COUNT(*) AS clash_count
            FROM timetable t
            GROUP BY t.classroom, t.day_of_week, t.start_time
            HAVING clash_count > 1
        `);
        report('Zero Classroom Timetable Time Conflicts', roomConflicts.length === 0, `${roomConflicts.length} clashes found`);

        // 4c. Section Conflict: Is any class scheduled twice at the same (day, start_time)?
        const [sectionConflicts] = await db.query(`
            SELECT fa.class_id, t.day_of_week, t.start_time, COUNT(*) AS clash_count
            FROM timetable t
            JOIN faculty_assignments fa ON fa.id = t.assignment_id
            GROUP BY fa.class_id, t.day_of_week, t.start_time
            HAVING clash_count > 1
        `);
        report('Zero Section Timetable Time Conflicts', sectionConflicts.length === 0, `${sectionConflicts.length} clashes found`);

        // --- 5. ATTENDANCE & ENROLLMENT CONSISTENCY ---
        // Verify that every student marked in attendance is actually enrolled in the class of that session
        const [mismatchRows] = await db.query(`
            SELECT a.id
            FROM attendance a
            JOIN class_sessions cs ON cs.id = a.session_id
            JOIN faculty_assignments fa ON fa.id = cs.assignment_id
            LEFT JOIN enrollments e ON e.student_id = a.student_id AND e.class_id = fa.class_id
            WHERE e.id IS NULL
            LIMIT 5
        `);
        report('All attendance records reference enrolled students for that section', mismatchRows.length === 0, `${mismatchRows.length} mismatches`);

        // Verify no duplicate attendance records for same student & session
        const [dupAtt] = await db.query(`
            SELECT session_id, student_id, COUNT(*) AS cnt
            FROM attendance
            GROUP BY session_id, student_id
            HAVING cnt > 1
        `);
        report('Zero Duplicate Attendance Records', dupAtt.length === 0, `${dupAtt.length} duplicates`);

        // --- 6. ATTENDANCE STATUS DISTRIBUTION & THRESHOLD ---
        const [statusRows] = await db.query(`
            SELECT status, COUNT(*) AS cnt, ROUND(COUNT(*) * 100.0 / 40000, 1) AS pct
            FROM attendance
            GROUP BY status
        `);
        console.log('\n📊 Attendance Status Distribution:');
        console.table(statusRows);

        // Check students below 75% threshold
        const [lowAttStudents] = await db.query(`
            SELECT s.id, u.full_name, s.roll_number,
                   COUNT(a.id) AS total_sessions,
                   SUM(a.status IN ('present','late')) AS attended,
                   ROUND(SUM(a.status IN ('present','late')) * 100.0 / COUNT(a.id), 1) AS pct
            FROM students s
            JOIN users u ON u.id = s.user_id
            JOIN attendance a ON a.student_id = s.id
            GROUP BY s.id
            HAVING pct < 75.0
            ORDER BY pct ASC
        `);
        report('Realistic variation: Students below 75% threshold exists', lowAttStudents.length >= 10 && lowAttStudents.length <= 40, `${lowAttStudents.length} students below threshold`);

        // --- 7. DEMO LOGIN ACCOUNTS PRESERVATION ---
        const [[adminUser]] = await db.query('SELECT * FROM users WHERE username = "admin"');
        const adminPassMatch = adminUser ? bcrypt.compareSync('Admin@123', adminUser.password) : false;
        report('Demo Admin account (admin / Admin@123) preserved & working', adminUser && adminPassMatch, `role: ${adminUser ? adminUser.role : 'none'}`);

        const [[anandUser]] = await db.query('SELECT * FROM users WHERE username = "prof_anand"');
        const anandPassMatch = anandUser ? bcrypt.compareSync('password123', anandUser.password) : false;
        report('Demo Faculty account (prof_anand / password123) preserved & working', anandUser && anandPassMatch, `role: ${anandUser ? anandUser.role : 'none'}`);

        const [[arunUser]] = await db.query('SELECT * FROM users WHERE username = "stu_arun"');
        const arunPassMatch = arunUser ? bcrypt.compareSync('password123', arunUser.password) : false;
        report('Demo Student account (stu_arun / password123) preserved & working', arunUser && arunPassMatch, `role: ${arunUser ? arunUser.role : 'none'}`);

        // Check Arun Prasad attendance rate
        const [[arunAtt]] = await db.query(`
            SELECT COUNT(a.id) AS total,
                   SUM(a.status IN ('present','late')) AS attended,
                   ROUND(SUM(a.status IN ('present','late')) * 100.0 / COUNT(a.id), 1) AS pct
            FROM students s
            JOIN attendance a ON a.student_id = s.id
            WHERE s.roll_number = 'CS2024001'
        `);
        report('Demo Student stu_arun has realistic healthy attendance record', arunAtt && arunAtt.pct >= 80, `${arunAtt.attended}/${arunAtt.total} (${arunAtt.pct}%)`);

        console.log(`\n====================================================`);
        console.log(`Summary: ${passedChecks}/${totalChecks} Verification Tests Passed (${Math.round((passedChecks/totalChecks)*100)}%)`);
        console.log(`====================================================\n`);

        if (passedChecks === totalChecks) {
            console.log('🎉 Dataset validation completed with 100% success! All requirements met.');
            process.exit(0);
        } else {
            process.exit(1);
        }

    } catch (err) {
        console.error('Validation error:', err);
        process.exit(1);
    }
}

validate();
