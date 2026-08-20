// ===== STATE =====
let currentDay = 'Mon';
let currentSessions = [];
let selectedPriority = 'Medium';

const DAY_ABBR_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const JS_DAY_TO_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ===== DOM HELPERS =====
const $ = (id) => document.getElementById(id);
const showPage = (pageId) => {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $(pageId).classList.add('active');
};

const escHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ===== TOAST =====
const toast = (msg, type = 'info') => {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.remove('show'), 3200);
};

// ===== LANDING PAGE SECTION SCROLL =====
const switchLandingSection = (e, sectionId) => {
  if (e && e.preventDefault) e.preventDefault();
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ===== LANDING PAGE: "HOW STUDYFLOW AI WORKS" INTERACTIVE LOOP =====
// Plan -> Study -> Track -> Test -> Analyze -> Improve -> (Plan again).
// This is the core product philosophy - see the hero quote and the
// dashboard's "Improvement Loop" widget, which reuses the same LOOP_STEPS.
const LOOP_STEPS = {
  plan: {
    icon: '🎯',
    title: 'PLAN — Create your target',
    body: 'Set a daily or weekly study goal for a subject or exam. StudyFlow AI turns it into a realistic weekly timeline instead of a vague to-do list.',
    example: 'Example: "40 minutes of DBMS, 6:00–6:40 PM."',
  },
  study: {
    icon: '📖',
    title: 'STUDY — Focus on the current task',
    body: 'Open the Study Timer and start the session you planned. One task at a time, with the topic and target right in front of you.',
    example: 'Example: DBMS — Normalization, target 40 minutes.',
  },
  track: {
    icon: '⏱️',
    title: 'TRACK — Record actual progress',
    body: 'The timer is server-verified, not a browser countdown — it survives a closed tab, a dead battery, or a refresh, so what gets recorded is what actually happened.',
    example: 'Example: 34 of 40 planned minutes actually completed.',
  },
  test: {
    icon: '📝',
    title: 'TEST — Check your understanding',
    body: 'Take a quick quiz or subject test on what you just studied, so you find out today whether it stuck — not at exam time.',
    example: 'Example: 8/10 on a 10-question DBMS quiz.',
  },
  analyze: {
    icon: '📊',
    title: 'ANALYZE — Understand your performance',
    body: 'Real analytics from your own sessions and test scores: planned vs. actual time, subject breakdowns, and which topics are actually weak.',
    example: 'Example: "Normalization: 42% accuracy — your weakest DBMS topic."',
  },
  improve: {
    icon: '🚀',
    title: 'IMPROVE — AI recommends what to do next',
    body: 'Your AI coach turns that analysis into the next concrete move, and feeds it straight back into a new plan — closing the loop.',
    example: 'Example: "Revise Normalization for 20 minutes before your next test."',
  },
};

const selectLoopStep = (stepId) => {
  const step = LOOP_STEPS[stepId];
  if (!step) return;

  document.querySelectorAll('.loop-step').forEach((btn) => btn.classList.toggle('active', btn.dataset.step === stepId));

  const card = document.getElementById('loopDetailCard');
  if (!card) return;
  card.innerHTML = `
    <div class="loop-detail-icon">${step.icon}</div>
    <div>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      <p class="loop-detail-example">${step.example}</p>
    </div>
  `;
};

// ===== PHASE 15: MOBILE "MORE" SHEET =====
const openMoreMenu = () => document.getElementById('moreMenuOverlay')?.classList.add('show');
const closeMoreMenu = () => document.getElementById('moreMenuOverlay')?.classList.remove('show');
const closeMoreMenuIfOverlay = (e) => {
  if (e.target.id === 'moreMenuOverlay') closeMoreMenu();
};
const goToTabFromMore = (tabId) => {
  closeMoreMenu();
  switchTab(tabId);
};

// ===== SIDEBAR TAB SWITCHING =====
const switchTab = (tabId) => {
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-link[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  $(tabId).classList.add('active');

  if (tabId === 'dashboardTab' && typeof loadHomeDashboard === 'function') loadHomeDashboard();
  if (tabId === 'plannerTab' && typeof loadPlannerHeatmap === 'function') loadPlannerHeatmap();
  if (tabId === 'timerTab' && typeof renderTimerTab === 'function') renderTimerTab();
  if (tabId === 'practiceTab' && typeof renderPracticeTab === 'function') renderPracticeTab();
  if (tabId === 'revisionTab' && typeof renderRevisionTab === 'function') renderRevisionTab();
  if (tabId === 'analyticsTab' && typeof loadAnalytics === 'function') loadAnalytics();
  if (tabId === 'jobsTab' && typeof loadJobs === 'function') loadJobs();
  if (tabId === 'aiCoachTab' && typeof loadAiCoach === 'function') loadAiCoach();
  if (tabId === 'achievementsTab' && typeof renderAchievementsTab === 'function') renderAchievementsTab();
  if (tabId === 'remindersTab' && typeof initPushToggleUi === 'function') initPushToggleUi();
  if (tabId === 'profileTab' && typeof renderProfileTab === 'function') renderProfileTab();
  if (tabId === 'settingsTab') renderSettingsTab();
};

const renderSettingsTab = () => {
  const user = getUser();
  const info = $('settingsAccountInfo');
  if (info && user) info.textContent = `${user.name} · ${user.email}`;
};

// ===== FORMAT TIME =====
const formatTime12 = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

const addMinutes = (time24, mins) => {
  const [h, m] = time24.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
};

// ===== FLEXIBLE DURATION (hours + minutes, any combination) =====
const getDurationMinutes = () => {
  const hours = parseInt($('durationHours').value, 10) || 0;
  const minutes = parseInt($('durationMinutes').value, 10) || 0;
  return Math.max(0, hours) * 60 + Math.max(0, Math.min(59, minutes));
};

const setDurationPreset = (hours, minutes, evt) => {
  $('durationHours').value = hours;
  $('durationMinutes').value = minutes;
  document.querySelectorAll('.preset-chip').forEach((chip) => chip.classList.remove('active'));
  if (evt && evt.target) evt.target.classList.add('active');
};

// ===== PRIORITY SELECTION =====
const setPriority = (priority, evt) => {
  selectedPriority = priority;
  document.querySelectorAll('.priority-chip').forEach((chip) => chip.classList.remove('active'));
  if (evt && evt.target) evt.target.classList.add('active');
};

// ===== GENERATE TIME SLOT =====
const generateTimeSlot = () => {
  const startTime = $('startTime').value;
  const duration = getDurationMinutes();
  if (!startTime) {
    toast('Please select a start time first', 'error');
    return;
  }
  if (duration <= 0) {
    toast('Please set a duration greater than 0', 'error');
    return;
  }
  const endTime = addMinutes(startTime, duration);
  $('timeSlotInput').value = `${formatTime12(startTime)} - ${formatTime12(endTime)}`;
  toast('Time slot generated!', 'success');
};

// ===== LOAD SESSIONS =====
const loadSessions = async () => {
  try {
    currentSessions = await sessionsAPI.getByDay(currentDay);
    renderSessions();
    updateStats();
  } catch (err) {
    console.error(err);
    toast('Failed to load sessions', 'error');
  }
};

// ===== RENDER SESSIONS (visual timeline) =====
const renderSessions = () => {
  const list = $('sessionsList');
  if (!currentSessions.length) {
    list.innerHTML = `<div class="session-empty">📭 No study sessions for ${currentDay}. Add one above!</div>`;
    return;
  }

  const sorted = [...currentSessions].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const isToday = currentDay === JS_DAY_TO_ABBR[new Date().getDay()];

  list.innerHTML = sorted.map((s) => {
    const priority = s.priority || 'Medium';
    const priorityIcon = priority === 'High' ? '🔴' : priority === 'Low' ? '🟢' : '🟡';
    const missed = isToday && isTaskMissed(s);

    return `
    <div class="timeline-item priority-${priority} ${s.completed ? 'completed' : ''} ${missed ? 'missed' : ''}" id="card-${s._id}">
      <div class="timeline-time">${escHtml(formatTime12(s.startTime))}</div>
      <div class="timeline-body">
        <div class="timeline-subject">${escHtml(s.subject)}</div>
        ${s.goal ? `<div class="timeline-goal">${escHtml(s.goal)}</div>` : ''}
        <span class="timeline-priority-tag priority-${priority}">${priorityIcon} ${priority}</span>
        ${s.tag ? `<span class="timeline-tag-chip">${escHtml(s.tag)}</span>` : ''}
        ${missed ? renderRescheduleBanner(s) : ''}
      </div>
      <div class="timeline-actions">
        ${!s.completed ? `<button class="btn-start-study" onclick="startTimerFromPlanner('${s._id}', '${escHtml(s.subject).replace(/'/g, "\\'")}', ${s.duration}, '${escHtml(s.goal || '').replace(/'/g, "\\'")}')" title="Start a tracked study session for this">▶ Start</button>` : ''}
        <input type="checkbox" class="session-checkbox"
          ${s.completed ? 'checked' : ''}
          onchange="toggleComplete('${s._id}', this.checked)" title="Mark complete" />
        <button class="btn-delete" onclick="deleteSession('${s._id}')" title="Delete">🗑️</button>
      </div>
    </div>
  `;
  }).join('');
};

// ===== SMART RESCHEDULING (Phase 9) =====
// A task that's past its end time and still incomplete isn't marked
// "FAILED" - instead we suggest a real, non-overlapping slot later today
// and let the student accept it with one click. Purely deterministic,
// computed from the day's own other sessions (never invents a time).
const isTaskMissed = (s) => {
  if (s.completed || !s.startTime) return false;
  const [h, m] = s.startTime.split(':').map(Number);
  if (Number.isNaN(h)) return false;
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + (s.duration || 0) * 60000);
  return new Date() > end;
};

const computeRescheduleSuggestion = (task) => {
  const now = new Date();
  let candidate = new Date(now.getTime() + 10 * 60000);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(Math.ceil(candidate.getMinutes() / 5) * 5);

  const others = currentSessions.filter((s) => s._id !== task._id && !s.completed && s.startTime);

  let movedForward = true;
  let guard = 0;
  while (movedForward && guard < 50) {
    movedForward = false;
    guard += 1;
    for (const s of others) {
      const [h, m] = s.startTime.split(':').map(Number);
      const start = new Date(candidate);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + (s.duration || 0) * 60000);
      if (candidate >= start && candidate < end) {
        candidate = new Date(end.getTime());
        movedForward = true;
      }
    }
  }
  return `${String(candidate.getHours()).padStart(2, '0')}:${String(candidate.getMinutes()).padStart(2, '0')}`;
};

const renderRescheduleBanner = (task) => {
  const suggested = computeRescheduleSuggestion(task);
  return `
    <div class="reschedule-banner">
      <span>⚠️ Missed — let's rebalance your day. Move to <strong>${escHtml(formatTime12(suggested))}</strong>?</span>
      <button class="btn-secondary reschedule-accept-btn" onclick="rescheduleTask('${task._id}', '${suggested}')">Accept</button>
    </div>`;
};

const rescheduleTask = async (id, newStartTime) => {
  const task = currentSessions.find((s) => s._id === id);
  if (!task) return;
  const newTimeSlot = `${formatTime12(newStartTime)} - ${formatTime12(addMinutes(newStartTime, task.duration))}`;

  try {
    const updated = await sessionsAPI.update(id, { startTime: newStartTime, timeSlot: newTimeSlot });
    const idx = currentSessions.findIndex((s) => s._id === id);
    if (idx !== -1) currentSessions[idx] = { ...currentSessions[idx], ...updated };
    renderSessions();
    updateStats();
    toast(`Moved ${task.subject} to ${formatTime12(newStartTime)} ✓`, 'success');
  } catch (err) {
    toast(err.message || 'Could not reschedule — try again', 'error');
  }
};

// ===== UPDATE STATS =====
const updateStats = () => {
  const total = currentSessions.length;
  const done = currentSessions.filter((s) => s.completed).length;
  $('statTotal').textContent = `${total} session${total !== 1 ? 's' : ''}`;
  $('statDone').textContent = `${done} completed`;
};

// ===== ADD SESSION =====
const addSession = async () => {
  const subject = $('subjectInput').value.trim();
  const startTime = $('startTime').value;
  const duration = getDurationMinutes();
  const timeSlot = $('timeSlotInput').value.trim();
  const goal = $('goalInput').value.trim();

  if (!subject) { toast('Please enter a subject', 'error'); $('subjectInput').focus(); return; }
  if (!startTime) { toast('Please select a start time', 'error'); return; }
  if (duration <= 0) { toast('Please set a duration greater than 0', 'error'); return; }
  if (!timeSlot) { toast('Please generate or enter a time slot', 'error'); return; }

  const btn = $('addBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Adding...';

  try {
    const session = await sessionsAPI.create({ day: currentDay, subject, timeSlot, startTime, duration, goal, priority: selectedPriority });

    if (currentDay === (JS_DAY_TO_ABBR[new Date().getDay()])) {
      currentSessions.unshift(session);
      renderSessions();
      updateStats();
    }

    $('subjectInput').value = '';
    $('startTime').value = '';
    $('timeSlotInput').value = '';
    $('goalInput').value = '';

    toast('Session added to timetable! 📚', 'success');
  } catch (err) {
    toast(err.message || 'Failed to add session', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '+ Add to Timetable';
  }
};

// ===== TOGGLE COMPLETE (hooked into gamification + browser notification) =====
const toggleComplete = async (id, completed) => {
  try {
    const result = await sessionsAPI.update(id, { completed });
    const idx = currentSessions.findIndex((s) => s._id === id);
    if (idx !== -1) currentSessions[idx].completed = completed;
    renderSessions();
    updateStats();

    if (completed) {
      const subject = idx !== -1 ? currentSessions[idx].subject : 'Session';
      if (typeof notifyBrowser === 'function') {
        notifyBrowser('✅ Session completed', `Nice work finishing "${subject}"!`);
      }
      if (result.gamification) {
        showGamificationToast(result.gamification);
        if (result.user) renderGamiBar(result.user);
      } else {
        toast('Session marked complete! ✅', 'info');
      }
    } else {
      toast('Session reopened', 'info');
    }
  } catch (err) {
    toast('Failed to update session', 'error');
  }
};

// ===== DELETE SESSION =====
const deleteSession = async (id) => {
  if (!confirm('Delete this study session?')) return;
  try {
    await sessionsAPI.delete(id);
    currentSessions = currentSessions.filter((s) => s._id !== id);
    renderSessions();
    updateStats();
    toast('Session deleted', 'info');
  } catch (err) {
    toast('Failed to delete session', 'error');
  }
};

// ===== SWITCH DAY =====
const switchDay = (day) => {
  currentDay = day;
  document.querySelectorAll('.day-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.day === day);
  });
  loadSessions();
};

// ===== DOWNLOAD WEEKLY TIMETABLE =====
const downloadTimetable = async () => {
  const btn = $('downloadBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';

  try {
    const weekly = await sessionsAPI.getWeekly();
    const user = getUser();

    let text = `STUDYFLOW AI - WEEKLY TIMETABLE\n`;
    text += `User: ${user?.name || 'Student'}\n`;
    text += `Generated: ${new Date().toLocaleString()}\n`;
    text += `${'='.repeat(50)}\n\n`;

    const dayNames = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

    for (const day of DAY_ABBR_ORDER) {
      const sessions = weekly[day] || [];
      text += `📅 ${dayNames[day].toUpperCase()}\n${'-'.repeat(30)}\n`;
      if (!sessions.length) {
        text += '  (No sessions scheduled)\n';
      } else {
        sessions.forEach((s, i) => {
          text += `  ${i + 1}. ${s.subject} [${s.priority || 'Medium'} priority]\n`;
          text += `     Time: ${s.timeSlot}\n`;
          if (s.goal) text += `     Goal: ${s.goal}\n`;
          text += `     Status: ${s.completed ? '✅ Completed' : '⬜ Pending'}\n`;
        });
      }
      text += '\n';
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-timetable-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Timetable downloaded! 📄', 'success');
  } catch (err) {
    toast('Failed to download timetable', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '📄 Download Weekly Timetable';
  }
};

// ===== LOGOUT =====
const logout = () => {
  // Phase 16: tear down the timer's polling loops on logout - without this,
  // a heartbeat/tick interval from an active session keeps firing every
  // 30s/1s after the token is cleared (silently failing every request)
  // until the page is reloaded.
  if (typeof clearTimerLoops === 'function') clearTimerLoops();
  if (typeof timerState !== 'undefined') {
    timerState.session = null;
    timerState.minimized = false;
  }
  if (typeof exitFocusMode === 'function') exitFocusMode();

  clearAuth();
  if (typeof stopNotificationWatcher === 'function') stopNotificationWatcher();
  showPage('loginPage');
  toast('Logged out successfully', 'info');
};

// ===== TIME-BASED GREETING =====
const renderGreeting = () => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning 👋' : hour < 17 ? 'Good afternoon 👋' : 'Good evening 👋';
  const headline = $('greetingHeadline');
  if (headline) headline.textContent = greeting;
};

// ===== INIT APP (after login OR on page load if already authed) =====
const initApp = async () => {
  const user = getUser();
  if (user) $('greetingName').textContent = user.name;
  renderGreeting();

  // Refresh full gamification + profile state from server (source of truth)
  let freshUser = user;
  try {
    freshUser = await authAPI.me();
    setAuth(getToken(), freshUser);
    renderGamiBar(freshUser);
  } catch (err) {
    console.error('Failed to refresh user stats', err);
  }

  // ===== PHASE 1: adaptive onboarding gate =====
  // A student who has never completed (or explicitly skipped) the profile
  // wizard is routed here instead of the dashboard, every time they log in,
  // until they finish or skip it.
  if (!freshUser || !freshUser.profile || !freshUser.profile.onboardingCompleted) {
    showPage('onboardingPage');
    if (typeof startOnboarding === 'function') startOnboarding();
    return;
  }

  showPage('appPage');

  // Default the planner's day selector to today
  currentDay = JS_DAY_TO_ABBR[new Date().getDay()];
  document.querySelectorAll('.day-btn').forEach((b) => b.classList.toggle('active', b.dataset.day === currentDay));

  switchTab('dashboardTab');
  loadSessions();

  if (typeof startNotificationWatcher === 'function') startNotificationWatcher();
  if (typeof initTimerOnLoad === 'function') initTimerOnLoad();
};

// Re-render the planner's Today view every minute so a task that just
// crossed its end time gets its "missed / rebalance" banner without
// needing a page reload or any new data.
setInterval(() => {
  const plannerActive = document.getElementById('plannerTab')?.classList.contains('active');
  if (plannerActive && typeof currentPlannerView !== 'undefined' && currentPlannerView === 'today' && currentSessions.length) {
    renderSessions();
  }
}, 60 * 1000);

// ===== APP INIT =====
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('loopDiagram')) selectLoopStep('plan');

  const token = getToken();
  if (token) {
    initApp();
  } else {
    showPage('landingPage');
  }
});
