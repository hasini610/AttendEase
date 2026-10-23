-- database/migration_timetable.sql
-- Adds the timetable table to support student and faculty weekly schedules

USE attendease;

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
);

CREATE INDEX idx_timetable_day ON timetable (day_of_week);
CREATE INDEX idx_timetable_classroom ON timetable (classroom, day_of_week, start_time);
