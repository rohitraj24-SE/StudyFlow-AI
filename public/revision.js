// ===== PHASE 12: REVISION + FLASHCARDS =====
// Revision Due session state (client-side only - grading/scheduling always
// happens server-side against Flashcard.reviewCard()).
let revisionQueue = [];
let revisionIndex = 0;
let revisionCardFlipped = false;
let flashcardCreateMode = 'manual';

const renderRevisionTab = () => {
  loadRevisionDue();
  loadFlashcardBrowser();
};

// ===== REVISION DUE (interactive flip session) =====
const loadRevisionDue = async () => {
  const body = $('revisionDueBody');
  body.innerHTML = '<div class="ai-loading">Loading…</div>';
  try {
    revisionQueue = await flashcardsAPI.due();
    revisionIndex = 0;
    revisionCardFlipped = false;
    $('revisionDueCount').textContent = revisionQueue.length ? `${revisionQueue.length} due now` : '';
    renderRevisionCard();
  } catch (err) {
    body.innerHTML = '<p class="ai-subtitle">Could not load revision cards right now.</p>';
  }
};

const renderRevisionCard = () => {
  const body = $('revisionDueBody');

  if (!revisionQueue.length) {
    body.innerHTML = `<p class="ai-subtitle">🎉 Nothing due for revision right now — cards resurface here as they come due.</p>`;
    return;
  }

  if (revisionIndex >= revisionQueue.length) {
    body.innerHTML = `<p class="ai-subtitle">✅ Revision session complete — all caught up!</p>`;
    return;
  }

  const card = revisionQueue[revisionIndex];
  body.innerHTML = `
    <div class="revision-progress">Card ${revisionIndex + 1} of ${revisionQueue.length}</div>
    <div class="flashcard-flip ${revisionCardFlipped ? 'flipped' : ''}" id="revisionFlipCard" onclick="toggleRevisionFlip()">
      <div class="flashcard-face flashcard-front">
        <span class="flashcard-subject-tag">${escHtml(card.subject)}${card.topic ? ` · ${escHtml(card.topic)}` : ''}</span>
        <div class="flashcard-text">${escHtml(card.front)}</div>
        <div class="flashcard-hint">Tap to reveal answer</div>
      </div>
      <div class="flashcard-face flashcard-back">
        <div class="flashcard-text">${escHtml(card.back)}</div>
      </div>
    </div>
    <div class="revision-actions" ${revisionCardFlipped ? '' : 'style="display:none"'} id="revisionActions">
      <button class="btn-secondary revision-again-btn" onclick="answerRevisionCard('again')">😕 Still Learning</button>
      <button class="btn-add revision-good-btn" onclick="answerRevisionCard('good')">✅ Got It</button>
    </div>
  `;
};

const toggleRevisionFlip = () => {
  revisionCardFlipped = !revisionCardFlipped;
  renderRevisionCard();
};

const answerRevisionCard = async (result) => {
  const card = revisionQueue[revisionIndex];
  if (!card) return;
  try {
    await flashcardsAPI.review(card._id, result);
  } catch (err) {
    toast(err.message || 'Could not save your review', 'error');
  }
  revisionIndex += 1;
  revisionCardFlipped = false;
  renderRevisionCard();
  loadFlashcardBrowser(); // stats/status may have changed
};

// ===== MY FLASHCARDS BROWSER =====
const switchFlashcardCreateMode = (mode) => {
  flashcardCreateMode = mode;
  document.querySelectorAll('#flashcardCreatePanel .view-toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('flashcardManualForm').style.display = mode === 'manual' ? '' : 'none';
  $('flashcardAiForm').style.display = mode === 'ai' ? '' : 'none';
};

const createManualFlashcard = async () => {
  const subject = $('fcSubjectInput').value.trim();
  const topic = $('fcTopicInput').value.trim();
  const front = $('fcFrontInput').value.trim();
  const back = $('fcBackInput').value.trim();

  if (!subject || !front || !back) { toast('Subject, front, and back are required', 'error'); return; }

  try {
    await flashcardsAPI.create({ subject, topic, front, back });
    $('fcSubjectInput').value = ''; $('fcTopicInput').value = ''; $('fcFrontInput').value = ''; $('fcBackInput').value = '';
    toast('Flashcard added ✓', 'success');
    loadFlashcardBrowser();
    loadRevisionDue();
  } catch (err) {
    toast(err.message || 'Could not add flashcard', 'error');
  }
};

const generateAiFlashcards = async () => {
  const subject = $('fcAiSubjectInput').value.trim();
  const topic = $('fcAiTopicInput').value.trim();
  const count = $('fcAiCountSelect').value;

  if (!subject) { toast('Enter a subject first', 'error'); return; }

  const btn = $('fcAiGenerateBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    const result = await flashcardsAPI.generate({ subject, topic, count });
    if (result && result.configured === false) {
      toast("AI flashcards need an OPENAI_API_KEY on this deployment — try Manual instead.", 'error');
    } else {
      toast(`${result.length} flashcards generated ✓`, 'success');
      $('fcAiSubjectInput').value = ''; $('fcAiTopicInput').value = '';
      loadFlashcardBrowser();
      loadRevisionDue();
    }
  } catch (err) {
    toast(err.message || 'Could not generate flashcards', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Generate';
  }
};

const loadFlashcardBrowser = async () => {
  const body = $('flashcardBrowserBody');
  const chips = $('flashcardStatsChips');
  try {
    const cards = await flashcardsAPI.list();

    const counts = { new: 0, learning: 0, mastered: 0 };
    cards.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
    chips.innerHTML = `
      <span class="fc-stat-chip fc-new">🆕 ${counts.new} New</span>
      <span class="fc-stat-chip fc-learning">📖 ${counts.learning} Learning</span>
      <span class="fc-stat-chip fc-mastered">🏆 ${counts.mastered} Mastered</span>
    `;

    if (!cards.length) {
      body.innerHTML = `<p class="ai-subtitle">No flashcards yet — add one manually, generate with AI, or turn a wrong quiz answer into one from the Practice tab.</p>`;
      return;
    }

    body.innerHTML = `<div class="flashcard-grid">${cards.map((c) => `
      <div class="flashcard-browse-item status-${c.status}">
        <div class="flashcard-browse-top">
          <span class="flashcard-subject-tag">${escHtml(c.subject)}${c.topic ? ` · ${escHtml(c.topic)}` : ''}</span>
          <span class="flashcard-status-dot status-${c.status}" title="${c.status}"></span>
        </div>
        <div class="flashcard-browse-front">${escHtml(c.front)}</div>
        <div class="flashcard-browse-back">${escHtml(c.back)}</div>
        <button class="btn-delete flashcard-delete-btn" onclick="deleteFlashcard('${c._id}', this)" title="Delete">🗑️</button>
      </div>
    `).join('')}</div>`;
  } catch (err) {
    body.innerHTML = `<p class="ai-subtitle">Could not load flashcards right now.</p>`;
  }
};

const deleteFlashcard = async (id, btn) => {
  const item = btn.closest('.flashcard-browse-item');
  try {
    await flashcardsAPI.delete(id);
    if (item) item.remove();
    loadRevisionDue();
  } catch (err) {
    toast(err.message || 'Could not delete flashcard', 'error');
  }
};
