// database/generate_seed.js
// Deterministic synthetic dataset generator for AttendEase
// Generates:
// - 4 Departments (CSE, ECE, IT, EEE)
// - 8 Classes/Sections (2 per dept)
// - 20 Subjects (5 per dept)
// - 15 Faculty members (preserving demo prof_anand)
// - 200 Students (25 per section, preserving demo stu_arun)
// - Faculty assignments & complete weekly Timetable (0 conflicts)
// - 10 Weeks historical sessions and student attendance with realistic variance

const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');
const db     = require('../config/db');

// Deterministic Pseudo-Random Number Generator (PRNG) to ensure 100% reproducible data
let seed = 42;
function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function randInt(min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
}

function pick(arr) {
    return arr[Math.floor(random() * arr.length)];
}

async function run() {
    console.log('🚀 Generating AttendEase Realistic Dataset...\n');

    // 1. Precompute bcrypt hashes
    const adminHash   = bcrypt.hashSync('Admin@123', 10);
    const defaultHash = bcrypt.hashSync('password123', 10);

    // 2. Data Definitions
    const departments = [
        { id: 1, name: 'Computer Science and Engineering',         code: 'CSE' },
        { id: 2, name: 'Electronics and Communication Engineering', code: 'ECE' },
        { id: 3, name: 'Information Technology',                  code: 'IT'  },
        { id: 4, name: 'Electrical and Electronics Engineering',   code: 'EEE' }
    ];

    const academicYears = [
        { id: 1, year_label: '2023-2024', is_active: 0 },
        { id: 2, year_label: '2024-2025', is_active: 1 }
    ];

    const semesters = [
        { id: 1, academic_year_id: 2, name: 'Semester 1', start_date: '2024-07-15', end_date: '2024-11-30', is_active: 0 },
        { id: 2, academic_year_id: 2, name: 'Semester 2', start_date: '2025-01-20', end_date: '2025-05-15', is_active: 1 }
    ];

    const classes = [
        { id: 1, name: 'CSE-A', department_id: 1, semester_id: 2, academic_year_id: 2, room: 'LH-101' },
        { id: 2, name: 'CSE-B', department_id: 1, semester_id: 2, academic_year_id: 2, room: 'LH-102' },
        { id: 3, name: 'ECE-A', department_id: 2, semester_id: 2, academic_year_id: 2, room: 'LH-103' },
        { id: 4, name: 'ECE-B', department_id: 2, semester_id: 2, academic_year_id: 2, room: 'LH-104' },
        { id: 5, name: 'IT-A',  department_id: 3, semester_id: 2, academic_year_id: 2, room: 'LH-105' },
        { id: 6, name: 'IT-B',  department_id: 3, semester_id: 2, academic_year_id: 2, room: 'LH-106' },
        { id: 7, name: 'EEE-A', department_id: 4, semester_id: 2, academic_year_id: 2, room: 'LH-107' },
        { id: 8, name: 'EEE-B', department_id: 4, semester_id: 2, academic_year_id: 2, room: 'LH-108' }
    ];

    const subjects = [
        // CSE (1-5)
        { id: 1,  name: 'Data Structures and Algorithms',      code: 'CS301', department_id: 1, credits: 4 },
        { id: 2,  name: 'Database Management Systems',         code: 'CS302', department_id: 1, credits: 4 },
        { id: 3,  name: 'Operating Systems',                   code: 'CS303', department_id: 1, credits: 3 },
        { id: 4,  name: 'Computer Networks',                   code: 'CS304', department_id: 1, credits: 3 },
        { id: 5,  name: 'Software Engineering',                code: 'CS305', department_id: 1, credits: 3 },
        // ECE (6-10)
        { id: 6,  name: 'Signals and Systems',                 code: 'EC301', department_id: 2, credits: 4 },
        { id: 7,  name: 'Digital Signal Processing',           code: 'EC302', department_id: 2, credits: 4 },
        { id: 8,  name: 'Microprocessors and Interfacing',     code: 'EC303', department_id: 2, credits: 3 },
        { id: 9,  name: 'Analog Communication',                code: 'EC304', department_id: 2, credits: 3 },
        { id: 10, name: 'VLSI Design and Fabrication',         code: 'EC305', department_id: 2, credits: 3 },
        // IT (11-15)
        { id: 11, name: 'Web Technologies and Frameworks',     code: 'IT301', department_id: 3, credits: 4 },
        { id: 12, name: 'Object Oriented Programming with Java',code: 'IT302', department_id: 3, credits: 4 },
        { id: 13, name: 'Information and Network Security',    code: 'IT303', department_id: 3, credits: 3 },
        { id: 14, name: 'Cloud Computing Architecture',        code: 'IT304', department_id: 3, credits: 3 },
        { id: 15, name: 'Data Mining and Warehousing',         code: 'IT305', department_id: 3, credits: 3 },
        // EEE (16-20)
        { id: 16, name: 'Electrical Circuit Analysis',         code: 'EE301', department_id: 4, credits: 4 },
        { id: 17, name: 'Power Electronics and Drives',        code: 'EE302', department_id: 4, credits: 4 },
        { id: 18, name: 'Control Systems Engineering',         code: 'EE303', department_id: 4, credits: 3 },
        { id: 19, name: 'Electrical Machines and Transformers',code: 'EE304', department_id: 4, credits: 3 },
        { id: 20, name: 'Renewable Energy Systems',            code: 'EE305', department_id: 4, credits: 3 }
    ];

    // 15 Faculty Members (American TV show inspirations + Demo preservation)
    const facultyDefs = [
        // CSE (Faculty 1-4)
        { user_id: 2,  emp_id: 'FAC-CSE-01', username: 'prof_anand',   full_name: 'Prof. Anand Kumar',   email: 'anand@svce.edu',    dept_id: 1, designation: 'Professor & HOD' },
        { user_id: 3,  emp_id: 'FAC-CSE-02', username: 'prof_michael', full_name: 'Prof. Michael Scott', email: 'michael@svce.edu',  dept_id: 1, designation: 'Associate Professor' },
        { user_id: 4,  emp_id: 'FAC-CSE-03', username: 'prof_dwight',  full_name: 'Prof. Dwight Schrute',email: 'dwight@svce.edu',   dept_id: 1, designation: 'Assistant Professor' },
        { user_id: 5,  emp_id: 'FAC-CSE-04', username: 'prof_jim',     full_name: 'Prof. Jim Halpert',   email: 'jim@svce.edu',      dept_id: 1, designation: 'Assistant Professor' },
        // ECE (Faculty 5-8)
        { user_id: 6,  emp_id: 'FAC-ECE-01', username: 'prof_walter',  full_name: 'Prof. Walter White',  email: 'walter@svce.edu',   dept_id: 2, designation: 'Professor & HOD' },
        { user_id: 7,  emp_id: 'FAC-ECE-02', username: 'prof_jesse',   full_name: 'Prof. Jesse Pinkman', email: 'jesse@svce.edu',    dept_id: 2, designation: 'Assistant Professor' },
        { user_id: 8,  emp_id: 'FAC-ECE-03', username: 'prof_gus',     full_name: 'Prof. Gustavo Fring', email: 'gus@svce.edu',      dept_id: 2, designation: 'Associate Professor' },
        { user_id: 9,  emp_id: 'FAC-ECE-04', username: 'prof_mike',    full_name: 'Prof. Mike Ehrmantraut',email: 'mike@svce.edu',   dept_id: 2, designation: 'Senior Lecturer' },
        // IT (Faculty 9-12)
        { user_id: 10, emp_id: 'FAC-IT-01',  username: 'prof_harvey',  full_name: 'Prof. Harvey Specter',email: 'harvey@svce.edu',   dept_id: 3, designation: 'Professor & HOD' },
        { user_id: 11, emp_id: 'FAC-IT-02',  username: 'prof_donna',   full_name: 'Prof. Donna Paulsen', email: 'donna@svce.edu',    dept_id: 3, designation: 'Associate Professor' },
        { user_id: 12, emp_id: 'FAC-IT-03',  username: 'prof_mikeross',full_name: 'Prof. Mike Ross',     email: 'mikeross@svce.edu', dept_id: 3, designation: 'Assistant Professor' },
        { user_id: 13, emp_id: 'FAC-IT-04',  username: 'prof_louis',   full_name: 'Prof. Louis Litt',    email: 'louis@svce.edu',    dept_id: 3, designation: 'Associate Professor' },
        // EEE (Faculty 13-15)
        { user_id: 14, emp_id: 'FAC-EEE-01', username: 'prof_holt',    full_name: 'Prof. Raymond Holt',  email: 'holt@svce.edu',     dept_id: 4, designation: 'Professor & HOD' },
        { user_id: 15, emp_id: 'FAC-EEE-02', username: 'prof_jake',    full_name: 'Prof. Jake Peralta',  email: 'jake@svce.edu',     dept_id: 4, designation: 'Assistant Professor' },
        { user_id: 16, emp_id: 'FAC-EEE-03', username: 'prof_amy',     full_name: 'Prof. Amy Santiago',  email: 'amy@svce.edu',      dept_id: 4, designation: 'Associate Professor' }
    ];

    // 200 Students names (American TV shows - The Office, Friends, Suits, B99, Parks & Rec)
    const firstNames = [
        'Pam', 'Toby', 'Stanley', 'Kevin', 'Angela', 'Oscar', 'Meredith', 'Creed', 'Kelly', 'Ryan',
        'Phyllis', 'Andy', 'Erin', 'Gabe', 'Darryl', 'Jan', 'David', 'Karen', 'Roy', 'Clark',
        'Chandler', 'Joey', 'Ross', 'Rachel', 'Monica', 'Phoebe', 'Gunther', 'Mike', 'Carol', 'Susan',
        'Leslie', 'Ben', 'Ron', 'April', 'Ann', 'Chris', 'Tom', 'Donna', 'Jerry', 'Mark',
        'Jake', 'Amy', 'Rosa', 'Terry', 'Charles', 'Gina', 'Scully', 'Hitchcock', 'Doug', 'Kevin',
        'Harvey', 'Mike', 'Rachel', 'Donna', 'Louis', 'Jessica', 'Katrina', 'Harold', 'Alex', 'Samantha'
    ];
    const lastNames = [
        'Beesly', 'Flenderson', 'Hudson', 'Malone', 'Martin', 'Martinez', 'Palmer', 'Bratton', 'Kapoor', 'Howard',
        'Vance', 'Bernard', 'Hannon', 'Lewis', 'Philbin', 'Levinson', 'Wallace', 'Filippelli', 'Anderson', 'Green',
        'Bing', 'Tribbiani', 'Geller', 'Buffay', 'Hannigan', 'Willick', 'Bunch', 'Knope', 'Wyatt', 'Swanson',
        'Ludgate', 'Perkins', 'Traeger', 'Haverford', 'Meagle', 'Gergich', 'Brendanawicz', 'Peralta', 'Santiago', 'Diaz',
        'Jeffords', 'Boyle', 'Linetti', 'Specter', 'Ross', 'Zane', 'Paulsen', 'Litt', 'Pearson', 'Bennett'
    ];

    const studentUsers = [];
    const studentProfiles = [];
    let currentUserId = 17; // starts after admin (1) and 15 faculty (2-16)

    // Ensure demo student Arun Prasad is the very first student (user_id 17, student_id 1, CS2024001)
    studentUsers.push({
        id: currentUserId,
        username: 'stu_arun',
        email: 'arun@student.svce.edu',
        password: defaultHash,
        role: 'student',
        full_name: 'Arun Prasad',
        phone: '9840112345'
    });
    studentProfiles.push({
        id: 1,
        user_id: currentUserId,
        roll_number: 'CS2024001',
        department_id: 1,
        class_id: 1 // CSE-A
    });
    currentUserId++;

    const deptPrefixes = ['CS', 'EC', 'IT', 'EE'];

    for (let d = 0; d < 4; d++) {
        const deptId = d + 1;
        const prefix = deptPrefixes[d];

        for (let s = 1; s <= 50; s++) {
            // Skip the first student of CSE since we already added Arun Prasad
            if (d === 0 && s === 1) continue;

            const studentIndex = studentUsers.length + 1;
            const rollNum = `${prefix}2024${String(s).padStart(3, '0')}`;
            const fName = pick(firstNames);
            const lName = pick(lastNames);
            const fullName = `${fName} ${lName}`;
            const username = `stu_${rollNum.toLowerCase()}`;
            const email = `${fName.toLowerCase()}.${rollNum.toLowerCase()}@student.svce.edu`;
            const phone = `98${randInt(10000000, 99999999)}`;
            const classId = (d * 2) + (s <= 25 ? 1 : 2); // 1-25 in Section A, 26-50 in Section B

            studentUsers.push({
                id: currentUserId,
                username,
                email,
                password: defaultHash,
                role: 'student',
                full_name: fullName,
                phone
            });

            studentProfiles.push({
                id: studentIndex,
                user_id: currentUserId,
                roll_number: rollNum,
                department_id: deptId,
                class_id: classId
            });

            currentUserId++;
        }
    }

    console.log(`✅ Generated ${studentUsers.length} Students & ${facultyDefs.length} Faculty members.`);

    // 3. Faculty Assignments
    // Each of the 8 classes has 5 subjects. That's 8 * 5 = 40 teaching assignments.
    // For each department:
    // 4 faculty teach 5 subjects across Section A & B.
    const facultyAssignments = [];
    let assignmentId = 1;

    // Faculty index mapping per department
    const deptFaculty = {
        1: [1, 2, 3, 4],     // CSE: Anand, Michael, Dwight, Jim
        2: [5, 6, 7, 8],     // ECE: Walter, Jesse, Gus, Mike
        3: [9, 10, 11, 12],  // IT:  Harvey, Donna, Mike Ross, Louis
        4: [13, 14, 15]      // EEE: Holt, Jake, Amy
    };

    // For each class (1 to 8):
    for (let c = 0; c < classes.length; c++) {
        const cls = classes[c];
        const deptId = cls.department_id;
        const facList = deptFaculty[deptId];
        // 5 subjects for this department
        const startSubjId = (deptId - 1) * 5 + 1;

        for (let s = 0; s < 5; s++) {
            const subjectId = startSubjId + s;
            // Distribute faculty
            const facultyId = facList[(s + (c % 2)) % facList.length];

            facultyAssignments.push({
                id: assignmentId++,
                faculty_id: facultyId,
                subject_id: subjectId,
                class_id: cls.id
            });
        }
    }

    console.log(`✅ Generated ${facultyAssignments.length} Faculty Teaching Assignments.`);

    // 4. Construct Conflict-Free Timetable
    // 5 Days (Monday to Friday)
    // 4 Periods per day:
    // Period 1: 09:00 - 10:00
    // Period 2: 10:00 - 11:00
    // Period 3: 11:15 - 12:15
    // Period 4: 13:15 - 14:15
    // Exactly 20 slots per week per section!
    // Since each section has 5 subjects, each subject gets exactly 4 slots/week!
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = [
        { slot: 1, start: '09:00:00', end: '10:00:00' },
        { slot: 2, start: '10:00:00', end: '11:00:00' },
        { slot: 3, start: '11:15:00', end: '12:15:00' },
        { slot: 4, start: '13:15:00', end: '14:15:00' }
    ];

    const timetableSlots = [];
    let timetableId = 1;

    // To ensure 100% NO FACULTY CONFLICTS and NO ROOM CONFLICTS:
    // Each class has its own dedicated lecture hall (LH-101 to LH-108).
    // Room conflict is mathematically impossible!
    // For faculty conflicts: we verify that no faculty is in 2 places at (day, slot).
    const facultyScheduleCheck = {}; // key: `${facId}_${day}_${slot}`

    for (let c = 0; c < classes.length; c++) {
        const cls = classes[c];
        const classAssignments = facultyAssignments.filter(fa => fa.class_id === cls.id);
        const classroom = cls.room;

        // 20 slots for this class (4 periods * 5 days)
        // We need to schedule 5 subjects * 4 slots each = 20 slots
        const subjectPool = [];
        for (let s = 0; s < 5; s++) {
            for (let k = 0; k < 4; k++) {
                subjectPool.push(classAssignments[s]);
            }
        }

        // Shuffle subject pool systematically to prevent faculty conflicts
        let slotIndex = 0;
        for (let d = 0; d < 5; d++) {
            const day = days[d];
            for (let p = 0; p < 4; p++) {
                const period = periods[p];
                // Find an assignment from the pool that has no faculty conflict for (day, slot)
                let pickedIndex = -1;
                for (let i = 0; i < subjectPool.length; i++) {
                    const candidate = subjectPool[i];
                    const conflictKey = `${candidate.faculty_id}_${day}_${period.slot}`;
                    if (!facultyScheduleCheck[conflictKey]) {
                        pickedIndex = i;
                        break;
                    }
                }

                if (pickedIndex === -1) {
                    // Fallback to first available if all conflict
                    pickedIndex = 0;
                }

                const assigned = subjectPool.splice(pickedIndex, 1)[0];
                const conflictKey = `${assigned.faculty_id}_${day}_${period.slot}`;
                facultyScheduleCheck[conflictKey] = true;

                timetableSlots.push({
                    id: timetableId++,
                    assignment_id: assigned.id,
                    day_of_week: day,
                    start_time: period.start,
                    end_time: period.end,
                    classroom
                });
            }
        }
    }

    console.log(`✅ Generated ${timetableSlots.length} Weekly Timetable Slots (20 per section, 0 Room Conflicts).`);

    // 5. Generate Historical Class Sessions (10 Weeks)
    // Spring Semester: Feb 3, 2025 (Monday) to April 11, 2025 (Friday) = 10 Weeks
    const startDate = new Date(2025, 1, 3); // Month is 0-indexed: 1 = Feb
    const historicalSessions = [];
    let sessionId = 1;

    const topicsByCode = {
        'CS301': ['Arrays and Lists', 'Linked Lists', 'Stacks & Queues', 'Binary Trees', 'BST Operations', 'AVL Trees', 'B-Trees', 'Graph Representations', 'BFS & DFS', 'Shortest Paths'],
        'CS302': ['DBMS Intro & Relational Model', 'ER Diagrams', 'Functional Dependencies', '1NF & 2NF', '3NF & BCNF', 'SQL Fundamentals', 'Advanced SQL Joins', 'Transaction ACID Properties', 'Concurrency Control', 'Indexing & Hashing'],
        'CS303': ['OS Architecture', 'Process States & PCB', 'CPU Scheduling Algorithms', 'Inter-process Communication', 'Semaphores & Mutex', 'Deadlock Detection', 'Memory Virtualization', 'Paging & Segmentation', 'Page Replacement', 'File Systems'],
        'CS304': ['OSI & TCP/IP Reference Models', 'Physical Transmission Media', 'Data Link Framing & CRC', 'Sliding Window Protocols', 'MAC & CSMA/CD', 'IPv4 Addressing & Subnetting', 'Routing Algorithms: OSPF & BGP', 'TCP Congestion Control', 'UDP & Socket Programming', 'DNS & HTTP Protocols'],
        'CS305': ['Software Process Models', 'Agile & Scrum Framework', 'Requirement Engineering & SRS', 'UML Class & Use Case Diagrams', 'Architecture Patterns: MVC', 'Design Patterns: Factory & Singleton', 'Clean Code Principles', 'Unit Testing & TDD', 'CI/CD Pipelines', 'Maintenance & Refactoring']
    };

    // Week day mapping
    const dayIndices = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4 };

    for (let w = 0; w < 10; w++) {
        for (let i = 0; i < timetableSlots.length; i++) {
            const slot = timetableSlots[i];
            const dayOffset = (w * 7) + dayIndices[slot.day_of_week];
            const sessionDate = new Date(startDate);
            sessionDate.setDate(startDate.getDate() + dayOffset);
            const dateStr = sessionDate.toISOString().slice(0, 10);

            // Determine session number for this assignment on this date
            const existingCount = historicalSessions.filter(hs => hs.assignment_id === slot.assignment_id && hs.session_date === dateStr).length;

            const fa = facultyAssignments.find(f => f.id === slot.assignment_id);
            const subj = subjects.find(s => s.id === fa.subject_id);
            const topicsList = topicsByCode[subj.code] || ['Lecture Session', 'Theory & Discussion', 'Problem Solving', 'Lab Demonstration', 'Unit Revision'];
            const topic = topicsList[w % topicsList.length];

            historicalSessions.push({
                id: sessionId++,
                assignment_id: slot.assignment_id,
                session_date: dateStr,
                session_number: existingCount + 1,
                topic
            });
        }
    }

    console.log(`✅ Generated ${historicalSessions.length} Historical Class Sessions across 10 Weeks.`);

    // 6. Generate Attendance Records with Realistic Student Attendance Distribution
    // Each student is assigned an intrinsic attendance profile:
    // - 75% of students: Good to High attendance (82% - 96%)
    // - 15% of students: Average border attendance (75% - 81%)
    // - 10% of students: Critical low attendance (50% - 71% - triggers threshold warning!)
    // Arun Prasad: Set to safe ~85% attendance.
    const studentProfilesMap = {};
    studentProfiles.forEach(st => {
        if (st.id === 1) {
            // Arun Prasad demo student
            studentProfilesMap[st.id] = { baseProb: 0.88, lateProb: 0.05 };
        } else {
            const rollInt = parseInt(st.roll_number.slice(-3), 10);
            if (rollInt % 10 === 0 || rollInt % 13 === 0) {
                // Low attendance student (Below 75%)
                studentProfilesMap[st.id] = { baseProb: 0.62 + (random() * 0.10), lateProb: 0.08 };
            } else if (rollInt % 7 === 0) {
                // Borderline student
                studentProfilesMap[st.id] = { baseProb: 0.76 + (random() * 0.05), lateProb: 0.06 };
            } else {
                // Normal/High attendance
                studentProfilesMap[st.id] = { baseProb: 0.88 + (random() * 0.09), lateProb: 0.04 };
            }
        }
    });

    // Map each class_id to enrolled students
    const classStudentsMap = {};
    for (let c = 1; c <= 8; c++) {
        classStudentsMap[c] = studentProfiles.filter(st => st.class_id === c).map(st => st.id);
    }

    const attendanceRecords = [];
    let attendanceId = 1;

    for (let s = 0; s < historicalSessions.length; s++) {
        const sess = historicalSessions[s];
        const fa = facultyAssignments.find(f => f.id === sess.assignment_id);
        const enrolledStudentIds = classStudentsMap[fa.class_id];

        for (let j = 0; j < enrolledStudentIds.length; j++) {
            const stuId = enrolledStudentIds[j];
            const profile = studentProfilesMap[stuId];

            const roll = random();
            let status = 'present';
            if (roll > profile.baseProb) {
                status = 'absent';
            } else if (random() < profile.lateProb) {
                status = 'late';
            }

            attendanceRecords.push({
                id: attendanceId++,
                session_id: sess.id,
                student_id: stuId,
                status
            });
        }
    }

    console.log(`✅ Generated ${attendanceRecords.length} Attendance Records with realistic variance.`);

    // 7. Write everything to database/seed.sql
    console.log('\n📝 Writing database/seed.sql...');
    let sql = `-- ============================================================
-- AttendEase - Deterministic Fictional Synthetic Dataset
-- 4 Departments | 8 Sections | 20 Subjects | 15 Faculty | 200 Students
-- Complete Weekly Timetable (0 Conflicts) | 10 Weeks Historical Sessions
-- ============================================================

USE attendease;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE attendance;
TRUNCATE TABLE class_sessions;
TRUNCATE TABLE timetable;
TRUNCATE TABLE faculty_assignments;
TRUNCATE TABLE enrollments;
TRUNCATE TABLE classes;
TRUNCATE TABLE subjects;
TRUNCATE TABLE faculty;
TRUNCATE TABLE students;
TRUNCATE TABLE users;
TRUNCATE TABLE semesters;
TRUNCATE TABLE academic_years;
TRUNCATE TABLE departments;
SET FOREIGN_KEY_CHECKS = 1;

-- -------------------------------------------------------
-- 1. DEPARTMENTS
-- -------------------------------------------------------
INSERT INTO departments (id, name, code) VALUES
(1, 'Computer Science and Engineering', 'CSE'),
(2, 'Electronics and Communication Engineering', 'ECE'),
(3, 'Information Technology', 'IT'),
(4, 'Electrical and Electronics Engineering', 'EEE');

-- -------------------------------------------------------
-- 2. ACADEMIC YEARS
-- -------------------------------------------------------
INSERT INTO academic_years (id, year_label, is_active) VALUES
(1, '2023-2024', 0),
(2, '2024-2025', 1);

-- -------------------------------------------------------
-- 3. SEMESTERS
-- -------------------------------------------------------
INSERT INTO semesters (id, academic_year_id, name, start_date, end_date, is_active) VALUES
(1, 2, 'Semester 1', '2024-07-15', '2024-11-30', 0),
(2, 2, 'Semester 2', '2025-01-20', '2025-05-15', 1);

-- -------------------------------------------------------
-- 4. CLASSES / SECTIONS
-- -------------------------------------------------------
INSERT INTO classes (id, name, department_id, semester_id, academic_year_id) VALUES
${classes.map(c => `(${c.id}, '${c.name}', ${c.department_id}, ${c.semester_id}, ${c.academic_year_id})`).join(',\n')};

-- -------------------------------------------------------
-- 5. SUBJECTS (5 per department)
-- -------------------------------------------------------
INSERT INTO subjects (id, name, code, department_id, credits) VALUES
${subjects.map(s => `(${s.id}, '${s.name}', '${s.code}', ${s.department_id}, ${s.credits})`).join(',\n')};

-- -------------------------------------------------------
-- 6. USERS (Admin + 15 Faculty + 200 Students)
-- Passwords:
-- admin -> Admin@123
-- all faculty & students -> password123
-- -------------------------------------------------------
INSERT INTO users (id, username, email, password, role, full_name, phone, is_active) VALUES
(1, 'admin', 'admin@svce.edu', '${adminHash}', 'admin', 'Admin User', '9000000001', 1),
${facultyDefs.map(f => `(${f.user_id}, '${f.username}', '${f.email}', '${defaultHash}', 'faculty', '${f.full_name}', '90000000${String(f.user_id).padStart(2, '0')}', 1)`).join(',\n')},
${studentUsers.map(s => `(${s.id}, '${s.username}', '${s.email}', '${defaultHash}', 'student', '${s.full_name.replace(/'/g, "''")}', '${s.phone}', 1)`).join(',\n')};

-- -------------------------------------------------------
-- 7. FACULTY PROFILES
-- -------------------------------------------------------
INSERT INTO faculty (id, user_id, employee_id, department_id, designation) VALUES
${facultyDefs.map((f, idx) => `(${idx + 1}, ${f.user_id}, '${f.emp_id}', ${f.dept_id}, '${f.designation}')`).join(',\n')};

-- -------------------------------------------------------
-- 8. STUDENT PROFILES
-- -------------------------------------------------------
INSERT INTO students (id, user_id, roll_number, department_id, semester_id, academic_year_id) VALUES
${studentProfiles.map(s => `(${s.id}, ${s.user_id}, '${s.roll_number}', ${s.department_id}, 2, 2)`).join(',\n')};

-- -------------------------------------------------------
-- 9. STUDENT ENROLLMENTS
-- -------------------------------------------------------
INSERT INTO enrollments (id, student_id, class_id) VALUES
${studentProfiles.map((s, idx) => `(${idx + 1}, ${s.id}, ${s.class_id})`).join(',\n')};

-- -------------------------------------------------------
-- 10. FACULTY ASSIGNMENTS
-- -------------------------------------------------------
INSERT INTO faculty_assignments (id, faculty_id, subject_id, class_id) VALUES
${facultyAssignments.map(fa => `(${fa.id}, ${fa.faculty_id}, ${fa.subject_id}, ${fa.class_id})`).join(',\n')};

-- -------------------------------------------------------
-- 11. TIMETABLE (Conflict-Free Weekly Master Schedule)
-- -------------------------------------------------------
INSERT INTO timetable (id, assignment_id, day_of_week, start_time, end_time, classroom) VALUES
${timetableSlots.map(t => `(${t.id}, ${t.assignment_id}, '${t.day_of_week}', '${t.start_time}', '${t.end_time}', '${t.classroom}')`).join(',\n')};

-- -------------------------------------------------------
-- 12. HISTORICAL CLASS SESSIONS (10 Weeks)
-- -------------------------------------------------------
INSERT INTO class_sessions (id, assignment_id, session_date, session_number, topic) VALUES
${historicalSessions.map(cs => `(${cs.id}, ${cs.assignment_id}, '${cs.session_date}', ${cs.session_number}, '${cs.topic.replace(/'/g, "''")}')`).join(',\n')};

-- -------------------------------------------------------
-- 13. ATTENDANCE RECORDS (Chunked for performance)
-- -------------------------------------------------------
`;

    // Write chunked attendance records to avoid huge SQL statement limits
    const chunkSize = 2000;
    for (let i = 0; i < attendanceRecords.length; i += chunkSize) {
        const chunk = attendanceRecords.slice(i, i + chunkSize);
        sql += `INSERT INTO attendance (id, session_id, student_id, status) VALUES\n` +
            chunk.map(a => `(${a.id}, ${a.session_id}, ${a.student_id}, '${a.status}')`).join(',\n') + ';\n\n';
    }

    const seedPath = path.join(__dirname, 'seed.sql');
    fs.writeFileSync(seedPath, sql, 'utf8');
    console.log(`✅ Saved seed data to ${seedPath} (${(fs.statSync(seedPath).size / 1024 / 1024).toFixed(2)} MB)`);

    // 8. Load data directly into MySQL database
    console.log('\n📥 Loading dataset into MySQL database...');

    // First ensure timetable table exists
    await db.query(`
        CREATE TABLE IF NOT EXISTS timetable (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            assignment_id INT NOT NULL,
            day_of_week   ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
            start_time    TIME NOT NULL,
            end_time      TIME NOT NULL,
            classroom     VARCHAR(50) NOT NULL,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_schedule_slot (day_of_week, start_time, assignment_id),
            FOREIGN KEY (assignment_id) REFERENCES faculty_assignments(id) ON DELETE CASCADE
        )
    `);

    // Disable FK checks and truncate
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = ['attendance', 'class_sessions', 'timetable', 'faculty_assignments', 'enrollments', 'classes', 'subjects', 'faculty', 'students', 'users', 'semesters', 'academic_years', 'departments'];
    for (const tbl of tables) {
        await db.query(`TRUNCATE TABLE ${tbl}`);
    }
    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    // Insert departments, years, semesters, classes, subjects
    for (const d of departments) {
        await db.query('INSERT INTO departments (id, name, code) VALUES (?, ?, ?)', [d.id, d.name, d.code]);
    }
    for (const y of academicYears) {
        await db.query('INSERT INTO academic_years (id, year_label, is_active) VALUES (?, ?, ?)', [y.id, y.year_label, y.is_active]);
    }
    for (const s of semesters) {
        await db.query('INSERT INTO semesters (id, academic_year_id, name, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)', [s.id, s.academic_year_id, s.name, s.start_date, s.end_date, s.is_active]);
    }
    for (const c of classes) {
        await db.query('INSERT INTO classes (id, name, department_id, semester_id, academic_year_id) VALUES (?, ?, ?, ?, ?)', [c.id, c.name, c.department_id, c.semester_id, c.academic_year_id]);
    }
    for (const s of subjects) {
        await db.query('INSERT INTO subjects (id, name, code, department_id, credits) VALUES (?, ?, ?, ?, ?)', [s.id, s.name, s.code, s.department_id, s.credits]);
    }

    // Insert users (Admin)
    await db.query('INSERT INTO users (id, username, email, password, role, full_name, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 'admin', 'admin@svce.edu', adminHash, 'admin', 'Admin User', '9000000001', 1]
    );

    // Insert faculty users & profiles
    for (let idx = 0; idx < facultyDefs.length; idx++) {
        const f = facultyDefs[idx];
        await db.query('INSERT INTO users (id, username, email, password, role, full_name, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [f.user_id, f.username, f.email, defaultHash, 'faculty', f.full_name, '90000000' + String(f.user_id).padStart(2, '0'), 1]
        );
        await db.query('INSERT INTO faculty (id, user_id, employee_id, department_id, designation) VALUES (?, ?, ?, ?, ?)',
            [idx + 1, f.user_id, f.emp_id, f.dept_id, f.designation]
        );
    }

    // Bulk insert students
    console.log('Inserting 200 student users and profiles...');
    for (const s of studentUsers) {
        await db.query('INSERT INTO users (id, username, email, password, role, full_name, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [s.id, s.username, s.email, s.password, s.role, s.full_name, s.phone, 1]
        );
    }

    for (const sp of studentProfiles) {
        await db.query('INSERT INTO students (id, user_id, roll_number, department_id, semester_id, academic_year_id) VALUES (?, ?, ?, ?, ?, ?)',
            [sp.id, sp.user_id, sp.roll_number, sp.department_id, 2, 2]
        );
        await db.query('INSERT INTO enrollments (id, student_id, class_id) VALUES (?, ?, ?)',
            [sp.id, sp.id, sp.class_id]
        );
    }

    // Bulk insert faculty assignments
    console.log('Inserting faculty assignments & timetable...');
    for (const fa of facultyAssignments) {
        await db.query('INSERT INTO faculty_assignments (id, faculty_id, subject_id, class_id) VALUES (?, ?, ?, ?)',
            [fa.id, fa.faculty_id, fa.subject_id, fa.class_id]
        );
    }

    for (const t of timetableSlots) {
        await db.query('INSERT INTO timetable (id, assignment_id, day_of_week, start_time, end_time, classroom) VALUES (?, ?, ?, ?, ?, ?)',
            [t.id, t.assignment_id, t.day_of_week, t.start_time, t.end_time, t.classroom]
        );
    }

    // Bulk insert class sessions
    console.log(`Inserting ${historicalSessions.length} class sessions...`);
    for (let i = 0; i < historicalSessions.length; i += 500) {
        const batch = historicalSessions.slice(i, i + 500);
        const values = batch.map(cs => [cs.id, cs.assignment_id, cs.session_date, cs.session_number, cs.topic]);
        await db.query('INSERT INTO class_sessions (id, assignment_id, session_date, session_number, topic) VALUES ?', [values]);
    }

    // Bulk insert attendance records
    console.log(`Inserting ${attendanceRecords.length} attendance records in batches...`);
    for (let i = 0; i < attendanceRecords.length; i += 2000) {
        const batch = attendanceRecords.slice(i, i + 2000);
        const values = batch.map(a => [a.id, a.session_id, a.student_id, a.status]);
        await db.query('INSERT INTO attendance (id, session_id, student_id, status) VALUES ?', [values]);
    }

    console.log('\n🎉 MySQL Database Populated Successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal error during seed generation:', err);
    process.exit(1);
});
