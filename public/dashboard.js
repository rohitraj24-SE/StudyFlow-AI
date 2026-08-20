// ===== DASHBOARD / ANALYTICS / AI COACH =====
let weeklyChartInstance = null;
let subjectChartInstance = null;
let trendChartInstance = null;
let lastAnalytics = null;

const CHART_COLORS = ['#14B8A6', '#8B5CF6', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#A78BFA', '#F87171'];

// ===== HOME DASHBOARD (sidebar "Dashboard" / "My Learning Space") =====
const loadHomeDashboard = async () => {
  loadBriefing();
  renderNextMove();
  renderTodayLearning();
  renderContinueCard();
  loadDashboardInsight();
  renderWeakStrengths();

  try {
    const [analytics, todaySessions] = await Promise.all([
      analyticsAPI.overview(),
      sessionsAPI.getByDay(JS_DAY_TO_ABBR[new Date().getDay()]),
    ]);
    lastAnalytics = analytics;

    document.getElementById('homeKpiToday').textContent = todaySessions.length;
    document.getElementById('homeKpiRate').textContent = `${analytics.completionRate}%`;
    document.getElementById('homeKpiMinutes').textContent = analytics.totalMinutes;
    document.getElementById('homeKpiStreak').textContent = analytics.gamification ? analytics.gamification.streak : 0;

    renderHeatmap('homeHeatmap', analytics.heatmap);
    renderTodayPreview(todaySessions);

    if (analytics.gamification) renderGamiBar(analytics.gamification);
  } catch (err) {
    console.error(err);
    toast('Failed to load dashboard', 'error');
  }
};

// ===== "YOUR NEXT BEST MOVE" =====
// Real data only: the highest-priority unfinished planner task for today
// (analyticsAPI.briefing().topPriorityTask), with a "why" pulled from the
// matching rule-based recommendation for that same subject when one exists.
const renderNextMove = async () => {
  const card = document.getElementById('nextMoveCard');
  if (!card) return;
  try {
    const [briefing, recData] = await Promise.all([analyticsAPI.briefing(), aiAPI.recommendations()]);
    const task = briefing.topPriorityTask;

    if (!task) {
      card.innerHTML = `
        <div class="next-move-empty">
          <h3>Let's create your first study goal.</h3>
          <p>Add a session to today's plan and StudyFlow AI will start recommending what to study next.</p>
          <button class="btn-primary" onclick="switchTab('plannerTab')">+ Plan a Session</button>
        </div>`;
      return;
    }

    const matchingRec = (recData.recommendations || []).find((r) => r.title && r.title.toLowerCase().includes(task.subject.toLowerCase()));
    const why = matchingRec ? matchingRec.detail : `It's your highest-priority unfinished task for today.`;

    card.innerHTML = `
      <div class="next-move-eyebrow">YOUR NEXT BEST MOVE</div>
      <h3 class="next-move-subject">${escHtml(task.subject)}${task.goal ? ` — ${escHtml(task.goal)}` : ''}</h3>
      <div class="next-move-duration">${task.duration} minutes</div>
      <div class="next-move-why"><strong>Why:</strong> ${escHtml(why)}</div>
      <button class="btn-primary next-move-btn" onclick="startTimerFromPlanner('${task._id}', '${escHtml(task.subject).replace(/'/g, "\\'")}', ${task.duration}, '${escHtml(task.goal || '').replace(/'/g, "\\'")}')">▶ START STUDY</button>
    `;
  } catch (err) {
    card.innerHTML = `<p class="ai-subtitle">Could not load a recommendation right now.</p>`;
  }
};

// ===== "TODAY'S LEARNING" — circular progress =====
const renderTodayLearning = async () => {
  const body = document.getElementById('todayLearningBody');
  if (!body) return;
  try {
    const balance = await timerAPI.remaining();
    const pct = balance.progressPct || 0;
    const r = 52;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (pct / 100) * circumference;

    body.innerHTML = `
      <div class="progress-ring-row">
        <svg class="progress-ring" viewBox="0 0 120 120">
          <circle class="progress-ring-track" cx="60" cy="60" r="${r}" />
          <circle class="progress-ring-fill" cx="60" cy="60" r="${r}"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" />
        </svg>
        <div class="progress-ring-center">
          <div class="progress-ring-pct">${pct}%</div>
        </div>
      </div>
      <div class="today-learning-stats">
        <div><span class="tl-label">Target</span><span class="tl-value">${typeof fmtHM === 'function' ? fmtHM(balance.targetSeconds) : Math.round(balance.targetSeconds / 60) + 'm'}</span></div>
        <div><span class="tl-label">Studied</span><span class="tl-value">${typeof fmtHM === 'function' ? fmtHM(balance.actualSeconds) : Math.round(balance.actualSeconds / 60) + 'm'}</span></div>
        <div><span class="tl-label">Remaining</span><span class="tl-value">${typeof fmtHM === 'function' ? fmtHM(balance.remainingSeconds) : Math.round(balance.remainingSeconds / 60) + 'm'}</span></div>
      </div>
      <div class="today-learning-actions">
        <button class="btn-primary" onclick="switchTab('timerTab')">▶ Continue Study</button>
        <button class="btn-secondary" onclick="switchTab('plannerTab')">Plan Remaining</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<p class="ai-subtitle">Could not load today's progress.</p>`;
  }
};

// ===== "CONTINUE WHERE YOU LEFT OFF" =====
const renderContinueCard = async () => {
  const wrap = document.getElementById('continueCardWrap');
  const body = document.getElementById('continueCardBody');
  if (!body) return;
  try {
    const { continuePoint } = await timerAPI.continuePoint();
    if (!continuePoint) {
      if (wrap) wrap.style.display = 'none';
      return;
    }
    if (wrap) wrap.style.display = '';

    const when = timeAgoLabel(continuePoint.lastStudiedAt);
    body.innerHTML = `
      <div class="continue-subject">${escHtml(continuePoint.subject)}${continuePoint.topic ? ` — ${escHtml(continuePoint.topic)}` : ''}</div>
      <div class="continue-pct-track"><div class="continue-pct-fill" style="width:${continuePoint.percentComplete}%"></div></div>
      <div class="continue-meta">${continuePoint.percentComplete}% complete · Last studied ${when}</div>
      <button class="btn-primary" onclick="switchTab('timerTab')">CONTINUE →</button>
    `;
  } catch (err) {
    if (wrap) wrap.style.display = 'none';
  }
};

const timeAgoLabel = (dateInput) => {
  if (!dateInput) return 'recently';
  const then = new Date(dateInput);
  const now = new Date();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return diffMins <= 1 ? 'just now' : `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24 && then.toDateString() === now.toDateString()) return `today, ${diffHours}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'yesterday';
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// ===== DASHBOARD "AI NOTICED SOMETHING…" (same endpoint as AI Coach tab) =====
const loadDashboardInsight = async () => {
  const card = document.getElementById('dashInsightCard');
  if (!card) return;
  try {
    const data = await aiAPI.coachInsight();
    if (!data.configured || !data.insight) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    document.getElementById('dashInsightText').textContent = data.insight;
  } catch (err) {
    card.style.display = 'none';
  }
};

// ===== WEAK AREAS / STRENGTHS (from server/utils/studyFacts.js) =====
const renderWeakStrengths = async () => {
  const weakEl = document.getElementById('dashWeakAreas');
  const strongEl = document.getElementById('dashStrengths');
  if (!weakEl || !strongEl) return;
  try {
    const facts = await aiAPI.facts();

    weakEl.innerHTML = facts.weakSubjects && facts.weakSubjects.length
      ? facts.weakSubjects.map((s) => `
          <div class="weak-area-row" onclick="startPracticeForSubject('${escHtml(s).replace(/'/g, "\\'")}')">
            <span>${escHtml(s)}</span><span class="weak-area-arrow">Practice →</span>
          </div>
        `).join('')
      : `<p class="ai-subtitle">No weak areas detected yet — keep studying and this will fill in.</p>`;

    strongEl.innerHTML = facts.strongSubjects && facts.strongSubjects.length
      ? `<div class="profile-chip-row">${facts.strongSubjects.map((s) => `<span class="profile-chip strength">${escHtml(s)}</span>`).join('')}</div>`
      : `<p class="ai-subtitle">Complete more sessions in a subject to see it highlighted here.</p>`;
  } catch (err) {
    weakEl.innerHTML = `<p class="ai-subtitle">Could not load this right now.</p>`;
    strongEl.innerHTML = '';
  }
};

const renderTodayPreview = (sessions) => {
  const container = document.getElementById('homeTodayPreview');
  if (!sessions.length) {
    container.innerHTML = '<div class="session-empty">📭 Nothing scheduled today. Head to the Planner to add a session!</div>';
    return;
  }
  const sorted = [...sessions].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  container.innerHTML = sorted.map((s) => {
    const priority = s.priority || 'Medium';
    const icon = priority === 'High' ? '🔴' : priority === 'Low' ? '🟢' : '🟡';
    return `
      <div class="timeline-item priority-${priority} ${s.completed ? 'completed' : ''}">
        <div class="timeline-time">${escHtml(formatTime12(s.startTime))}</div>
        <div class="timeline-body">
          <div class="timeline-subject">${escHtml(s.subject)}</div>
          ${s.goal ? `<div class="timeline-goal">${escHtml(s.goal)}</div>` : ''}
          <span class="timeline-priority-tag priority-${priority}">${icon} ${priority}</span>
          ${s.tag ? `<span class="timeline-tag-chip">${escHtml(s.tag)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
};

// ===== ANALYTICS TAB =====
const loadAnalytics = async () => {
  try {
    const analytics = lastAnalytics && lastAnalytics._freshEnough ? lastAnalytics : await analyticsAPI.overview();
    lastAnalytics = analytics;

    renderAnalyticsKpis(analytics);
    renderWeeklyChart(analytics.weeklyActivity);
    renderSubjectChart(analytics.subjectBreakdown);
    renderTrendChart(analytics.trend30Day);

    if (analytics.gamification) renderGamiBar(analytics.gamification);
  } catch (err) {
    console.error(err);
    toast('Failed to load analytics', 'error');
  }
};

const renderAnalyticsKpis = (a) => {
  document.getElementById('kpiTotal').textContent = a.totalSessions;
  document.getElementById('kpiRate').textContent = `${a.completionRate}%`;
  document.getElementById('kpiMinutes').textContent = a.totalMinutes;
  document.getElementById('kpiStreak').textContent = a.gamification ? a.gamification.streak : 0;
};

const renderWeeklyChart = (weeklyActivity) => {
  const ctx = document.getElementById('weeklyChart');
  const labels = weeklyActivity.map((d) => d.day);
  const completed = weeklyActivity.map((d) => d.completed);
  const pending = weeklyActivity.map((d) => d.total - d.completed);

  if (weeklyChartInstance) weeklyChartInstance.destroy();
  weeklyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Completed', data: completed, backgroundColor: '#14B8A6', borderRadius: 6 },
        { label: 'Pending', data: pending, backgroundColor: 'rgba(148,163,184,0.35)', borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { color: getChartTextColor() } } },
      scales: {
        x: { stacked: true, ticks: { color: getChartTextColor() }, grid: { color: getChartGridColor() } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: getChartTextColor() }, grid: { color: getChartGridColor() } },
      },
    },
  });
};

const renderSubjectChart = (subjectBreakdown) => {
  const ctx = document.getElementById('subjectChart');
  const labels = subjectBreakdown.map((s) => s.subject);
  const data = subjectBreakdown.map((s) => s.total);

  if (subjectChartInstance) subjectChartInstance.destroy();

  if (!labels.length) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  subjectChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: getChartBorderColor() }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { color: getChartTextColor() } } },
    },
  });
};

const renderTrendChart = (trend30Day) => {
  const ctx = document.getElementById('trendChart');
  const labels = trend30Day.map((d) => d.date.slice(5));
  const minutes = trend30Day.map((d) => d.minutes);

  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Minutes studied',
        data: minutes,
        borderColor: '#14B8A6',
        backgroundColor: 'rgba(20, 184, 166, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: getChartTextColor() }, grid: { color: getChartGridColor() } },
        y: { beginAtZero: true, ticks: { color: getChartTextColor() }, grid: { color: getChartGridColor() } },
      },
    },
  });
};

// Chart.js needs explicit colors since it doesn't read CSS variables itself
const getChartTextColor = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? '#94A3B8' : '#6B7280');
const getChartGridColor = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(148,163,184,0.12)' : 'rgba(107,114,128,0.12)');
const getChartBorderColor = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? '#0F1729' : '#FFFFFF');

// ===== AI COACH TAB =====
// Hybrid architecture: the recommendation cards below are computed by a
// deterministic rule engine (server/routes/aiRoutes.js -> GET
// /recommendations), which never hallucinates a stat. If a real LLM is
// configured (OPENAI_API_KEY), we additionally show a narrated "AI Coach
// Insight" card and enable the free-form chat panel underneath.
const RECOMMENDATION_ACTION_MAP = {
  neglected_subject: { label: 'Start Session', handler: 'aiActionGoToPlanner' },
  weekly_gap: { label: 'Add to Planner', handler: 'aiActionGoToPlanner' },
  streak_risk: { label: 'Start Session', handler: 'aiActionGoToPlanner' },
  strong_subject: { label: 'View Topic', handler: 'aiActionGoToAnalytics' },
  best_time: { label: 'Add to Planner', handler: 'aiActionGoToPlanner' },
  session_length: { label: 'View Topic', handler: 'aiActionGoToAnalytics' },
  onboarding: { label: 'Add to Planner', handler: 'aiActionGoToPlanner' },
  steady: null,
};

let coachHistory = [];

const loadAiCoach = async () => {
  const container = document.getElementById('aiRecommendations');
  container.innerHTML = '<div class="ai-loading">Analyzing your study patterns…</div>';
  try {
    const data = await aiAPI.recommendations();
    renderRecommendations(data.recommendations);
  } catch (err) {
    container.innerHTML = '<div class="ai-loading">Could not load recommendations right now.</div>';
  }
  loadCoachInsight();
  initCoachChatUi();
};

const renderRecommendations = (recommendations) => {
  const container = document.getElementById('aiRecommendations');
  if (!recommendations || !recommendations.length) {
    container.innerHTML = '<div class="ai-loading">No recommendations yet — add a few study sessions first.</div>';
    return;
  }
  container.innerHTML = recommendations.map((r) => {
    const action = RECOMMENDATION_ACTION_MAP[r.type];
    return `
    <div class="ai-card">
      <div class="ai-icon">${r.icon}</div>
      <div class="ai-body">
        <div class="ai-title">${escHtml(r.title)}</div>
        <div class="ai-detail">${escHtml(r.detail)}</div>
        <div class="ai-card-actions">
          ${action ? `<button class="ai-action-btn" onclick="${action.handler}()">${action.label}</button>` : ''}
          <button class="ai-action-btn ai-action-secondary" onclick="aiActionAskAi('${escHtml(r.title).replace(/'/g, "\\'")}')">Ask AI</button>
        </div>
      </div>
    </div>
  `;
  }).join('');
};

const aiActionGoToPlanner = () => switchTab('plannerTab');
const aiActionGoToAnalytics = () => switchTab('analyticsTab');
const aiActionAskAi = (title) => {
  const input = document.getElementById('coachChatInput');
  if (input) {
    input.value = `Tell me more about: ${title}`;
    input.focus();
  }
};

// ===== PHASE 11: "LEARN ANYTHING" MODE =====
const submitLearnAnything = async () => {
  const input = document.getElementById('learnAnythingInput');
  const topic = input.value.trim();
  if (!topic) { toast('Enter a topic or question first', 'error'); input.focus(); return; }

  const btn = document.getElementById('learnAnythingBtn');
  const resultEl = document.getElementById('learnAnythingResult');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Explaining…';
  resultEl.innerHTML = '';

  try {
    const data = await aiAPI.learn(topic);

    if (!data.configured) {
      resultEl.innerHTML = `
        <div class="learn-anything-unconfigured">
          Explanations need a live AI connection, which isn't configured on this deployment (missing <code>OPENAI_API_KEY</code>).
          You can still test yourself on this topic — the Practice tab's quiz bank works either way.
          <button class="btn-secondary" onclick="startPracticeForSubject('${escHtml(topic).replace(/'/g, "\\'")}')">🧠 Quiz me on this →</button>
        </div>`;
      return;
    }

    resultEl.innerHTML = `
      <div class="learn-anything-card">
        <h4>${escHtml(data.topic)}</h4>
        <p class="learn-explanation">${escHtml(data.explanation)}</p>
        ${data.example ? `<div class="learn-example"><strong>Example:</strong> ${escHtml(data.example)}</div>` : ''}
        ${data.keyPoints && data.keyPoints.length ? `
          <div class="learn-key-points">
            <strong>Key points:</strong>
            <ul>${data.keyPoints.map((p) => `<li>${escHtml(p)}</li>`).join('')}</ul>
          </div>` : ''}
        <div class="learn-anything-actions">
          <button class="btn-secondary" onclick="startPracticeForSubject('${escHtml(topic).replace(/'/g, "\\'")}')">🧠 Quiz me on this</button>
          <button class="btn-secondary" onclick="askFollowUpAboutTopic('${escHtml(topic).replace(/'/g, "\\'")}')">💬 Ask a follow-up</button>
        </div>
      </div>`;
  } catch (err) {
    resultEl.innerHTML = `<p class="ai-subtitle">Could not generate an explanation right now — please try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Explain';
  }
};

const askFollowUpAboutTopic = (topic) => {
  const input = document.getElementById('coachChatInput');
  if (input) {
    input.value = `Follow-up on "${topic}": `;
    input.focus();
  }
  document.getElementById('coachChatPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ===== AI COACH INSIGHT CARD (LLM-narrated, deterministic facts) =====
const loadCoachInsight = async () => {
  const card = document.getElementById('coachInsightCard');
  if (!card) return;
  try {
    const data = await aiAPI.coachInsight();
    if (!data.configured || !data.insight) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    document.getElementById('coachInsightText').textContent = data.insight;
  } catch (err) {
    card.style.display = 'none';
  }
};

// ===== FREE-FORM AI COACH CHAT =====
const initCoachChatUi = async () => {
  try {
    const status = await aiAPI.status();
    const panel = document.getElementById('coachChatPanel');
    const notice = document.getElementById('coachChatUnconfiguredNotice');
    if (!panel) return;
    if (status.llmConfigured) {
      if (notice) notice.style.display = 'none';
    } else if (notice) {
      notice.style.display = '';
    }
  } catch (err) {
    // non-critical
  }
};

const appendCoachChatMessage = (text, sender) => {
  const container = document.getElementById('coachChatMessages');
  if (!container) return;
  const msg = document.createElement('div');
  msg.className = `doubt-msg doubt-msg-${sender}`;
  msg.innerHTML = escHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
};

const sendCoachChatMessage = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('coachChatInput');
  const message = input.value.trim();
  if (!message) return;

  appendCoachChatMessage(message, 'user');
  input.value = '';
  coachHistory.push({ role: 'user', content: message });

  const typing = document.createElement('div');
  typing.className = 'doubt-msg doubt-msg-bot doubt-msg-typing';
  typing.textContent = 'Thinking…';
  document.getElementById('coachChatMessages').appendChild(typing);
  typing.scrollIntoView({ block: 'end' });

  try {
    const result = await aiAPI.coach(message, coachHistory);
    typing.remove();
    const replyText = result.reply;
    appendCoachChatMessage(replyText, 'bot');
    if (result.source === 'llm') coachHistory.push({ role: 'assistant', content: replyText });
  } catch (err) {
    typing.remove();
    appendCoachChatMessage("Sorry, I couldn't reach the AI coach just now. Please try again in a moment.", 'bot');
  }
};
