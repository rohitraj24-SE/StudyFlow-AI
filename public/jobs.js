// ===== JOB TRACKER (KANBAN BOARD) =====
let allJobs = [];
let draggedJobId = null;

const KANBAN_STATUSES = ['Applied', 'Assessment', 'Interview', 'Offer', 'Rejected'];

const loadJobs = async () => {
  renderCareerReadiness();
  try {
    const [jobs, stats] = await Promise.all([jobsAPI.getAll(), jobsAPI.stats()]);
    allJobs = jobs;
    renderJobKpis(stats);
    renderKanban();
  } catch (err) {
    console.error(err);
    toast('Failed to load job applications', 'error');
  }
};

// ===== PHASE 14: CAREER READINESS =====
// Real data only: per-subject test accuracy (Phase 10) and interview-prep
// completion (planner sessions synced from a job's prep plan). Shows
// nothing invented - a subject with no test attempts simply doesn't
// appear, and interview-prep readiness is hidden entirely until a prep
// plan has actually been synced to the planner.
const renderCareerReadiness = async () => {
  const body = document.getElementById('careerReadinessBody');
  if (!body) return;
  try {
    const data = await jobsAPI.careerReadiness();

    if (!data.skillReadiness.length && !data.interviewPrepReadiness) {
      body.innerHTML = `<p class="ai-subtitle">Take a few practice tests (Practice tab) and sync an interview prep plan to see your real readiness here.</p>`;
      return;
    }

    const skillBars = data.skillReadiness.map((s) => `
      <div class="readiness-row">
        <span class="readiness-label">${escHtml(s.subject)}</span>
        <div class="readiness-track"><div class="readiness-fill" style="width:${s.accuracy}%"></div></div>
        <span class="readiness-pct">${s.accuracy}%</span>
      </div>
    `).join('');

    const prep = data.interviewPrepReadiness;
    const prepHtml = prep ? `
      <div class="readiness-row">
        <span class="readiness-label">Interview Prep</span>
        <div class="readiness-track"><div class="readiness-fill prep" style="width:${prep.percent}%"></div></div>
        <span class="readiness-pct">${prep.completed}/${prep.total}</span>
      </div>
    ` : '';

    body.innerHTML = `
      ${skillBars}
      ${prepHtml}
      ${data.recommendation ? `
        <div class="readiness-recommendation">
          <span>💡 ${escHtml(data.recommendation)}</span>
          <button class="btn-secondary" onclick="switchTab('practiceTab')">Practice Now →</button>
        </div>
      ` : ''}
    `;
  } catch (err) {
    body.innerHTML = `<p class="ai-subtitle">Could not load your readiness snapshot right now.</p>`;
  }
};

const renderJobKpis = (stats) => {
  document.getElementById('jobKpiTotal').textContent = stats.total;
  document.getElementById('jobKpiActive').textContent = stats.totalActive;
  document.getElementById('jobKpiInterview').textContent = stats.byStatus.Interview || 0;
  document.getElementById('jobKpiOffer').textContent = stats.byStatus.Offer || 0;
};

const daysUntil = (dateStr) => {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

const jobCardHtml = (job) => {
  let interviewMeta = '';
  if (job.interviewDate) {
    const diff = daysUntil(job.interviewDate);
    const soon = diff >= 0 && diff <= 3;
    const label = diff < 0 ? 'Interview passed' : diff === 0 ? 'Interview today' : diff === 1 ? 'Interview tomorrow' : `Interview in ${diff} days`;
    interviewMeta = `<div class="kanban-card-meta ${soon ? 'interview-soon' : ''}">🗓️ ${label} (${new Date(job.interviewDate).toLocaleDateString()})</div>`;
  }
  if (job.location) interviewMeta += `<div class="kanban-card-meta">📍 ${escHtml(job.location)}</div>`;

  const hasPrepPlan = job.prepPlan && job.prepPlan.length > 0;

  return `
    <div class="kanban-card" draggable="true" data-job-id="${job._id}"
      ondragstart="handleJobDragStart(event, '${job._id}')" ondragend="handleJobDragEnd(event)">
      <div class="kanban-card-company">${escHtml(job.company)}</div>
      <div class="kanban-card-role">${escHtml(job.role)}</div>
      ${interviewMeta}
      <div class="kanban-card-actions">
        ${job.link ? `<a class="kanban-mini-btn" href="${escHtml(job.link)}" target="_blank" rel="noopener">🔗 Posting</a>` : ''}
        ${job.interviewDate && !hasPrepPlan ? `<button class="kanban-mini-btn" onclick="generatePrep('${job._id}')">🗓️ Generate Prep Plan</button>` : ''}
        ${job.interviewDate ? `<button class="kanban-mini-btn" onclick="openPrepConfig('${job._id}')">🎯 Customize Prep</button>` : ''}
        ${hasPrepPlan ? `<button class="kanban-mini-btn" onclick="viewPrepPlan('${job._id}')">📋 View Prep Plan</button>` : ''}
        <button class="kanban-mini-btn danger" onclick="deleteJob('${job._id}')">🗑️ Delete</button>
      </div>
    </div>
  `;
};

const renderKanban = () => {
  for (const status of KANBAN_STATUSES) {
    const jobsInStatus = allJobs.filter((j) => j.status === status);
    const zone = document.getElementById(`kanban${status}`);
    const countEl = document.getElementById(`kanbanCount${status}`);
    if (countEl) countEl.textContent = jobsInStatus.length;
    if (zone) {
      zone.innerHTML = jobsInStatus.length
        ? jobsInStatus.map(jobCardHtml).join('')
        : '<div class="week-day-empty">No applications</div>';
    }
  }
};

// ===== ADD JOB =====
const addJob = async () => {
  const company = document.getElementById('jobCompany').value.trim();
  const role = document.getElementById('jobRole').value.trim();
  const status = document.getElementById('jobStatus').value;
  const appliedDate = document.getElementById('jobDate').value || new Date().toISOString().split('T')[0];
  const interviewDate = document.getElementById('jobInterviewDate').value || null;
  const link = document.getElementById('jobLink').value.trim();
  const location = document.getElementById('jobLocation').value.trim();
  const notes = document.getElementById('jobNotes').value.trim();

  if (!company) { toast('Please enter a company name', 'error'); return; }
  if (!role) { toast('Please enter a role', 'error'); return; }

  const btn = document.getElementById('jobAddBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Adding...';

  try {
    const job = await jobsAPI.create({ company, role, status, appliedDate, interviewDate, link, location, notes });
    allJobs.unshift(job);
    renderKanban();
    const stats = await jobsAPI.stats();
    renderJobKpis(stats);

    document.getElementById('jobCompany').value = '';
    document.getElementById('jobRole').value = '';
    document.getElementById('jobLink').value = '';
    document.getElementById('jobLocation').value = '';
    document.getElementById('jobNotes').value = '';
    document.getElementById('jobDate').value = '';
    document.getElementById('jobInterviewDate').value = '';
    document.getElementById('jobStatus').value = 'Applied';

    toast('Application added! 💼', 'success');
    if (typeof notifyBrowser === 'function') {
      notifyBrowser('💼 New application tracked', `${company} — ${role} added to your Job Tracker`);
    }
  } catch (err) {
    toast(err.message || 'Failed to add application', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '+ Add Application';
  }
};

// ===== DRAG AND DROP (Kanban status changes) =====
const handleJobDragStart = (e, jobId) => {
  draggedJobId = jobId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
};

const handleJobDragEnd = (e) => {
  e.target.classList.remove('dragging');
  draggedJobId = null;
};

// Wire up dropzone listeners once the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.kanban-dropzone').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const newStatus = zone.dataset.status;
      if (!draggedJobId || !newStatus) return;
      await moveJobToStatus(draggedJobId, newStatus);
    });
  });
});

const moveJobToStatus = async (jobId, newStatus) => {
  const job = allJobs.find((j) => j._id === jobId);
  if (!job || job.status === newStatus) return;
  try {
    const result = await jobsAPI.update(jobId, { status: newStatus });
    const idx = allJobs.findIndex((j) => j._id === jobId);
    if (idx !== -1) allJobs[idx] = result.job;
    renderKanban();
    const stats = await jobsAPI.stats();
    renderJobKpis(stats);
    toast(`${job.company} moved to ${newStatus}`, 'info');
  } catch (err) {
    toast('Failed to update status', 'error');
  }
};

const deleteJob = async (id) => {
  if (!confirm('Delete this application?')) return;
  try {
    await jobsAPI.delete(id);
    allJobs = allJobs.filter((j) => j._id !== id);
    renderKanban();
    const stats = await jobsAPI.stats();
    renderJobKpis(stats);
    toast('Application deleted', 'info');
  } catch (err) {
    toast('Failed to delete application', 'error');
  }
};

// ===== INTERVIEW PREP PLAN =====
const generatePrep = async (jobId) => {
  try {
    const job = await jobsAPI.generatePrepPlan(jobId);
    const idx = allJobs.findIndex((j) => j._id === jobId);
    if (idx !== -1) allJobs[idx] = job;
    renderKanban();
    toast('Interview prep plan generated! 🗓️', 'success');
    viewPrepPlan(jobId);
  } catch (err) {
    toast(err.message || 'Failed to generate prep plan', 'error');
  }
};

const viewPrepPlan = (jobId) => {
  const job = allJobs.find((j) => j._id === jobId);
  if (!job) return;

  const body = document.getElementById('prepPlanBody');
  const interviewDateStr = job.interviewDate ? new Date(job.interviewDate).toDateString() : '';

  const items = (job.prepPlan || []).map((item) => {
    const isInterviewDay = item.topic === 'Interview Day';
    const dateLabel = new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return `
      <div class="prep-plan-item ${isInterviewDay ? 'is-interview-day' : ''}">
        <span class="prep-plan-day">${dateLabel}</span>
        <span class="prep-plan-topic">${escHtml(item.topic)}</span>
      </div>
    `;
  }).join('');

  const allSynced = (job.prepPlan || []).every((i) => i.addedToPlanner);

  body.innerHTML = `
    <p class="ai-subtitle">Prep plan for <strong>${escHtml(job.company)}</strong> — ${escHtml(job.role)} (interview ${interviewDateStr}).</p>
    <div class="prep-plan-list">${items || '<div class="ai-loading">No plan generated yet.</div>'}</div>
    <button class="btn-add" style="margin-top:16px" onclick="syncPrepToPlanner('${job._id}')" ${allSynced ? 'disabled' : ''}>
      ${allSynced ? '✅ Already synced to Planner' : '📅 Sync to Planner'}
    </button>
  `;

  document.getElementById('prepPlanModal').classList.add('show');
};

const syncPrepToPlanner = async (jobId) => {
  try {
    const result = await jobsAPI.syncPrepPlanToPlanner(jobId);
    const idx = allJobs.findIndex((j) => j._id === jobId);
    if (idx !== -1) allJobs[idx] = result.job;
    toast(`Added ${result.sessionsCreated} prep session${result.sessionsCreated !== 1 ? 's' : ''} to your Planner! 📅`, 'success');
    viewPrepPlan(jobId);
  } catch (err) {
    toast(err.message || 'Failed to sync to planner', 'error');
  }
};

const closePrepPlanModal = () => {
  document.getElementById('prepPlanModal').classList.remove('show');
};

const closePrepPlanModalIfOverlay = (e) => {
  if (e.target.id === 'prepPlanModal') closePrepPlanModal();
};

// ===== CUSTOM INTERVIEW PREPARATION (role, topic checklist, AI suggestion) =====
// Feature #4: the original fixed DSA/CS curriculum (generatePrep above)
// still works untouched. This adds an opt-in customization layer per job
// application - role selection, editable topic checklist grouped by
// category, custom topics, and an optional AI-prioritized suggestion the
// user must explicitly accept before it affects anything.

let roleCurriculaCache = null;
let prepConfigState = null; // { jobId, targetRole, experienceLevel, dailyPrepMinutes, topics: [{name, category, selected, custom, difficulty, priority}] }

const getRoleCurricula = async () => {
  if (roleCurriculaCache) return roleCurriculaCache;
  const data = await jobsAPI.roleTemplates();
  roleCurriculaCache = data.curricula;
  return roleCurriculaCache;
};

const templateTopicsForRole = (curricula, role) => {
  const roleMap = curricula[role] || Object.values(curricula)[0];
  const topics = [];
  Object.entries(roleMap).forEach(([category, names]) => {
    names.forEach((name) => topics.push({ name, category, selected: true, custom: false, difficulty: 'Medium', priority: 'Medium' }));
  });
  return topics;
};

const openPrepConfig = async (jobId) => {
  const job = allJobs.find((j) => j._id === jobId);
  if (!job) return;

  const curricula = await getRoleCurricula();
  const existing = job.prepConfig;
  const targetRole = (existing && existing.targetRole) || 'Software Developer';

  prepConfigState = {
    jobId,
    targetRole,
    experienceLevel: (existing && existing.experienceLevel) || 'Fresher',
    dailyPrepMinutes: (existing && existing.dailyPrepMinutes) || 90,
    topics: existing && existing.topics && existing.topics.length ? existing.topics.map((t) => ({ ...t })) : templateTopicsForRole(curricula, targetRole),
  };

  renderPrepConfigModal(curricula);
  document.getElementById('prepConfigModal').classList.add('show');
};

const closePrepConfigModal = () => document.getElementById('prepConfigModal').classList.remove('show');
const closePrepConfigModalIfOverlay = (e) => {
  if (e.target.id === 'prepConfigModal') closePrepConfigModal();
};

const changePrepConfigRole = async (role) => {
  const curricula = await getRoleCurricula();
  const customTopics = prepConfigState.topics.filter((t) => t.custom);
  prepConfigState.targetRole = role;
  prepConfigState.topics = [...templateTopicsForRole(curricula, role), ...customTopics];
  renderPrepConfigModal(curricula);
};

const toggleConfigTopic = (name, checked) => {
  const topic = prepConfigState.topics.find((t) => t.name === name);
  if (topic) topic.selected = checked;
};

const addCustomConfigTopic = () => {
  const nameInput = document.getElementById('customTopicName');
  const categoryInput = document.getElementById('customTopicCategory');
  const difficultySelect = document.getElementById('customTopicDifficulty');
  const prioritySelect = document.getElementById('customTopicPriority');

  const name = nameInput.value.trim();
  if (!name) { toast('Enter a topic name first', 'error'); return; }

  prepConfigState.topics.push({
    name,
    category: categoryInput.value.trim() || 'Custom',
    selected: true,
    custom: true,
    difficulty: difficultySelect.value,
    priority: (prioritySelect && prioritySelect.value) || 'Medium',
  });

  nameInput.value = '';
  categoryInput.value = '';
  getRoleCurricula().then(renderPrepConfigModal);
};

const removeConfigTopic = (name) => {
  prepConfigState.topics = prepConfigState.topics.filter((t) => t.name !== name);
  getRoleCurricula().then(renderPrepConfigModal);
};

const renderPrepConfigModal = (curricula) => {
  const body = document.getElementById('prepConfigBody');
  const roles = Object.keys(curricula);

  const grouped = {};
  prepConfigState.topics.forEach((t) => {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  });

  const topicChecklistHtml = Object.entries(grouped).map(([category, topics]) => `
    <div class="topic-category-group">
      <div class="topic-category-title">${escHtml(category)}</div>
      ${topics.map((t) => `
        <label class="topic-checkbox-row">
          <input type="checkbox" ${t.selected ? 'checked' : ''} onchange="toggleConfigTopic('${escHtml(t.name).replace(/'/g, "\\'")}', this.checked)" />
          <span>${escHtml(t.name)}</span>
          ${t.custom ? `<button type="button" class="topic-remove-btn" onclick="removeConfigTopic('${escHtml(t.name).replace(/'/g, "\\'")}')" title="Remove custom topic">✕</button>` : ''}
        </label>
      `).join('')}
    </div>
  `).join('');

  const aiSuggestion = (allJobs.find((j) => j._id === prepConfigState.jobId) || {}).prepConfig?.aiSuggestion;

  body.innerHTML = `
    <div class="prep-config-grid">
      <div>
        <label>Target Role</label>
        <select class="job-status-select" onchange="changePrepConfigRole(this.value)">
          ${roles.map((r) => `<option value="${escHtml(r)}" ${r === prepConfigState.targetRole ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Experience</label>
        <select class="job-status-select" id="prepConfigExperience">
          ${['Fresher', 'Junior', 'Mid-level', 'Senior'].map((lvl) => `<option value="${lvl}" ${lvl === prepConfigState.experienceLevel ? 'selected' : ''}>${lvl}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Daily Prep Time (minutes)</label>
        <input type="number" class="planner-input" id="prepConfigMinutes" value="${prepConfigState.dailyPrepMinutes}" min="15" step="15" />
      </div>
    </div>

    <div class="topic-checklist">${topicChecklistHtml}</div>

    <div class="custom-topic-row">
      <input type="text" id="customTopicName" class="planner-input" placeholder="Custom topic (e.g., JWT Authentication)" />
      <input type="text" id="customTopicCategory" class="planner-input" placeholder="Category (e.g., Backend)" />
      <select id="customTopicDifficulty" class="job-status-select">
        <option value="Easy">Easy</option>
        <option value="Medium" selected>Medium</option>
        <option value="Hard">Hard</option>
      </select>
      <select id="customTopicPriority" class="job-status-select">
        <option value="High">High priority</option>
        <option value="Medium" selected>Medium priority</option>
        <option value="Low">Low priority</option>
      </select>
      <button type="button" class="kanban-mini-btn" onclick="addCustomConfigTopic()">+ Add Custom Topic</button>
    </div>

    ${aiSuggestion && aiSuggestion.text ? `
      <div class="ai-suggestion-box">
        <div class="ai-suggestion-title">🤖 AI Recommendation ${aiSuggestion.status === 'accepted' ? '· Accepted' : aiSuggestion.status === 'rejected' ? '· Rejected' : '· Pending your review'}</div>
        <pre class="ai-suggestion-text">${escHtml(aiSuggestion.text)}</pre>
        ${aiSuggestion.status === 'pending' ? `
          <div class="ai-card-actions">
            <button class="ai-action-btn" onclick="resolveSuggestion('accept')">Accept</button>
            <button class="ai-action-btn ai-action-secondary" onclick="resolveSuggestion('reject')">Reject</button>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div class="prep-config-actions">
      <button class="btn-secondary" onclick="getAiCurriculumSuggestion()">🤖 Get AI Suggestion</button>
      <button class="btn-add" onclick="saveAndGenerateCustomPlan()">✨ Generate My Interview Plan</button>
    </div>
  `;
};

const collectPrepConfigFormValues = () => {
  prepConfigState.experienceLevel = document.getElementById('prepConfigExperience').value;
  prepConfigState.dailyPrepMinutes = parseInt(document.getElementById('prepConfigMinutes').value, 10) || 90;
};

const savePrepConfig = async () => {
  collectPrepConfigFormValues();
  const job = await jobsAPI.savePrepConfig(prepConfigState.jobId, {
    targetRole: prepConfigState.targetRole,
    experienceLevel: prepConfigState.experienceLevel,
    dailyPrepMinutes: prepConfigState.dailyPrepMinutes,
    topics: prepConfigState.topics,
  });
  const idx = allJobs.findIndex((j) => j._id === prepConfigState.jobId);
  if (idx !== -1) allJobs[idx] = job;
  return job;
};

const getAiCurriculumSuggestion = async () => {
  try {
    await savePrepConfig();
    const { job } = await jobsAPI.requestAiSuggestion(prepConfigState.jobId);
    const idx = allJobs.findIndex((j) => j._id === prepConfigState.jobId);
    if (idx !== -1) allJobs[idx] = job;
    toast('AI suggestion generated — review it below', 'success');
    const curricula = await getRoleCurricula();
    renderPrepConfigModal(curricula);
  } catch (err) {
    toast(err.message || 'Failed to get AI suggestion', 'error');
  }
};

const resolveSuggestion = async (action) => {
  try {
    const job = await jobsAPI.resolveAiSuggestion(prepConfigState.jobId, action);
    const idx = allJobs.findIndex((j) => j._id === prepConfigState.jobId);
    if (idx !== -1) allJobs[idx] = job;
    toast(action === 'accept' ? 'Suggestion accepted — adjust priorities below if you agree' : 'Suggestion dismissed', 'info');
    const curricula = await getRoleCurricula();
    renderPrepConfigModal(curricula);
  } catch (err) {
    toast('Failed to update suggestion', 'error');
  }
};

const saveAndGenerateCustomPlan = async () => {
  try {
    await savePrepConfig();
    const job = await jobsAPI.generateCustomPrepPlan(prepConfigState.jobId);
    const idx = allJobs.findIndex((j) => j._id === prepConfigState.jobId);
    if (idx !== -1) allJobs[idx] = job;
    renderKanban();
    closePrepConfigModal();
    toast('Custom interview prep plan generated! 🎯', 'success');
    viewPrepPlan(prepConfigState.jobId);
  } catch (err) {
    toast(err.message || 'Failed to generate custom plan', 'error');
  }
};
