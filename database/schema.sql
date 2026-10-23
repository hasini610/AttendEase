-- ============================================================
-- AttendEase - Student Attendance Management System
-- Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS attendease;
USE attendease;

-- -------------------------------------------------------
-- 1. DEPARTMENTS
-- -------------------------------------------------------
CREATE TABLE departments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(20)  NOT NULL UNIQUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- 2. ACADEMIC YEARS
-- -------------------------------------------------------
CREATE TABLE academic_years (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    year_label  VARCHAR(20) NOT NULL,   -- e.g. "2024-2025"
    is_active   TINYINT(1) DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- 3. SEMESTERS
-- -------------------------------------------------------
CREATE TABLE semesters (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    academic_year_id INT NOT NULL,
    name             VARCHAR(50) NOT NULL,  -- e.g. "Semester 1"
    start_date       DATE,
    end_date         DATE,
    is_active        TINYINT(1) DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

-- -------------------------------------------------------
-- 4. USERS (Admin, Faculty, Student - all in one table)
-- -------------------------------------------------------
CREATE TABLE users (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(100) NOT NULL UNIQUE,
    email        VARCHAR(150) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,      -- bcrypt hash
    role         ENUM('admin','faculty','student') NOT NULL,
    full_name    VARCHAR(150) NOT NULL,
    phone        VARCHAR(20),
    is_active    TINYINT(1) DEFAULT 1,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------
-- 5. STUDENTS (extra profile linked to users table)
-- -------------------------------------------------------
CREATE TABLE students (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL UNIQUE,
    roll_number     VARCHAR(30) NOT NULL UNIQUE,
    department_id   INT NOT NULL,
    semester_id     INT,
    academic_year_id INT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)          REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (department_id)    REFERENCES departments(id),
    FOREIGN KEY (semester_id)      REFERENCES semesters(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
);

-- -------------------------------------------------------
-- 6. FACULTY (extra profile linked to users table)
-- -------------------------------------------------------
CREATE TABLE faculty (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL UNIQUE,
    employee_id   VARCHAR(30) NOT NULL UNIQUE,
    department_id INT NOT NULL,
    designation   VARCHAR(100),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- -------------------------------------------------------
-- 7. SUBJECTS
-- -------------------------------------------------------
CREATE TABLE subjects (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    code          VARCHAR(30)  NOT NULL UNIQUE,
    department_id INT NOT NULL,
    credits       INT DEFAULT 3,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- -------------------------------------------------------
-- 8. CLASSES (a section of students in a dept/semester)
-- -------------------------------------------------------
CREATE TABLE classes (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(50) NOT NULL,    -- e.g. "CS-A"
    department_id    INT NOT NULL,
    semester_id      INT NOT NULL,
    academic_year_id INT NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id)    REFERENCES departments(id),
    FOREIGN KEY (semester_id)      REFERENCES semesters(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
);

-- -------------------------------------------------------
-- 9. STUDENT ENROLLMENTS (student belongs to a class)
-- -------------------------------------------------------
CREATE TABLE enrollments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    class_id   INT NOT NULL,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_enrollment (student_id, class_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE CASCADE
);

-- -------------------------------------------------------
-- 10. FACULTY ASSIGNMENTS (faculty teaches subject in class)
-- -------------------------------------------------------
CREATE TABLE faculty_assignments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id  INT NOT NULL,
    subject_id  INT NOT NULL,
    class_id    INT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_assignment (faculty_id, subject_id, class_id),
    FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (class_id)   REFERENCES classes(id)
);

-- -------------------------------------------------------
-- 11. CLASS SESSIONS (one lecture = one session)
-- -------------------------------------------------------
CREATE TABLE class_sessions (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,   -- which faculty/subject/class combo
    session_date  DATE NOT NULL,
    session_number TINYINT DEFAULT 1,   -- 1 = 1st session of that day
    topic         VARCHAR(255),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_session (assignment_id, session_date, session_number),
    FOREIGN KEY (assignment_id) REFERENCES faculty_assignments(id) ON DELETE CASCADE
);

-- -------------------------------------------------------
-- 12. ATTENDANCE RECORDS (one row per student per session)
-- -------------------------------------------------------
CREATE TABLE attendance (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    session_id  INT NOT NULL,
    student_id  INT NOT NULL,
    status      ENUM('present','absent','late') NOT NULL DEFAULT 'absent',
    marked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- "Late" counts as present for the purpose of meeting the threshold
    -- (can be changed by adjusting attendance % logic in services/attendance.js)
    UNIQUE KEY uq_attendance (session_id, student_id),
    FOREIGN KEY (session_id)  REFERENCES class_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id)  REFERENCES students(id)       ON DELETE CASCADE
);

-- -------------------------------------------------------
-- 13. NOTIFICATIONS
-- -------------------------------------------------------
CREATE TABLE notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    message     TEXT NOT NULL,
    is_read     TINYINT(1) DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -------------------------------------------------------
-- 14. INDEXES for common query patterns
-- -------------------------------------------------------
CREATE INDEX idx_attendance_session   ON attendance (session_id);
CREATE INDEX idx_attendance_student   ON attendance (student_id);
CREATE INDEX idx_session_date         ON class_sessions (session_date);
CREATE INDEX idx_session_assignment   ON class_sessions (assignment_id);
