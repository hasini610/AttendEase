# AttendEase — Student Attendance Management System

> **Geethanjali College of Engineering and Technology**
> A full-stack web application for managing student attendance across departments, classes, and subjects.

---

## 🚀 Features

### Admin Module
- Dashboard with live stats: attendance rate, active sessions, low-attendance alerts
- Interactive calendar with academic week navigation
- CRUD management for Students, Faculty, Departments, Classes (Sections), Subjects
- Faculty teaching assignments per section/subject
- Master timetable viewer (filter by class or day)
- Analytics & Reports: department-wise, section-wise, subject-wise attendance breakdowns
- Low-attendance alerts (students below configurable threshold)
- CSV export of detailed attendance records

### Faculty Module
- Interactive **Academic Week Class Schedule** widget (Mon–Sat hour grid, colored session pills, real-time indicator)
- Dashboard with today's schedule and recent sessions
- Mark/correct attendance (Present / Absent / Late) with student roster
- Session history and detailed roster per session
- Subject-wise attendance reports with Chart.js donut charts
- Low-attendance student alerts per subject
- CSV export of attendance per subject

### Student Module
- Interactive **Academic Week Class Schedule** widget (enrolled section timetable)
- Dashboard with personal attendance summary and donut chart
- Subject-wise attendance breakdown with progress bars
- Full attendance history (filterable by subject and status)
- Weekly timetable view
- Profile management with `@gcet.edu.in` email and password change

### Security
- Role-Based Access Control (Admin / Faculty / Student)
- Session-based authentication with MySQL persistent store
- Cross-role access forbidden (403) — no parameter spoofing
- CSRF mitigation via `sameSite: lax` cookies
- Passwords hashed with bcrypt

---

## 🛠️ Tech Stack

| Layer        | Technology                                          |
|--------------|-----------------------------------------------------|
| Runtime      | Node.js                                             |
| Framework    | Express.js                                          |
| Templating   | EJS                                                 |
| Database     | MySQL 8+ (via mysql2)                               |
| Sessions     | express-session + express-mysql-session             |
| Auth         | bcrypt                                              |
| UI           | Bootstrap 5, Bootstrap Icons                        |
| Charts       | Chart.js                                            |
| Misc         | connect-flash, method-override, dotenv              |

---

## 📋 Prerequisites

- Node.js v18+
- MySQL 8.0+
- npm v9+

---

## ⚡ Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/attendease.git
cd attendease
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your MySQL credentials:

```
PORT=3000
SESSION_SECRET=change_me_to_a_long_random_string
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=attendease
ATTENDANCE_THRESHOLD=75
```

### 4. Set up the database

```bash
mysql -u root -p attendease < database/schema.sql
mysql -u root -p attendease < database/seed.sql
```

### 5. Start the server

```bash
npm start
```

Open http://localhost:3000 in your browser.

---

## 🔑 Demo Accounts

| Role    | Username     | Password     | Default Email        |
|---------|--------------|--------------|----------------------|
| Admin   | admin        | Admin@123    | admin@gcet.edu.in    |
| Faculty | prof_anand   | password123  | anand@gcet.edu.in    |
| Student | stu_arun     | password123  | arun@gcet.edu.in     |

---

## 📁 Project Structure

```
attendease/
├── app.js                      # Express entry point
├── config/db.js                # MySQL connection pool
├── controllers/                # Business logic per module
├── middleware/auth.js          # RBAC guards
├── routes/                     # Express route definitions
├── views/                      # EJS templates (admin, faculty, student, partials)
├── public/css/style.css        # Custom styles
├── database/                   # SQL schema and seed files
├── test_phase3_admin.js        # Admin tests (66)
├── test_phase4_faculty.js      # Faculty tests (49)
├── test_phase5_student.js      # Student tests (59)
├── test_phase6_reports.js      # Reports tests (59)
├── .env.example                # Environment template
└── package.json
```

---

## 🧪 Running Tests

```bash
node test_phase3_admin.js     # 66 tests
node test_phase4_faculty.js   # 49 tests
node test_phase5_student.js   # 59 tests
node test_phase6_reports.js   # 59 tests
```

Total: 233 tests — all passing.

---

## 🗄️ Database Overview

| Entity             | Count  |
|--------------------|--------|
| Students           | 200    |
| Faculty            | 15     |
| Departments        | 4      |
| Classes/Sections   | 8      |
| Subjects           | 20     |
| Timetable Slots    | 160    |
| Class Sessions     | 1,600  |
| Attendance Records | 40,000 |

---

## 🔒 Security Notes

- Never commit `.env` — it is in `.gitignore`
- Change `SESSION_SECRET` before deploying
- Set `NODE_ENV=production` for HTTPS-only secure cookies

---

## 📄 License

MIT License.
