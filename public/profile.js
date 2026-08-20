// ===== PHASE 21: STUDENT PROFILE TAB =====
// Reads the profile saved by the Phase 1 onboarding wizard (server-side,
// via profileAPI) plus the user's gamification/analytics stats, and renders
// a full read view with inline editors for the two list fields (skills,
// career interests) that the wizard itself doesn't collect. "Edit profile"
// re-opens the same wizard used at onboarding, prefilled (see startProfileEdit
// in onboarding.js).

const EDUCATION_LEVEL_LABELS = {
  school: '🎒 School',
  pu: '📘 PU / Junior College',
  undergraduate: '🎓 Undergraduate',
  postgraduate: '🎓 Postgraduate',
  competitive: '🏆 Competitive Exam',
  government: '🏛️ Government Exam',
  other: '🧭 Self-directed learner',
};

const STUDY_TIME_LABELS = {
  'early-morning': 'Early morning (5–8am)',
  morning: 'Morning (8–12pm)',
  afternoon: 'Afternoon (12–5pm)',
  evening: 'Evening (5–9pm)',
  night: 'Night (9pm–12am)',
  'late-night': 'Late night (12am+)',
};

let profileCache = null;

const renderProfileTab = async () => {
  const root = $('profileRoot');
  if (!root) return;
  root.innerHTML = `<p class="profile-empty">Loading your profile…</p>`;

  let profile = {};
  let user = getUser();
  let facts = null;
  let summary = null;

  try {
    profile = await profileAPI.get();
  } catch (err) {
    root.innerHTML = `<p class="profile-empty">Could not load your profile right now. Try refreshing.</p>`;
    return;
  }
  profileCache = profile || {};

  // Best-effort extras - a failure here shouldn't block the rest of the page.
  try { user = await authAPI.me(); setAuth(getToken(), user); } catch (err) { /* keep cached user */ }
  try { const overview = await analyticsAPI.overview(); facts = overview; } catch (err) { /* skip stats card */ }
  try { const res = await profileAPI.summary(); summary = res.summary; } catch (err) { /* skip AI summary card */ }

  root.innerHTML = renderProfilePage(profileCache, user, facts, summary);
};

function renderProfilePage(profile, user, facts, summary) {
  const name = user?.name || 'Student';
  const initial = name.trim().charAt(0).toUpperCase() || '🎓';
  const levelLabel = EDUCATION_LEVEL_LABELS[profile.educationLevel] || 'Education not set yet';

  return `
    <div class="profile-header-card">
      <div class="profile-header-id">
        <div class="profile-avatar">${initial}</div>
        <div>
          <h3>${escHtml(name)} ${user ? `<span class="profile-level-chip">Lv ${user.level || 1}</span>` : ''}</h3>
          <p>${levelLabel}${profile.institution ? ` · ${escHtml(profile.institution)}` : ''}</p>
        </div>
      </div>
      <button class="btn-primary" style="width:auto;margin:0" onclick="startProfileEdit(profileCache)">✏️ Edit Profile</button>
    </div>

    ${!profile.onboardingCompleted ? `
      <div class="profile-incomplete-card">
        <span>Your profile isn't fully set up yet — finish it so StudyFlow AI can tailor your plan, recommendations, and summary.</span>
        <button class="btn-secondary" style="width:auto;margin:0" onclick="startOnboarding()">Complete Setup →</button>
      </div>
    ` : ''}

    <div class="profile-summary-card">
      <h4>✨ AI Student Summary</h4>
      <p>${summary ? escHtml(summary) : 'Complete your profile and log a few study sessions to unlock a personalized AI summary here.'}</p>
    </div>

    <div class="profile-grid">
      <div class="profile-card">
        <h4>🎓 Education</h4>
        ${factRows([
          ['Level', EDUCATION_LEVEL_LABELS[profile.educationLevel]?.replace(/^\S+\s/, '') || '—'],
          profile.schoolClass && ['Class', profile.schoolClass],
          profile.year && ['Year', profile.year],
          profile.semester && ['Semester', profile.semester],
          profile.branch && ['Branch', profile.branch],
          profile.department && ['Department', profile.department],
          profile.stream && ['Stream', profile.stream],
          profile.institution && ['Institution', profile.institution],
        ])}
      </div>

      <div class="profile-card">
        <h4>🎯 Goals & Exams</h4>
        ${factRows([
          profile.targetExam && ['Target exam', profile.targetExam],
          profile.targetDate && ['Target date', profile.targetDate],
          profile.careerGoals && ['Career goal', profile.careerGoals],
          profile.academicGoals && ['Academic goal', profile.academicGoals],
          profile.dailyStudyMinutes && ['Daily study time', `${Math.round(profile.dailyStudyMinutes / 60 * 10) / 10} hrs/day`],
          profile.preferredStudyTime && ['Preferred time', STUDY_TIME_LABELS[profile.preferredStudyTime] || profile.preferredStudyTime],
        ]) || `<p class="profile-empty">No goals set yet — add them via Edit Profile.</p>`}
      </div>

      <div class="profile-card">
        <h4>📚 Subjects</h4>
        ${chipRow(profile.subjects, 'profile-chip')}
      </div>

      <div class="profile-card">
        <h4>💪 Strengths &amp; Weak Areas</h4>
        <div class="profile-chip-row" style="margin-bottom:${profile.weakAreas?.length ? '10px' : '0'}">
          ${(profile.strengths || []).map((s) => `<span class="profile-chip strength">${escHtml(s)}</span>`).join('')}
        </div>
        <div class="profile-chip-row">
          ${(profile.weakAreas || []).map((s) => `<span class="profile-chip weak">${escHtml(s)}</span>`).join('')}
        </div>
        ${!(profile.strengths?.length || profile.weakAreas?.length) ? `<p class="profile-empty">Not set yet.</p>` : ''}
      </div>

      <div class="profile-card">
        <h4>📊 Study Statistics</h4>
        <div class="profile-stats-grid">
          <div class="profile-stat"><div class="profile-stat-value">${facts ? facts.completionRate + '%' : '—'}</div><div class="profile-stat-label">Completion rate</div></div>
          <div class="profile-stat"><div class="profile-stat-value">${user?.totalSessionsCompleted ?? 0}</div><div class="profile-stat-label">Sessions done</div></div>
          <div class="profile-stat"><div class="profile-stat-value">${formatStudyHours(user?.totalMinutesStudied)}</div><div class="profile-stat-label">Total studied</div></div>
          <div class="profile-stat"><div class="profile-stat-value">🔥 ${user?.streak ?? 0}</div><div class="profile-stat-label">Day streak</div></div>
        </div>
        ${user ? `
          <div class="profile-xp-track"><div class="profile-xp-fill" style="width:${user.xpNeeded ? Math.round((user.xpIntoLevel / user.xpNeeded) * 100) : 0}%"></div></div>
          <div class="profile-xp-label">Level ${user.level} · ${user.xpIntoLevel}/${user.xpNeeded} XP to next level</div>
        ` : ''}
      </div>

      <div class="profile-card">
        <h4>🏆 Achievements</h4>
        <div class="profile-chip-row">
          ${(user?.badges || []).length
            ? user.badges.map((id) => {
                const b = (typeof BADGE_CATALOG !== 'undefined' ? BADGE_CATALOG : []).find((x) => x.id === id);
                return b ? `<span class="profile-chip">${b.emoji} ${escHtml(b.label)}</span>` : '';
              }).join('')
            : `<p class="profile-empty">No badges yet — complete study sessions to earn your first one.</p>`}
        </div>
        <button class="btn-secondary" style="width:auto;margin-top:12px" onclick="switchTab('achievementsTab')">View all badges →</button>
      </div>

      <div class="profile-card">
        <h4>🛠️ Skills</h4>
        ${editableChipRow(profile.skills, 'skills')}
        ${tagEditor('skills', 'Add a skill (e.g. Python, Public Speaking)')}
      </div>

      <div class="profile-card">
        <h4>🧭 Career Interests</h4>
        ${editableChipRow(profile.careerInterests, 'careerInterests')}
        ${tagEditor('careerInterests', 'Add an interest (e.g. Data Science, UPSC)')}
      </div>

      <div class="profile-card">
        <h4>🧠 Learning Preferences</h4>
        ${chipRow(profile.learningPreferences, 'profile-chip')}
      </div>
    </div>
  `;
}

function factRows(pairs) {
  const rows = pairs.filter(Boolean);
  if (!rows.length) return '';
  return rows.map(([label, value]) => `
    <div class="profile-fact-row"><span>${escHtml(label)}</span><span>${escHtml(String(value))}</span></div>
  `).join('');
}

function chipRow(list, cls) {
  if (!list || !list.length) return `<p class="profile-empty">None added yet.</p>`;
  return `<div class="profile-chip-row">${list.map((v) => `<span class="${cls}">${escHtml(v)}</span>`).join('')}</div>`;
}

function editableChipRow(list, field) {
  if (!list || !list.length) return `<p class="profile-empty">None added yet.</p>`;
  return `<div class="wizard-tag-list">${list.map((v, i) => `
    <span class="wizard-tag">${escHtml(v)} <button type="button" onclick="removeProfileTag('${field}',${i})" title="Remove">✕</button></span>
  `).join('')}</div>`;
}

function tagEditor(field, placeholder) {
  const inputId = `profileTagInput_${field}`;
  return `
    <div class="profile-tag-editor">
      <input type="text" id="${inputId}" placeholder="${placeholder}" onkeydown="if(event.key==='Enter'){event.preventDefault();addProfileTag('${field}','${inputId}');}" />
      <button type="button" onclick="addProfileTag('${field}','${inputId}')">Add</button>
    </div>
  `;
}

async function addProfileTag(field, inputId) {
  const input = $(inputId);
  const value = (input?.value || '').trim();
  if (!value) return;

  const current = (profileCache && profileCache[field]) || [];
  if (current.some((v) => v.toLowerCase() === value.toLowerCase())) {
    if (input) input.value = '';
    return;
  }
  const updated = [...current, value];

  try {
    const updatedUser = await profileAPI.save({ [field]: updated });
    setAuth(getToken(), updatedUser);
    profileCache = { ...profileCache, [field]: updated };
    renderProfileTab();
  } catch (err) {
    toast(err.message || 'Could not save — try again', 'error');
  }
}

async function removeProfileTag(field, index) {
  const current = (profileCache && profileCache[field]) || [];
  const updated = current.filter((_, i) => i !== index);
  try {
    const updatedUser = await profileAPI.save({ [field]: updated });
    setAuth(getToken(), updatedUser);
    profileCache = { ...profileCache, [field]: updated };
    renderProfileTab();
  } catch (err) {
    toast(err.message || 'Could not save — try again', 'error');
  }
}

function formatStudyHours(totalMinutes) {
  const mins = totalMinutes || 0;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs === 0) return `${rem}m`;
  return `${hrs}h ${rem}m`;
}
