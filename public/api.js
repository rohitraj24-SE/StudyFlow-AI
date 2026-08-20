// ===== API CONFIGURATION =====
// BUG FIX: the original app hardcoded `http://localhost:5000/api`, which only
// ever worked when running the backend locally. Since the frontend and API
// are now served from the same origin (both locally and on Vercel), we use a
// relative path instead - it just works everywhere.
const API_BASE = '/api';

// ===== TOKEN HELPERS =====
const getToken = () => localStorage.getItem('ssp_token');
const getUser = () => JSON.parse(localStorage.getItem('ssp_user') || 'null');
const setAuth = (token, user) => {
  localStorage.setItem('ssp_token', token);
  localStorage.setItem('ssp_user', JSON.stringify(user));
};
const clearAuth = () => {
  localStorage.removeItem('ssp_token');
  localStorage.removeItem('ssp_user');
};

// ===== FETCH HELPER =====
const apiFetch = async (endpoint, method = 'GET', body = null) => {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong');
    // Preserve the parsed error body/status so callers that need more than
    // a message (e.g. the timer's 409 "active session exists" conflict,
    // which carries the conflicting session) can still get at it.
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

// ===== AUTH API =====
const authAPI = {
  signup: (name, email, password) => apiFetch('/auth/signup', 'POST', { name, email, password }),
  login: (email, password) => apiFetch('/auth/login', 'POST', { email, password }),
  me: () => apiFetch('/auth/me'),
  updatePreferences: (prefs) => apiFetch('/auth/preferences', 'PUT', prefs),
};

// ===== PROFILE API (Phase 1 onboarding + Phase 21 profile tab) =====
const profileAPI = {
  get: () => apiFetch('/profile'),
  save: (data) => apiFetch('/profile', 'PUT', data),
  summary: () => apiFetch('/profile/summary'),
};

// ===== SESSIONS API =====
const sessionsAPI = {
  getByDay: (day) => apiFetch(`/sessions/day/${day}`),
  getWeekly: () => apiFetch('/sessions/weekly/all'),
  getAll: () => apiFetch('/sessions'),
  create: (data) => apiFetch('/sessions', 'POST', data),
  update: (id, data) => apiFetch(`/sessions/${id}`, 'PUT', data),
  delete: (id) => apiFetch(`/sessions/${id}`, 'DELETE'),
};

// ===== ANALYTICS API =====
const analyticsAPI = {
  overview: () => apiFetch('/analytics/overview'),
  briefing: () => apiFetch('/analytics/briefing'),
};

// ===== AI RECOMMENDATIONS API =====
const aiAPI = {
  status: () => apiFetch('/ai/status'),
  recommendations: () => apiFetch('/ai/recommendations'),
  coachInsight: () => apiFetch('/ai/coach-insight'),
  facts: () => apiFetch('/ai/facts'),
  learn: (topic) => apiFetch('/ai/learn', 'POST', { topic }),
  doubtClear: (question) => apiFetch('/ai/doubt-clear', 'POST', { question }),
  coach: (message, history) => apiFetch('/ai/coach', 'POST', { message, history }),
};

// ===== JOBS API =====
const jobsAPI = {
  getAll: () => apiFetch('/jobs'),
  stats: () => apiFetch('/jobs/stats'),
  careerReadiness: () => apiFetch('/jobs/career-readiness'),
  create: (data) => apiFetch('/jobs', 'POST', data),
  update: (id, data) => apiFetch(`/jobs/${id}`, 'PUT', data),
  delete: (id) => apiFetch(`/jobs/${id}`, 'DELETE'),
  generatePrepPlan: (id) => apiFetch(`/jobs/${id}/prep-plan`, 'POST'),
  syncPrepPlanToPlanner: (id) => apiFetch(`/jobs/${id}/prep-plan/sync-to-planner`, 'POST'),
  roleTemplates: () => apiFetch('/jobs/prep-config/roles'),
  savePrepConfig: (id, data) => apiFetch(`/jobs/${id}/prep-config`, 'PUT', data),
  generateCustomPrepPlan: (id) => apiFetch(`/jobs/${id}/prep-plan/custom`, 'POST'),
  requestAiSuggestion: (id) => apiFetch(`/jobs/${id}/prep-config/ai-suggestion`, 'POST'),
  resolveAiSuggestion: (id, action) => apiFetch(`/jobs/${id}/prep-config/ai-suggestion/${action}`, 'PUT'),
};

// ===== SMART TIMER API (server-truth active study sessions) =====
// Separate from sessionsAPI (weekly planner CRUD) - see
// server/routes/studySessionRoutes.js for why these are split.
const timerAPI = {
  start: (data) => apiFetch('/study-sessions/start', 'POST', data),
  active: () => apiFetch('/study-sessions/active'),
  heartbeat: (id) => apiFetch(`/study-sessions/${id}/heartbeat`, 'POST'),
  pause: (id) => apiFetch(`/study-sessions/${id}/pause`, 'POST'),
  resume: (id) => apiFetch(`/study-sessions/${id}/resume`, 'POST'),
  finish: (id) => apiFetch(`/study-sessions/${id}/finish`, 'POST'),
  today: () => apiFetch('/study-sessions/today'),
  remaining: () => apiFetch('/study-sessions/remaining'),
  continuePoint: () => apiFetch('/study-sessions/continue'),
  remainingPlan: () => apiFetch('/study-sessions/remaining-plan'),
};

// ===== NOTIFICATIONS (PUSH) API =====
// ===== TESTS / PRACTICE API (Phase 10) =====
const testsAPI = {
  adaptiveSuggestion: (subject, topic) => apiFetch(`/tests/adaptive-suggestion?subject=${encodeURIComponent(subject)}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`),
  generate: (data) => apiFetch('/tests/generate', 'POST', data),
  submit: (testId, data) => apiFetch(`/tests/${testId}/submit`, 'POST', data),
  history: (limit) => apiFetch(`/tests/history${limit ? `?limit=${limit}` : ''}`),
};

// ===== MISTAKES API (Phase 10) =====
const mistakesAPI = {
  list: (subject) => apiFetch(`/mistakes${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`),
  retry: (id, selectedIndex) => apiFetch(`/mistakes/${id}/retry`, 'POST', { selectedIndex }),
};

// ===== FLASHCARDS API (Phase 12) =====
const flashcardsAPI = {
  list: (subject) => apiFetch(`/flashcards${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`),
  due: () => apiFetch('/flashcards/due'),
  create: (data) => apiFetch('/flashcards', 'POST', data),
  generate: (data) => apiFetch('/flashcards/generate', 'POST', data),
  fromMistake: (mistakeId) => apiFetch(`/flashcards/from-mistake/${mistakeId}`, 'POST'),
  review: (id, result) => apiFetch(`/flashcards/${id}/review`, 'POST', { result }),
  delete: (id) => apiFetch(`/flashcards/${id}`, 'DELETE'),
};

const pushAPI = {
  vapidPublicKey: () => apiFetch('/notifications/vapid-public-key'),
  subscribe: (subscription, userAgent) => apiFetch('/notifications/subscribe', 'POST', { subscription, userAgent }),
  unsubscribe: (endpoint) => apiFetch('/notifications/unsubscribe', 'DELETE', { endpoint }),
  test: () => apiFetch('/notifications/test', 'POST'),
};

// ===== CSV EXPORT (file download, not JSON - handled separately) =====
const downloadCsvExport = async () => {
  const token = getToken();
  const res = await fetch(`${API_BASE}/analytics/export/csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to export CSV');
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : `studyflow-analytics-${new Date().toISOString().split('T')[0]}.csv`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
