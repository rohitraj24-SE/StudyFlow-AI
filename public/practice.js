// ===== PHASE 10: PRACTICE (TESTS + MISTAKE TRACKER) =====
// State for the currently-active quiz (if any). Grading always happens
// server-side against the stored answer key - this is purely UI state.
let practiceState = {
  testId: null,
  subject: '',
  topic: '',
  source: 'fallback',
  questions: [], // [{index, questionText, options}]
  startedAt: null,
};

const renderPracticeTab = () => {
  resetPracticeQuizUi();
  loadMistakes();
  loadTestHistory();
};

// ===== ADAPTIVE DIFFICULTY SUGGESTION (Phase 10) =====
const checkAdaptiveSuggestion = async () => {
  const subject = $('practiceSubjectInput').value.trim();
  const banner = $('practiceAdaptiveBanner');
  if (!subject) { banner.style.display = 'none'; return; }

  try {
    const topic = $('practiceTopicInput').value.trim();
    const { suggestion } = await testsAPI.adaptiveSuggestion(subject, topic);
    if (!suggestion) { banner.style.display = 'none'; return; }

    banner.style.display = 'flex';
    banner.innerHTML = `
      <span>🎯 ${escHtml(suggestion.message)}</span>
      <button class="btn-secondary" onclick="applyAdaptiveSuggestion('${suggestion.difficulty}')">Use ${suggestion.difficulty}</button>
    `;
  } catch (err) {
    banner.style.display = 'none';
  }
};

const applyAdaptiveSuggestion = (difficulty) => {
  $('practiceDifficultySelect').value = difficulty;
  $('practiceAdaptiveBanner').style.display = 'none';
};

// Called from the Dashboard's "Topics to Strengthen" list - jumps straight
// into Practice with the subject prefilled.
const startPracticeForSubject = (subject) => {
  switchTab('practiceTab');
  setTimeout(() => {
    $('practiceSubjectInput').value = subject;
    checkAdaptiveSuggestion();
  }, 50);
};

// ===== GENERATE QUIZ =====
const generatePracticeTest = async () => {
  const subject = $('practiceSubjectInput').value.trim();
  if (!subject) { toast('Enter a subject first', 'error'); $('practiceSubjectInput').focus(); return; }

  const topic = $('practiceTopicInput').value.trim();
  const difficulty = $('practiceDifficultySelect').value;
  const numQuestions = parseInt($('practiceCountSelect').value, 10);

  const btn = $('practiceGenerateBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    const test = await testsAPI.generate({ subject, topic, difficulty, numQuestions });
    practiceState = {
      testId: test.testId,
      subject: test.subject,
      topic: test.topic,
      source: test.source,
      questions: test.questions,
      startedAt: Date.now(),
    };
    renderPracticeQuiz();
  } catch (err) {
    toast(err.message || 'Could not generate a quiz right now', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '▶ Generate Quiz';
  }
};

// ===== RENDER QUIZ =====
const renderPracticeQuiz = () => {
  $('practiceSetupPanel').style.display = 'none';
  $('practiceResultsPanel').style.display = 'none';
  $('practiceQuizPanel').style.display = '';

  $('practiceQuizTitle').textContent = `${practiceState.subject}${practiceState.topic ? ' — ' + practiceState.topic : ''} (${practiceState.questions.length} questions)`;
  $('practiceQuizSource').textContent = practiceState.source === 'ai' ? '✨ AI-generated' : '📦 Practice Quiz (offline bank)';
  $('practiceQuizSource').className = `quiz-source-tag ${practiceState.source}`;

  $('practiceQuizBody').innerHTML = practiceState.questions.map((q) => `
    <div class="quiz-question-card">
      <div class="quiz-question-text">${q.index + 1}. ${escHtml(q.questionText)}</div>
      <div class="quiz-options">
        ${q.options.map((opt, oi) => `
          <label class="quiz-option-label">
            <input type="radio" name="quizQ${q.index}" value="${oi}" />
            <span>${escHtml(opt)}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
};

// ===== SUBMIT QUIZ =====
const submitPracticeTest = async () => {
  const answers = practiceState.questions.map((q) => {
    const checked = document.querySelector(`input[name="quizQ${q.index}"]:checked`);
    return { questionIndex: q.index, selectedIndex: checked ? parseInt(checked.value, 10) : -1 };
  });

  const timeSpentSeconds = Math.round((Date.now() - practiceState.startedAt) / 1000);

  try {
    const result = await testsAPI.submit(practiceState.testId, { answers, timeSpentSeconds });
    setAuth(getToken(), result.user);
    renderPracticeResults(result);
    if (result.gamification) {
      showGamificationToast(result.gamification);
      renderGamiBar(result.user);
    }
    loadMistakes();
    loadTestHistory();
  } catch (err) {
    toast(err.message || 'Could not submit — try again', 'error');
  }
};

// ===== RESULTS =====
const renderPracticeResults = (result) => {
  $('practiceQuizPanel').style.display = 'none';
  $('practiceResultsPanel').style.display = '';

  const minutes = Math.floor(result.timeSpentSeconds / 60);
  const seconds = result.timeSpentSeconds % 60;

  $('practiceResultsBody').innerHTML = `
    <h3>Quiz Results — ${escHtml(practiceState.subject)}</h3>
    <div class="quiz-results-stats">
      <div class="quiz-results-stat"><div class="stat-value">${result.score}/${result.totalQuestions}</div><div class="stat-label">Score</div></div>
      <div class="quiz-results-stat"><div class="stat-value">${result.accuracy}%</div><div class="stat-label">Accuracy</div></div>
      <div class="quiz-results-stat"><div class="stat-value">${minutes}m ${seconds}s</div><div class="stat-label">Time</div></div>
    </div>

    ${result.mistakes.length ? `
      <h4 class="quiz-mistakes-heading">Mistakes to review (${result.mistakes.length})</h4>
      ${result.mistakes.map((m) => `
        <div class="mistake-card">
          <div class="mistake-question">${escHtml(m.questionText)}</div>
          <div class="mistake-answer wrong">Your answer: ${escHtml(m.selectedIndex >= 0 ? m.options[m.selectedIndex] : '(no answer)')}</div>
          <div class="mistake-answer correct">Correct answer: ${escHtml(m.options[m.correctIndex])}</div>
          ${m.explanation ? `<div class="mistake-explanation">${escHtml(m.explanation)}</div>` : ''}
        </div>
      `).join('')}
    ` : `<p class="ai-subtitle">🎉 Perfect score — no mistakes to review!</p>`}

    <button class="btn-add" onclick="resetPracticeQuizUi()">🔁 Take Another Test</button>
  `;
};

const resetPracticeQuizUi = () => {
  practiceState = { testId: null, subject: '', topic: '', source: 'fallback', questions: [], startedAt: null };
  $('practiceSetupPanel').style.display = '';
  $('practiceQuizPanel').style.display = 'none';
  $('practiceResultsPanel').style.display = 'none';
};

// ===== MY MISTAKES =====
const loadMistakes = async () => {
  const body = $('mistakesBody');
  try {
    const mistakes = await mistakesAPI.list();
    $('mistakesCount').textContent = mistakes.length ? `${mistakes.length} to review` : '';

    if (!mistakes.length) {
      body.innerHTML = `<p class="ai-subtitle">No open mistakes — take a quiz above and anything you get wrong will show up here to retry.</p>`;
      return;
    }

    body.innerHTML = mistakes.map((m) => `
      <div class="mistake-card" id="mistake-${m._id}">
        <div class="mistake-subject-tag">${escHtml(m.subject)}${m.topic ? ` · ${escHtml(m.topic)}` : ''}</div>
        <div class="mistake-question">${escHtml(m.questionText)}</div>
        <div class="quiz-options" id="mistakeOptions-${m._id}">
          ${m.options.map((opt, oi) => `
            <label class="quiz-option-label">
              <input type="radio" name="mistakeRetry${m._id}" value="${oi}" />
              <span>${escHtml(opt)}</span>
            </label>
          `).join('')}
        </div>
        <button class="btn-secondary" onclick="retryMistake('${m._id}')">↻ Try Again</button>
        <button class="btn-secondary" onclick="makeFlashcardFromMistake('${m._id}', this)">📇 Make Flashcard</button>
      </div>
    `).join('');
  } catch (err) {
    body.innerHTML = `<p class="ai-subtitle">Could not load mistakes right now.</p>`;
  }
};

const makeFlashcardFromMistake = async (mistakeId, btn) => {
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    await flashcardsAPI.fromMistake(mistakeId);
    toast('Added to Revision → My Flashcards ✓', 'success');
    btn.textContent = '📇 Added';
  } catch (err) {
    toast(err.message || 'Could not create flashcard', 'error');
    btn.disabled = false;
    btn.textContent = '📇 Make Flashcard';
  }
};

const retryMistake = async (id) => {
  const checked = document.querySelector(`input[name="mistakeRetry${id}"]:checked`);
  if (!checked) { toast('Pick an answer first', 'error'); return; }

  try {
    const result = await mistakesAPI.retry(id, parseInt(checked.value, 10));
    if (result.correct) {
      toast('Correct! Nice recovery. ✅', 'success');
      loadMistakes();
    } else {
      toast(`Not quite — the correct answer is: ${result.explanation || 'see the options above'}`, 'error');
    }
  } catch (err) {
    toast(err.message || 'Could not check your answer', 'error');
  }
};

// ===== RECENT TEST HISTORY =====
const loadTestHistory = async () => {
  const body = $('testHistoryBody');
  try {
    const attempts = await testsAPI.history(8);
    if (!attempts.length) {
      body.innerHTML = `<p class="ai-subtitle">Test yourself after your first study session — your results will show up here.</p>`;
      return;
    }
    body.innerHTML = attempts.map((a) => `
      <div class="history-row">
        <div class="history-time">${new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
        <div class="history-body">
          <div class="history-subject">${escHtml(a.subject)}${a.topic ? ` — ${escHtml(a.topic)}` : ''} <span class="ai-subtitle">(${a.difficulty})</span></div>
          <div class="ai-subtitle">${a.score}/${a.totalQuestions} correct</div>
        </div>
        <span class="history-status-tag ${a.accuracy >= 70 ? 'status-completed' : 'status-interrupted'}">${a.accuracy}%</span>
      </div>
    `).join('');
  } catch (err) {
    body.innerHTML = `<p class="ai-subtitle">Could not load test history right now.</p>`;
  }
};
