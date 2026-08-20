// ===== SMART STUDY TIMER (frontend) =====
// The backend (server/services/timerService.js) is the single source of
// truth for elapsed time - this file never invents active seconds. It:
//   - polls a 30s heartbeat while a session is running, so the server can
//     account for real wall-clock gaps (and detect interruptions itself)
//   - ticks the on-screen clock every second purely for smooth display,
//     always re-anchored to the server's numbers on every heartbeat/action
//   - restores/reconciles session state on page load via GET /active, so a
//     refresh, closed tab, or sleeping laptop is handled correctly instead
//     of silently losing or over-counting time
//
// Public entry points referenced elsewhere (public/app.js, index.html):
//   initTimerOnLoad, renderTimerTab, startTimerFromForm, startTimerFromPlanner,
//   toggleTimerPauseResume, finishTimerSession, toggleMinimizeTimer

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

const timerState = {
  session: null, // last known server session snapshot (see timerService.liveSnapshot)
  heartbeatTimer: null,
  tickTimer: null,
  minimized: false,
  pendingStart: null, // { subject, topic, minutes, plannerSessionId } - held during a conflict prompt
  conflictExistingId: null,
};

// ===== HELPERS =====
const unescHtml = (str) =>
  String(str || '').replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[m]));

const fmtHMS = (totalSeconds) => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const fmtHM = (totalSeconds) => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const todayAbbrevDay = () => JS_DAY_TO_ABBR[new Date().getDay()];

// Live-computed elapsed seconds for smooth per-second display between
// heartbeats. Purely cosmetic - the server's totalActiveSeconds (refreshed
// on every heartbeat/pause/resume/finish response) is what actually persists.
const liveElapsedSeconds = (session) => {
  if (!session) return 0;
  if (session.status !== 'running') return session.totalActiveSeconds;
  const sinceLastActive = Math.max(0, (Date.now() - new Date(session.lastActiveAt).getTime()) / 1000);
  return session.totalActiveSeconds + sinceLastActive;
};

// ===== CLEANUP =====
const clearTimerLoops = () => {
  if (timerState.heartbeatTimer) clearInterval(timerState.heartbeatTimer);
  if (timerState.tickTimer) clearInterval(timerState.tickTimer);
  timerState.heartbeatTimer = null;
  timerState.tickTimer = null;
};

// ===== DISPLAY =====
const TIMER_RING_R = 98;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_R;

const updateTimerDisplay = () => {
  const session = timerState.session;
  if (!session) return;

  const elapsed = liveElapsedSeconds(session);
  const remaining = Math.max(0, session.plannedSeconds - elapsed);
  const overBy = elapsed - session.plannedSeconds;
  const pct = session.plannedSeconds > 0 ? Math.min(100, Math.round((elapsed / session.plannedSeconds) * 100)) : 0;

  const displayEl = document.getElementById('timerDisplay');
  if (displayEl) displayEl.textContent = fmtHMS(elapsed);

  const targetEl = document.getElementById('timerTargetText');
  if (targetEl) targetEl.textContent = `Target: ${fmtHMS(session.plannedSeconds)}`;

  const remainingEl = document.getElementById('timerRemainingText');
  if (remainingEl) {
    remainingEl.textContent = overBy > 0 ? `🎉 +${fmtHMS(overBy)} extra` : `Remaining: ${fmtHMS(remaining)}`;
  }

  const ringFill = document.getElementById('timerProgressRingFill');
  if (ringFill) {
    ringFill.style.strokeDasharray = String(TIMER_RING_CIRCUMFERENCE);
    ringFill.style.strokeDashoffset = String(TIMER_RING_CIRCUMFERENCE - (pct / 100) * TIMER_RING_CIRCUMFERENCE);
  }

  const chipEl = document.getElementById('timerStatusChip');
  if (chipEl) {
    chipEl.className = `timer-status-chip status-${session.status}`;
    chipEl.textContent = session.status === 'running' ? '● STUDYING' : session.status === 'paused' ? '⏸ PAUSED' : session.status.toUpperCase();
  }

  const subjectEl = document.getElementById('timerLiveSubject');
  if (subjectEl) subjectEl.textContent = unescHtml(session.subject);
  const topicEl = document.getElementById('timerLiveTopic');
  if (topicEl) topicEl.textContent = session.topic ? unescHtml(session.topic) : '';

  const pauseBtn = document.getElementById('timerPauseResumeBtn');
  if (pauseBtn) pauseBtn.innerHTML = session.status === 'paused' ? '▶ Resume' : '⏸ Pause';

  // Mini (minimized) floating widget
  const miniClock = document.getElementById('miniTimerClock');
  if (miniClock) miniClock.textContent = fmtHMS(elapsed);
  const miniSubject = document.getElementById('miniTimerSubject');
  if (miniSubject) miniSubject.textContent = unescHtml(session.subject);
  const miniDot = document.getElementById('miniTimerDot');
  if (miniDot) miniDot.className = `mini-timer-dot status-${session.status}`;

  // Focus Mode overlay (Phase 13) - same live session, same server data,
  // just a distraction-free view. Kept in sync here rather than a
  // duplicate timer/poll loop.
  const focusSubjectEl = document.getElementById('focusSubject');
  if (focusSubjectEl) focusSubjectEl.textContent = unescHtml(session.subject);
  const focusTopicEl = document.getElementById('focusTopic');
  if (focusTopicEl) focusTopicEl.textContent = session.topic ? unescHtml(session.topic) : '';
  const focusDisplayEl = document.getElementById('focusTimerDisplay');
  if (focusDisplayEl) focusDisplayEl.textContent = fmtHMS(elapsed);
  const focusFillEl = document.getElementById('focusProgressFill');
  if (focusFillEl) focusFillEl.style.width = `${pct}%`;
  const focusPauseBtn = document.getElementById('focusPauseResumeBtn');
  if (focusPauseBtn) focusPauseBtn.innerHTML = session.status === 'paused' ? '▶ Resume' : '⏸ Pause';

  syncPanelVisibility();
};

const syncPanelVisibility = () => {
  const startPanel = document.getElementById('timerStartPanel');
  const livePanel = document.getElementById('timerLivePanel');
  const miniWidget = document.getElementById('miniTimerWidget');
  const hasLiveSession = timerState.session && ['running', 'paused'].includes(timerState.session.status);

  if (startPanel) startPanel.style.display = hasLiveSession && !timerState.minimized ? 'none' : hasLiveSession ? 'none' : '';
  if (livePanel) livePanel.style.display = hasLiveSession && !timerState.minimized ? '' : 'none';
  if (miniWidget) miniWidget.classList.toggle('show', Boolean(hasLiveSession && timerState.minimized));
};

// ===== HEARTBEAT LOOP =====
const startLoops = () => {
  clearTimerLoops();
  timerState.tickTimer = setInterval(() => {
    if (timerState.session && timerState.session.status === 'running') updateTimerDisplay();
  }, 1000);

  timerState.heartbeatTimer = setInterval(async () => {
    if (!timerState.session || timerState.session.status !== 'running') return;
    try {
      const data = await timerAPI.heartbeat(timerState.session._id);
      timerState.session = data.session;
      if (data.interrupted) {
        clearTimerLoops();
        showTimerInterruptedModal(timerState.session);
      } else {
        updateTimerDisplay();
      }
    } catch (err) {
      // Transient network errors shouldn't kill the local session view -
      // the next heartbeat (or the server's own staleness check) will
      // reconcile things either way.
      console.error('Heartbeat failed', err);
    }
  }, HEARTBEAT_INTERVAL_MS);
};

// ===== START =====
const onSessionStarted = (session) => {
  timerState.session = session;
  timerState.minimized = false;
  dismissPostSessionCard();
  updateTimerDisplay();
  syncPanelVisibility();
  if (session.status === 'running') startLoops();
};

const startTimer = async ({ subject, topic, minutes, plannerSessionId = null, force = false }) => {
  if (!subject || !subject.trim()) {
    toast('Please enter a subject to study', 'error');
    return;
  }
  if (!minutes || minutes <= 0) {
    toast('Please set a planned duration', 'error');
    return;
  }

  try {
    const { session } = await timerAPI.start({
      subject: subject.trim(),
      topic: (topic || '').trim(),
      plannedMinutes: minutes,
      plannerSessionId: plannerSessionId || null,
      force,
    });
    onSessionStarted(session);
    toast(`Studying "${session.subject}" — timer started ⏱️`, 'success');
  } catch (err) {
    if (err.status === 409 && err.data && err.data.existing) {
      timerState.pendingStart = { subject, topic, minutes, plannerSessionId };
      showTimerConflictModal(err.data.existing);
    } else {
      toast(err.message || 'Failed to start study session', 'error');
    }
  }
};

const startTimerFromForm = () => {
  const subject = document.getElementById('timerSubjectInput').value;
  const topic = document.getElementById('timerTopicInput').value;
  const minutes = parseInt(document.getElementById('timerMinutesInput').value, 10);
  startTimer({ subject, topic, minutes });
};

// Called from the planner's "▶ Start" button (public/app.js renderSessions()).
const startTimerFromPlanner = (plannerSessionId, subject, minutes, goal) => {
  switchTab('timerTab');
  startTimer({ subject, topic: goal, minutes, plannerSessionId });
};

// ===== PAUSE / RESUME =====
const toggleTimerPauseResume = async () => {
  const session = timerState.session;
  if (!session) return;

  try {
    if (session.status === 'running') {
      const data = await timerAPI.pause(session._id);
      timerState.session = data.session;
      clearTimerLoops();
      updateTimerDisplay();
      toast('Session paused', 'info');
    } else if (session.status === 'paused') {
      const data = await timerAPI.resume(session._id);
      timerState.session = data.session;
      startLoops();
      updateTimerDisplay();
      toast('Session resumed ▶', 'success');
    }
  } catch (err) {
    toast(err.message || 'Failed to update session', 'error');
  }
};

// ===== FINISH (shared by the live panel's Finish button, and by ending an
// interrupted/conflicting session from their respective modals) =====
const handleFinishResult = (data, { silent = false } = {}) => {
  clearTimerLoops();
  const finishedSubject = timerState.session ? timerState.session.subject : data.session.subject;
  timerState.session = null;
  timerState.minimized = false;
  exitFocusMode();
  syncPanelVisibility();

  if (!silent) {
    const studied = fmtHM(data.session.totalActiveSeconds);
    const planned = fmtHM(data.session.plannedSeconds);
    if (data.targetMet) {
      toast(`🎉 Target completed! You studied ${studied} (planned ${planned}).`, 'success');
    } else {
      toast(`Session finished — you studied ${studied} toward a ${planned} target.`, 'info');
    }
    showPostSessionCard(finishedSubject, studied);
  }

  if (data.gamification) {
    showGamificationToast(data.gamification);
  }
  if (data.user) {
    setAuth(getToken(), data.user);
    renderGamiBar(data.user);
  }
  if (data.plannerSessionUpdated && typeof loadSessions === 'function' && currentDay === todayAbbrevDay()) {
    loadSessions();
  }

  renderTimerTab();
};

// "X minutes focused. [ Take Quick Test ]" - shown right after a session
// ends, deep-linking into the existing Practice tab (Phase 10) rather than
// building a second quiz flow.
const showPostSessionCard = (subject, studiedLabel) => {
  const card = document.getElementById('postSessionCard');
  if (!card) return;
  document.getElementById('postSessionText').textContent = `${studiedLabel} focused on ${unescHtml(subject)}.`;
  card.dataset.subject = subject;
  card.style.display = '';
};

const dismissPostSessionCard = () => {
  const card = document.getElementById('postSessionCard');
  if (card) card.style.display = 'none';
};

const postSessionTakeQuickTest = () => {
  const card = document.getElementById('postSessionCard');
  const subject = card?.dataset.subject || '';
  dismissPostSessionCard();
  if (subject) startPracticeForSubject(subject);
  else switchTab('practiceTab');
};

const finishTimerSession = async () => {
  const session = timerState.session;
  if (!session) return;
  try {
    const data = await timerAPI.finish(session._id);
    handleFinishResult(data);
  } catch (err) {
    toast(err.message || 'Failed to finish session', 'error');
  }
};

// ===== MINIMIZE =====
const toggleMinimizeTimer = () => {
  timerState.minimized = true;
  syncPanelVisibility();
};

const openTimerFromMini = () => {
  timerState.minimized = false;
  switchTab('timerTab');
  syncPanelVisibility();
};

// ===== PHASE 13: FOCUS MODE =====
// Distraction-free full-screen view of the exact same live session - no
// second timer, no separate poll loop, just a different view synced by
// updateTimerDisplay() above.
const enterFocusMode = () => {
  if (!timerState.session) return;
  document.getElementById('focusModeOverlay')?.classList.add('show');
  document.body.classList.add('focus-mode-active');
  updateTimerDisplay();
};

const exitFocusMode = () => {
  document.getElementById('focusModeOverlay')?.classList.remove('show');
  document.body.classList.remove('focus-mode-active');
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('focusModeOverlay')?.classList.contains('show')) {
    exitFocusMode();
  }
});

// ===== INTERRUPTED SESSION MODAL =====
const showTimerInterruptedModal = (session) => {
  const modal = document.getElementById('timerInterruptedModal');
  if (!modal) return;
  document.getElementById('timerInterruptedSubject').textContent = unescHtml(session.subject);
  document.getElementById('timerInterruptedStudied').textContent = fmtHMS(session.totalActiveSeconds);
  document.getElementById('timerInterruptedTarget').textContent = fmtHMS(session.plannedSeconds);
  document.getElementById('timerInterruptedRemaining').textContent = fmtHMS(Math.max(0, session.plannedSeconds - session.totalActiveSeconds));
  modal.classList.add('show');
};

const closeTimerInterruptedModal = () => document.getElementById('timerInterruptedModal').classList.remove('show');

const resumeInterruptedSession = async () => {
  if (!timerState.session) return;
  try {
    const data = await timerAPI.resume(timerState.session._id);
    timerState.session = data.session;
    closeTimerInterruptedModal();
    startLoops();
    updateTimerDisplay();
    toast('Session resumed — the interruption was excluded from your study time. ▶', 'success');
  } catch (err) {
    toast(err.message || 'Failed to resume session', 'error');
  }
};

const endInterruptedSession = async () => {
  if (!timerState.session) return;
  try {
    const data = await timerAPI.finish(timerState.session._id);
    closeTimerInterruptedModal();
    handleFinishResult(data);
  } catch (err) {
    toast(err.message || 'Failed to end session', 'error');
  }
};

// ===== MULTI-DEVICE CONFLICT MODAL =====
const showTimerConflictModal = (existing) => {
  const modal = document.getElementById('timerConflictModal');
  if (!modal) return;
  timerState.conflictExistingId = existing._id;
  document.getElementById('timerConflictSubject').textContent = unescHtml(existing.subject);
  document.getElementById('timerConflictDevice').textContent = existing.deviceLabel
    ? `Currently running on ${existing.deviceLabel}.`
    : 'Currently running elsewhere.';
  document.getElementById('timerConflictElapsed').textContent = fmtHMS(existing.totalActiveSeconds);
  modal.classList.add('show');
};

const closeTimerConflictModal = () => document.getElementById('timerConflictModal').classList.remove('show');

const conflictContinueThere = () => {
  timerState.pendingStart = null;
  timerState.conflictExistingId = null;
  closeTimerConflictModal();
  toast('Okay — manage that session from where it started.', 'info');
};

const conflictTakeOver = async () => {
  const pending = timerState.pendingStart;
  closeTimerConflictModal();
  if (!pending) return;
  await startTimer({ ...pending, force: true });
  timerState.pendingStart = null;
};

const conflictEndExisting = async () => {
  const existingId = timerState.conflictExistingId;
  const pending = timerState.pendingStart;
  closeTimerConflictModal();
  if (!existingId) return;
  try {
    const data = await timerAPI.finish(existingId);
    handleFinishResult(data, { silent: true });
    toast('Previous session ended. Starting your new one…', 'info');
    if (pending) await startTimer(pending);
  } catch (err) {
    toast(err.message || 'Failed to end the previous session', 'error');
  } finally {
    timerState.pendingStart = null;
    timerState.conflictExistingId = null;
  }
};

// ===== TODAY'S STUDY BALANCE =====
const renderTimerBalance = async () => {
  const body = document.getElementById('timerBalanceBody');
  if (!body) return;
  body.innerHTML = '<div class="ai-loading">Loading today\'s balance…</div>';

  try {
    const [balance, todaysPlanner] = await Promise.all([timerAPI.remaining(), sessionsAPI.getByDay(todayAbbrevDay())]);
    const nextTask = (todaysPlanner || []).filter((s) => !s.completed).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))[0];

    let nextHtml;
    if (nextTask) {
      nextHtml = `
        <div class="timer-balance-next">
          <div>
            <strong>${escHtml(nextTask.subject)}</strong>${nextTask.goal ? ` — ${escHtml(nextTask.goal)}` : ''}
            <br /><span class="ai-subtitle">${nextTask.duration} min planned</span>
          </div>
          <button class="btn-add" onclick="startTimerFromPlanner('${nextTask._id}', '${escHtml(nextTask.subject).replace(/'/g, "\\'")}', ${nextTask.duration}, '${escHtml(nextTask.goal || '').replace(/'/g, "\\'")}')">▶ Study Now</button>
        </div>`;
    } else if (balance.targetSeconds === 0) {
      nextHtml = `<p class="ai-subtitle">No sessions planned for today yet — add one in the Planner tab, or start an untracked session below.</p>`;
    } else {
      nextHtml = `<p class="ai-subtitle">🎉 All of today's planned sessions are complete!</p>`;
    }

    body.innerHTML = `
      <div class="timer-balance-grid">
        <div class="timer-balance-stat"><div class="stat-value">${fmtHM(balance.targetSeconds)}</div><div class="stat-label">Target</div></div>
        <div class="timer-balance-stat"><div class="stat-value">${fmtHM(balance.actualSeconds)}</div><div class="stat-label">Completed</div></div>
        <div class="timer-balance-stat"><div class="stat-value">${fmtHM(balance.remainingSeconds)}</div><div class="stat-label">Remaining</div></div>
      </div>
      <div class="gami-xp-track"><div class="gami-xp-fill" style="width:${balance.progressPct}%"></div></div>
      ${nextHtml}
    `;
  } catch (err) {
    body.innerHTML = '<p class="ai-subtitle">Could not load today\'s balance right now.</p>';
  }
};

// ===== AI REMAINING PLAN (Phase 7) =====
// Breaks the remaining target across today's real incomplete planner tasks
// (server/services/timerService.js buildRemainingPlan) - never a fabricated
// schedule, and hidden entirely when there's nothing meaningful to show.
const renderRemainingPlan = async () => {
  const card = document.getElementById('remainingPlanCard');
  const intro = document.getElementById('remainingPlanIntro');
  const body = document.getElementById('remainingPlanBody');
  if (!card || !body) return;

  try {
    const plan = await timerAPI.remainingPlan();

    if (!plan.blocks || !plan.blocks.length) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    intro.textContent = plan.scaled
      ? `Your planned tasks add up to more than what's left today, so here's a realistic way to fit them into ${fmtHM(plan.remainingSeconds)}.`
      : `Here's a realistic way to finish today's target.`;

    body.innerHTML = plan.blocks.map((b) => {
      if (b.type === 'break') {
        return `<div class="remaining-plan-row remaining-plan-break"><span class="remaining-plan-time">${formatTime12(b.startTime)}</span><span>Break</span><span class="remaining-plan-mins">${b.minutes} min</span></div>`;
      }
      return `
        <div class="remaining-plan-row">
          <span class="remaining-plan-time">${formatTime12(b.startTime)}</span>
          <span>${escHtml(b.subject)}${b.topic ? ` — ${escHtml(b.topic)}` : ''}</span>
          <span class="remaining-plan-mins">${b.minutes} min</span>
        </div>`;
    }).join('');

    const firstBlock = plan.blocks.find((b) => b.type === 'study');
    if (firstBlock) {
      body.innerHTML += `
        <div class="remaining-plan-actions">
          <button class="btn-primary" onclick="startTimerFromPlanner('${firstBlock.plannerSessionId}', '${escHtml(firstBlock.subject).replace(/'/g, "\\'")}', ${firstBlock.minutes}, '${escHtml(firstBlock.topic || '').replace(/'/g, "\\'")}')">✅ Accept &amp; Start</button>
          <button class="btn-secondary" onclick="switchTab('plannerTab')">✏️ Edit</button>
        </div>`;
    }
  } catch (err) {
    card.style.display = 'none';
  }
};

// ===== TODAY'S STUDY HISTORY (Phase 6) =====
// A real timeline of today's timer runs (server-truth StudySessionTimer
// docs from GET /study-sessions/today) - planned vs. actual, per run.
const renderTimerHistory = async () => {
  const card = document.getElementById('timerHistoryCard');
  const body = document.getElementById('timerHistoryBody');
  if (!card || !body) return;

  try {
    const data = await timerAPI.today();
    const runs = (data.runs || []).filter((r) => r.totalActiveSeconds > 0 || r.status === 'completed');

    if (!runs.length) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    body.innerHTML = runs.map((r) => {
      const startedAt = new Date(r.sessionStartedAt);
      const timeLabel = startedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `
        <div class="history-row">
          <div class="history-time">${timeLabel}</div>
          <div class="history-body">
            <div class="history-subject">${escHtml(r.subject)}${r.topic ? ` — ${escHtml(r.topic)}` : ''}</div>
            <div class="ai-subtitle">Planned ${fmtHM(r.plannedSeconds)} · Actual ${fmtHM(r.totalActiveSeconds)}</div>
          </div>
          <span class="history-status-tag status-${r.status}">${r.status}</span>
        </div>`;
    }).join('');
  } catch (err) {
    card.style.display = 'none';
  }
};

// ===== TAB ENTRY POINT (called by app.js switchTab()) =====
const renderTimerTab = () => {
  renderTimerBalance();
  renderRemainingPlan();
  renderTimerHistory();
  syncPanelVisibility();
  if (timerState.session) updateTimerDisplay();
};

// ===== APP INIT ENTRY POINT (called once from app.js initApp()) =====
const initTimerOnLoad = async () => {
  try {
    const { session } = await timerAPI.active();
    if (!session) return;

    timerState.session = session;

    if (session.status === 'interrupted' || session.likelyInterrupted) {
      showTimerInterruptedModal(session);
      return;
    }

    // A live session survived a refresh/return - restore it quietly as a
    // minimized widget so it's visible everywhere without forcing a tab
    // switch, matching the "minimized timer, no intrusive overlay" spec.
    timerState.minimized = true;
    updateTimerDisplay();
    syncPanelVisibility();
    if (session.status === 'running') startLoops();
  } catch (err) {
    console.error('Failed to check for an active study session', err);
  }
};
