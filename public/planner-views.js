// ===== PLANNER VIEW SWITCHING (Today / Week / Calendar) =====
let currentPlannerView = 'today';
let calendarViewDate = new Date();

const switchPlannerView = (view) => {
  currentPlannerView = view;
  document.querySelectorAll('.view-toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.planner-view').forEach((v) => v.classList.remove('active'));

  const idMap = { today: 'plannerViewToday', week: 'plannerViewWeek', calendar: 'plannerViewCalendar' };
  document.getElementById(idMap[view]).classList.add('active');

  if (view === 'week') loadWeekView();
  if (view === 'calendar') renderCalendarView();
};

// ===== WEEK VIEW =====
const loadWeekView = async () => {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '<div class="ai-loading">Loading week…</div>';
  try {
    const weekly = await sessionsAPI.getWeekly();
    const todayAbbr = JS_DAY_TO_ABBR[new Date().getDay()];

    grid.innerHTML = DAY_ABBR_ORDER.map((day) => {
      const sessions = (weekly[day] || []).slice().sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      const chips = sessions.length
        ? sessions.map((s) => `
            <div class="week-session-chip priority-${s.priority || 'Medium'} ${s.completed ? 'completed' : ''}" title="${escHtml(s.subject)} — ${escHtml(s.timeSlot)}">
              ${escHtml(formatTime12(s.startTime))} · ${escHtml(s.subject)}
            </div>
          `).join('')
        : '<div class="week-day-empty">No sessions</div>';

      return `
        <div class="week-day-column">
          <div class="week-day-header ${day === todayAbbr ? 'is-today' : ''}">${day}</div>
          ${chips}
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = '<div class="ai-loading">Failed to load week view.</div>';
  }
};

// ===== CALENDAR VIEW =====
// Note: sessions in this app are weekly-recurring (tied to a weekday, not a
// specific calendar date), so this calendar shows which weekdays currently
// have at least one session scheduled, overlaid on a real month grid.
const calendarMonthDelta = (delta) => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
  renderCalendarView();
};

const renderCalendarView = async () => {
  const label = document.getElementById('calendarMonthLabel');
  const grid = document.getElementById('calendarGrid');
  label.textContent = calendarViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  let daysWithSessions = new Set();
  try {
    const weekly = await sessionsAPI.getWeekly();
    daysWithSessions = new Set(DAY_ABBR_ORDER.filter((d) => (weekly[d] || []).length > 0));
  } catch {
    // fall through with empty set
  }

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map((d) => `<div class="calendar-weekday-label">${d}</div>`).join('');

  const blanks = Array.from({ length: startOffset }, () => '<div class="calendar-cell empty"></div>').join('');

  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const cellDate = new Date(year, month, dayNum);
    const abbr = JS_DAY_TO_ABBR[cellDate.getDay()];
    const isToday = cellDate.toDateString() === today.toDateString();
    const hasSession = daysWithSessions.has(abbr);
    return `<div class="calendar-cell ${isToday ? 'today' : ''} ${hasSession ? 'has-session' : ''}">${dayNum}</div>`;
  }).join('');

  grid.innerHTML = weekdayLabels + blanks + cells;
};

// ===== HEATMAP LOADER FOR PLANNER TAB =====
const loadPlannerHeatmap = async () => {
  try {
    const analytics = await analyticsAPI.overview();
    renderHeatmap('plannerHeatmap', analytics.heatmap);
  } catch (err) {
    console.error('Failed to load planner heatmap', err);
  }
};
