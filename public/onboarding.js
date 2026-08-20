// ===== PHASE 1: UNIVERSAL STUDENT PROFILE — ADAPTIVE ONBOARDING WIZARD =====
// One wizard, dynamically reshaped per education level. Nothing irrelevant
// is ever shown: a school student never sees "branch", a competitive-exam
// aspirant never sees "class". State lives in `wizardState` until the final
// step, when it's PUT to /api/profile in one call.

const EDUCATION_LEVELS = [
  { id: 'school', icon: '🎒', label: 'School', hint: 'Class 6 – 12' },
  { id: 'pu', icon: '📘', label: 'PU / Junior College', hint: '11th – 12th / Class XI–XII' },
  { id: 'undergraduate', icon: '🎓', label: 'Undergraduate', hint: 'Any year, any branch' },
  { id: 'postgraduate', icon: '🎓', label: 'Postgraduate', hint: "Master's / M.Tech / MBA etc." },
  { id: 'competitive', icon: '🏆', label: 'Competitive Exam', hint: 'JEE, NEET, CAT, GATE...' },
  { id: 'government', icon: '🏛️', label: 'Government Exam', hint: 'UPSC, SSC, Banking, State PSC...' },
  { id: 'other', icon: '🧭', label: 'Other', hint: 'Self-learner / other path' },
];

const LEARNING_PREFS = ['Visual (diagrams/videos)', 'Reading & writing', 'Practice-based (solving problems)', 'Video lectures', 'Group study', 'Listening / audio'];
const STUDY_TIMES = [
  { id: 'early-morning', label: 'Early morning (5–8am)' },
  { id: 'morning', label: 'Morning (8–12pm)' },
  { id: 'afternoon', label: 'Afternoon (12–5pm)' },
  { id: 'evening', label: 'Evening (5–9pm)' },
  { id: 'night', label: 'Night (9pm–12am)' },
  { id: 'late-night', label: 'Late night (12am+)' },
];

let wizardStep = 1;
const TOTAL_STEPS = 5;
let wizardMode = 'onboarding'; // 'onboarding' (first-time, from signup/login) or 'edit' (Profile tab)
let wizardState = {
  educationLevel: '', schoolClass: '', year: '', semester: '', branch: '', department: '', stream: '',
  institution: '', subjects: [], academicGoals: '', careerGoals: '', targetExam: '', targetDate: '',
  dailyStudyMinutes: 120, preferredStudyTime: '', strengths: [], weakAreas: [], learningPreferences: [],
};

const startOnboarding = () => {
  wizardStep = 1;
  wizardMode = 'onboarding';
  wizardState = { ...wizardState, educationLevel: '', subjects: [], strengths: [], weakAreas: [], learningPreferences: [] };
  showPage('onboardingPage');
  renderWizard();
};

// Reuses the same wizard to let a student update an already-completed
// profile from the Profile tab (Phase 21 "Edit profile"). Prefills every
// field from their existing saved profile instead of starting blank, and
// returns to the Profile tab on finish instead of the dashboard.
const startProfileEdit = (existingProfile) => {
  wizardStep = 1;
  wizardMode = 'edit';
  wizardState = {
    educationLevel: '', schoolClass: '', year: '', semester: '', branch: '', department: '', stream: '',
    institution: '', subjects: [], academicGoals: '', careerGoals: '', targetExam: '', targetDate: '',
    dailyStudyMinutes: 120, preferredStudyTime: '', strengths: [], weakAreas: [], learningPreferences: [],
    ...(existingProfile || {}),
  };
  showPage('onboardingPage');
  renderWizard();
};

const wizardNeeds = () => {
  const lvl = wizardState.educationLevel;
  return {
    class: lvl === 'school',
    yearBranch: lvl === 'undergraduate' || lvl === 'postgraduate',
    stream: lvl === 'pu' || lvl === 'postgraduate',
    institution: ['school', 'pu', 'undergraduate', 'postgraduate'].includes(lvl),
    targetExamEarly: lvl === 'competitive' || lvl === 'government',
    subjects: lvl !== 'competitive' && lvl !== 'government',
  };
};

const renderWizard = () => {
  const root = $('onboardingRoot');
  if (!root) return;
  const pct = Math.round((wizardStep / TOTAL_STEPS) * 100);
  root.innerHTML = `
    <div class="wizard-progress"><div class="wizard-progress-fill" style="width:${pct}%"></div></div>
    <div class="wizard-steplabel">Step ${wizardStep} of ${TOTAL_STEPS}</div>
    <div class="wizard-card">${renderWizardStep()}</div>
    <div class="wizard-nav">
      ${wizardStep > 1 ? `<button class="btn-secondary" onclick="wizardBack()">← Back</button>` : `<span></span>`}
      ${wizardStep < TOTAL_STEPS ? `<button class="btn-primary" onclick="wizardNext()">Continue →</button>` : `<button class="btn-primary" onclick="wizardFinish()">Finish Setup ✓</button>`}
    </div>
    ${wizardStep === 1 && wizardMode === 'onboarding' ? `<button class="wizard-skip" onclick="wizardSkip()">Skip for now</button>` : ''}
    ${wizardMode === 'edit' ? `<button class="wizard-skip" onclick="cancelProfileEdit()">Cancel</button>` : ''}
  `;
};

function renderWizardStep() {
  switch (wizardStep) {
    case 1: return stepEducationLevel();
    case 2: return stepDetails();
    case 3: return stepGoals();
    case 4: return stepHabits();
    case 5: return stepSelfAssessment();
    default: return '';
  }
}

// ===== STEP 1: Education level =====
function stepEducationLevel() {
  return `
    <h2 class="wizard-title">Tell us about your learning journey</h2>
    <p class="wizard-sub">This shapes everything StudyFlow AI shows you — nothing irrelevant, ever.</p>
    <div class="wizard-grid">
      ${EDUCATION_LEVELS.map((lvl) => `
        <button type="button" class="wizard-option-card ${wizardState.educationLevel === lvl.id ? 'active' : ''}" onclick="selectEducationLevel('${lvl.id}')">
          <span class="wizard-option-icon">${lvl.icon}</span>
          <span class="wizard-option-label">${lvl.label}</span>
          <span class="wizard-option-hint">${lvl.hint}</span>
        </button>
      `).join('')}
    </div>
  `;
}
const selectEducationLevel = (id) => { wizardState.educationLevel = id; renderWizard(); };

// ===== STEP 2: Dynamic details =====
function stepDetails() {
  const need = wizardNeeds();
  let fields = '';

  if (need.class) {
    fields += labeledSelect('schoolClass', 'Class', ['6', '7', '8', '9', '10', '11', '12'].map((c) => ({ v: c, l: `Class ${c}` })));
  }
  if (need.yearBranch) {
    fields += labeledSelect('year', wizardState.educationLevel === 'postgraduate' ? 'Year' : 'Year', ['1st', '2nd', '3rd', '4th'].map((y) => ({ v: y, l: y + ' year' })));
    fields += labeledInput('semester', 'Semester (optional)', 'text', 'e.g. 5th Semester');
    fields += labeledInput('branch', 'Branch / Major', 'text', 'e.g. Computer Science, Mechanical...');
    fields += labeledInput('department', 'Department (optional)', 'text', 'e.g. School of Engineering');
  }
  if (need.stream) {
    fields += labeledInput('stream', wizardState.educationLevel === 'pu' ? 'Stream' : 'Specialization', 'text', wizardState.educationLevel === 'pu' ? 'Science / Commerce / Arts' : 'e.g. Data Science, Finance...');
    if (wizardState.educationLevel === 'pu') fields += labeledSelect('year', 'Year', [{ v: '1st', l: '11th / 1st PU' }, { v: '2nd', l: '12th / 2nd PU' }]);
  }
  if (need.targetExamEarly) {
    fields += labeledInput('targetExam', 'Which exam are you preparing for?', 'text', 'e.g. UPSC CSE, SSC CGL, JEE Advanced, CAT...');
  }
  if (need.institution) {
    fields += labeledInput('institution', 'School / College name', 'text', 'Optional, but helps personalize things');
  }
  if (need.subjects) {
    fields += tagInputBlock('subjects', 'Subjects you\'re currently studying', 'Type a subject and press Enter');
  }

  return `
    <h2 class="wizard-title">A few more details</h2>
    <p class="wizard-sub">Only what's relevant to a ${EDUCATION_LEVELS.find((l) => l.id === wizardState.educationLevel)?.label || 'student'} is shown here.</p>
    <div class="wizard-fields">${fields}</div>
  `;
}

// ===== STEP 3: Goals =====
function stepGoals() {
  return `
    <h2 class="wizard-title">What are you working toward?</h2>
    <p class="wizard-sub">Goals power your AI recommendations and countdown reminders.</p>
    <div class="wizard-fields">
      ${labeledTextarea('academicGoals', 'Academic goals', 'e.g. Score above 90% this term, clear all backlogs...')}
      ${labeledTextarea('careerGoals', 'Career goals', 'e.g. Become a software engineer at a product company, join the civil services...')}
      ${wizardNeeds().targetExamEarly ? '' : labeledInput('targetExam', 'Target exam (optional)', 'text', 'e.g. GATE, campus placement, board exams...')}
      ${labeledInput('targetDate', 'Target date (optional)', 'date', '')}
    </div>
  `;
}

// ===== STEP 4: Study habits =====
function stepHabits() {
  return `
    <h2 class="wizard-title">Your study habits</h2>
    <p class="wizard-sub">This sets your daily targets on the Timer and Dashboard tabs.</p>
    <div class="wizard-fields">
      <label class="wizard-label">Daily available study time: <strong>${formatMinutesLabel(wizardState.dailyStudyMinutes)}</strong></label>
      <input type="range" min="15" max="600" step="15" value="${wizardState.dailyStudyMinutes}" class="wizard-range"
        oninput="wizardState.dailyStudyMinutes = parseInt(this.value,10); this.previousElementSibling && null; document.getElementById('dailyMinutesLive').textContent = formatMinutesLabel(this.value);" />
      <div id="dailyMinutesLive" style="display:none">${formatMinutesLabel(wizardState.dailyStudyMinutes)}</div>
      <label class="wizard-label" style="margin-top:20px;">Preferred study time</label>
      <div class="wizard-chip-row">
        ${STUDY_TIMES.map((t) => `<button type="button" class="wizard-chip ${wizardState.preferredStudyTime === t.id ? 'active' : ''}" onclick="wizardState.preferredStudyTime='${t.id}'; renderWizard();">${t.label}</button>`).join('')}
      </div>
    </div>
  `;
}
const formatMinutesLabel = (mins) => {
  mins = parseInt(mins, 10) || 0;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m ? m + 'm' : ''}`.trim() : `${m}m`;
};

// ===== STEP 5: Self-assessment =====
function stepSelfAssessment() {
  return `
    <h2 class="wizard-title">Know yourself as a learner</h2>
    <p class="wizard-sub">Helps StudyFlow AI flag weak areas and tailor how it explains things.</p>
    <div class="wizard-fields">
      ${tagInputBlock('strengths', 'Current strengths', 'e.g. Algebra, Essay writing...')}
      ${tagInputBlock('weakAreas', 'Current weak areas', 'e.g. Organic Chemistry, Public speaking...')}
      <label class="wizard-label" style="margin-top:16px;">How do you learn best? (pick any)</label>
      <div class="wizard-chip-row">
        ${LEARNING_PREFS.map((p) => `<button type="button" class="wizard-chip ${wizardState.learningPreferences.includes(p) ? 'active' : ''}" onclick="toggleLearningPref('${p.replace(/'/g, "\\'")}')">${p}</button>`).join('')}
      </div>
    </div>
  `;
}
const toggleLearningPref = (p) => {
  const i = wizardState.learningPreferences.indexOf(p);
  if (i === -1) wizardState.learningPreferences.push(p); else wizardState.learningPreferences.splice(i, 1);
  renderWizard();
};

// ===== Shared field builders =====
function labeledInput(field, label, type, placeholder) {
  return `
    <div class="wizard-field">
      <label class="wizard-label">${label}</label>
      <input type="${type}" class="wizard-input" value="${(wizardState[field] || '').replace(/"/g, '&quot;')}" placeholder="${placeholder}"
        oninput="wizardState.${field} = this.value" />
    </div>`;
}
function labeledTextarea(field, label, placeholder) {
  return `
    <div class="wizard-field">
      <label class="wizard-label">${label}</label>
      <textarea class="wizard-input wizard-textarea" placeholder="${placeholder}" oninput="wizardState.${field} = this.value">${wizardState[field] || ''}</textarea>
    </div>`;
}
function labeledSelect(field, label, options) {
  return `
    <div class="wizard-field">
      <label class="wizard-label">${label}</label>
      <select class="wizard-input" onchange="wizardState.${field} = this.value">
        <option value="">Select…</option>
        ${options.map((o) => `<option value="${o.v}" ${wizardState[field] === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
      </select>
    </div>`;
}
function tagInputBlock(field, label, placeholder) {
  const tags = wizardState[field] || [];
  return `
    <div class="wizard-field">
      <label class="wizard-label">${label}</label>
      <div class="wizard-tags">
        ${tags.map((t, i) => `<span class="wizard-tag">${escHtml(t)} <span class="wizard-tag-x" onclick="removeTag('${field}', ${i})">×</span></span>`).join('')}
        <input type="text" class="wizard-tag-input" placeholder="${placeholder}" onkeydown="handleTagKey(event, '${field}')" />
      </div>
    </div>`;
}
const handleTagKey = (e, field) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    e.preventDefault();
    wizardState[field].push(e.target.value.trim());
    renderWizard();
  }
};
const removeTag = (field, i) => { wizardState[field].splice(i, 1); renderWizard(); };

// ===== Navigation =====
const wizardNext = () => {
  if (wizardStep === 1 && !wizardState.educationLevel) { toast('Please select an education level to continue', 'error'); return; }
  wizardStep = Math.min(TOTAL_STEPS, wizardStep + 1);
  renderWizard();
};
const wizardBack = () => { wizardStep = Math.max(1, wizardStep - 1); renderWizard(); };
const wizardSkip = () => finishOnboarding({});
const cancelProfileEdit = () => { showPage('appPage'); switchTab('profileTab'); };

const wizardFinish = () => finishOnboarding(wizardState);

async function finishOnboarding(state) {
  try {
    const payload = { ...state, completeOnboarding: true };
    const updatedUser = await profileAPI.save(payload);
    setAuth(getToken(), updatedUser);

    if (wizardMode === 'edit') {
      toast('Profile updated ✓', 'success');
      showPage('appPage');
      switchTab('profileTab');
      return;
    }

    toast('Profile set up! Welcome to StudyFlow AI 🎉', 'success');
    showPage('appPage');
    initApp();
  } catch (err) {
    toast(err.message || 'Could not save your profile — try again', 'error');
  }
}
