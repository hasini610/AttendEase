// public/js/academic_schedule.js
// Reusable vanilla JavaScript Academic Week Schedule Widget component

function renderAcademicWeekSchedule(containerId, schedule = [], options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isFaculty = options.isFaculty !== undefined ? options.isFaculty : true;
    const today = new Date();

    function getMonday(d) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        date.setDate(diff);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    let currentMonday = getMonday(today);

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // Build the component HTML structure
    container.innerHTML = `
        <div class="academic-schedule-widget" id="aswWidgetRoot">
            <div class="asw-header">
                <h2 class="asw-title">
                    Academic Week <span class="asw-bullet">&bull;</span> <span id="aswDateRangeText">October 19 &ndash; 24, 2026</span>
                </h2>
                <div class="asw-nav">
                    <button type="button" class="asw-today-btn" id="aswBtnToday">Today</button>
                    <button type="button" class="asw-nav-btn" id="aswBtnPrev" title="Previous Week" aria-label="Previous Week">
                        <i class="bi bi-chevron-left"></i>
                    </button>
                    <button type="button" class="asw-nav-btn" id="aswBtnNext" title="Next Week" aria-label="Next Week">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            </div>

            <div class="asw-grid-wrapper">
                <div class="asw-grid">
                    <div class="asw-days-header">
                        <div class="asw-tz-col">GMT+5:30</div>
                        <div class="asw-day-col-head" data-day-index="0">
                            <span class="asw-day-num" id="aswDayNum0">19</span>
                            <span class="asw-day-name">Mon</span>
                        </div>
                        <div class="asw-day-col-head" data-day-index="1">
                            <span class="asw-day-num" id="aswDayNum1">20</span>
                            <span class="asw-day-name">Tue</span>
                        </div>
                        <div class="asw-day-col-head" data-day-index="2">
                            <span class="asw-day-num" id="aswDayNum2">21</span>
                            <span class="asw-day-name">Wed</span>
                        </div>
                        <div class="asw-day-col-head" data-day-index="3">
                            <span class="asw-day-num" id="aswDayNum3">22</span>
                            <span class="asw-day-name">Thu</span>
                        </div>
                        <div class="asw-day-col-head" data-day-index="4">
                            <span class="asw-day-num" id="aswDayNum4">23</span>
                            <span class="asw-day-name">Fri</span>
                        </div>
                        <div class="asw-day-col-head" data-day-index="5">
                            <span class="asw-day-num" id="aswDayNum5">24</span>
                            <span class="asw-day-name">Sat</span>
                        </div>
                    </div>

                    <div class="asw-body" id="aswBodyGrid">
                        <div class="asw-time-col">
                            <div class="asw-time-slot">8 Am</div>
                            <div class="asw-time-slot">9 Am</div>
                            <div class="asw-time-slot">10 Am</div>
                            <div class="asw-time-slot">11 Am</div>
                            <div class="asw-time-slot">12 Pm</div>
                            <div class="asw-time-slot">1 Pm</div>
                            <div class="asw-time-slot">2 Pm</div>
                            <div class="asw-time-slot">3 Pm</div>
                            <div class="asw-time-slot">4 Pm</div>
                        </div>

                        <div class="asw-day-col" data-col-day="Monday"></div>
                        <div class="asw-day-col" data-col-day="Tuesday"></div>
                        <div class="asw-day-col" data-col-day="Wednesday"></div>
                        <div class="asw-day-col" data-col-day="Thursday"></div>
                        <div class="asw-day-col" data-col-day="Friday"></div>
                        <div class="asw-day-col" data-col-day="Saturday"></div>

                        <div class="asw-now-line" id="aswNowLine" style="display: none;">
                            <div class="asw-now-dot"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Populate the 6 day columns
    const dayCols = container.querySelectorAll('.asw-day-col');
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let colorCounter = 0;

    dayCols.forEach((col, colIdx) => {
        const dayName = dayNames[colIdx];

        // Horizontal dashed lines
        for (let h = 0; h < 9; h++) {
            const line = document.createElement('div');
            line.className = 'asw-hour-line';
            line.style.top = `${h * 76}px`;
            col.appendChild(line);
        }

        // Filter events for this weekday
        const dayEvents = schedule.filter(s => s.day_of_week === dayName);
        dayEvents.forEach((slot, eIdx) => {
            const [sH, sM] = (slot.start_time || '08:00:00').split(':').map(Number);
            const [eH, eM] = (slot.end_time || '09:00:00').split(':').map(Number);

            const startFraction = (sH - 8) + (sM / 60);
            const endFraction = (eH - 8) + (eM / 60);
            const topPx = Math.max(0, startFraction * 76);
            const heightPx = Math.max(50, (endFraction - startFraction) * 76 - 8);

            colorCounter++;
            const isLime = (colorCounter % 3 === 0 || (colIdx === 3 && eIdx === 0) || (colIdx === 5 && eIdx === 0));
            const cardColorClass = isLime ? 'asw-card-lime' : 'asw-card-purple';

            const format12 = (h, m) => {
                const suff = h >= 12 ? 'PM' : 'AM';
                const hr = h % 12 || 12;
                const min = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
                return `${hr}${min} ${suff}`;
            };
            const timeStr = `${format12(sH, sM)} &ndash; ${format12(eH, eM)}`;

            const card = document.createElement('div');
            card.className = `asw-event-card ${cardColorClass}`;
            card.style.top = `${topPx}px`;
            card.style.height = `${heightPx}px`;
            card.title = `${slot.subject_name || ''} (${slot.subject_code || ''})`;

            const topDiv = document.createElement('div');
            const titleDiv = document.createElement('div');
            titleDiv.className = 'asw-event-title';
            if (isFaculty) {
                titleDiv.textContent = `${slot.class_name || ''} – ${slot.subject_code || ''}`;
            } else {
                titleDiv.textContent = `${slot.subject_code || ''} – ${slot.subject_name || ''}`;
            }

            const timeDiv = document.createElement('div');
            timeDiv.className = 'asw-event-time';
            timeDiv.innerHTML = timeStr;

            topDiv.appendChild(titleDiv);
            topDiv.appendChild(timeDiv);

            const metaDiv = document.createElement('div');
            metaDiv.className = 'asw-event-meta';
            if (isFaculty) {
                metaDiv.innerHTML = `<i class="bi bi-people-fill"></i> <span>${AttendEase.escapeHtml(slot.student_count || 45)}</span>`;
            } else {
                metaDiv.innerHTML = `<i class="bi bi-geo-alt-fill"></i> <span>${AttendEase.escapeHtml(slot.classroom || 'LH-1')}</span>`;
            }

            card.appendChild(topDiv);
            card.appendChild(metaDiv);
            col.appendChild(card);
        });
    });

    function updateCalendarView() {
        const mon = new Date(currentMonday);
        const sat = new Date(currentMonday);
        sat.setDate(mon.getDate() + 5);

        let rangeText = "";
        if (mon.getMonth() === sat.getMonth()) {
            rangeText = `${monthNames[mon.getMonth()]} ${mon.getDate()} \u2013 ${sat.getDate()}, ${mon.getFullYear()}`;
        } else {
            rangeText = `${monthNames[mon.getMonth()]} ${mon.getDate()} \u2013 ${monthNames[sat.getMonth()]} ${sat.getDate()}, ${sat.getFullYear()}`;
        }

        const rangeEl = document.getElementById('aswDateRangeText');
        if (rangeEl) rangeEl.textContent = rangeText;

        const todayDateStr = today.toDateString();
        for (let i = 0; i < 6; i++) {
            const dayDate = new Date(currentMonday);
            dayDate.setDate(mon.getDate() + i);

            const numEl = document.getElementById(`aswDayNum${i}`);
            if (numEl) numEl.textContent = dayDate.getDate();

            const headCol = container.querySelector(`.asw-day-col-head[data-day-index="${i}"]`);
            if (headCol) {
                if (dayDate.toDateString() === todayDateStr) {
                    headCol.classList.add('asw-today');
                } else {
                    headCol.classList.remove('asw-today');
                }
            }
        }

        updateCurrentTimeLine();
    }

    function updateCurrentTimeLine() {
        const line = document.getElementById('aswNowLine');
        if (!line) return;

        const now = new Date();
        const curMon = getMonday(now);

        if (curMon.toDateString() !== currentMonday.toDateString()) {
            line.style.display = 'none';
            return;
        }

        const hours = now.getHours();
        const mins = now.getMinutes();

        if (hours >= 8 && hours < 17) {
            const fraction = (hours - 8) + (mins / 60);
            const topPx = fraction * 76;
            line.style.top = `${topPx}px`;
            line.style.display = 'block';
        } else {
            const topPx = (10 - 8 + 15 / 60) * 76;
            line.style.top = `${topPx}px`;
            line.style.display = 'block';
        }
    }

    const btnToday = document.getElementById('aswBtnToday');
    const btnPrev = document.getElementById('aswBtnPrev');
    const btnNext = document.getElementById('aswBtnNext');

    if (btnToday) {
        btnToday.addEventListener('click', () => {
            currentMonday = getMonday(new Date());
            updateCalendarView();
        });
    }

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            currentMonday.setDate(currentMonday.getDate() - 7);
            updateCalendarView();
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            currentMonday.setDate(currentMonday.getDate() + 7);
            updateCalendarView();
        });
    }

    updateCalendarView();
}

window.renderAcademicWeekSchedule = renderAcademicWeekSchedule;
