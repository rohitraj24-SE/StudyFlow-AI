// ===== PHASE 13: QUICK STUDY MODE ("I HAVE X MINUTES") =====
// A router, not a new feature: every option below deep-links into an
// existing, already-tracked system (Revision/Flashcards - Phase 12,
// Practice/Tests - Phase 10, Study Timer - Phase 5-8) rather than spinning
// up a fourth parallel "activity" concept.

const openQuickStudyModal = () => document.getElementById('quickStudyModal')?.classList.add('show');
const closeQuickStudyModal = () => document.getElementById('quickStudyModal')?.classList.remove('show');
const closeQuickStudyModalIfOverlay = (e) => {
  if (e.target.id === 'quickStudyModal') closeQuickStudyModal();
};

// Picks a real subject to focus the 10/15-minute options on: the
// student's own weakest subject (server/utils/studyFacts.js) first, falling
// back to whatever they were last studying, and only "General Review" if
// neither exists yet (a brand-new account with no history).
const pickQuickStudySubject = async () => {
  try {
    const facts = await aiAPI.facts();
    if (facts.weakSubjects && facts.weakSubjects.length) return facts.weakSubjects[0];
  } catch (err) { /* fall through */ }

  try {
    const { continuePoint } = await timerAPI.continuePoint();
    if (continuePoint && continuePoint.subject) return continuePoint.subject;
  } catch (err) { /* fall through */ }

  return 'General Review';
};

const startQuickStudy = async (minutes) => {
  closeQuickStudyModal();

  if (minutes === 5) {
    // 5 min -> Flashcards (Phase 12's own due-card review session already
    // does exactly this - just open it).
    switchTab('revisionTab');
    toast('5 minutes — let\'s clear a few flashcards 📇', 'info');
    return;
  }

  if (minutes === 10) {
    // 10 min -> a short quiz (Phase 10), prefilled on the right subject.
    const subject = await pickQuickStudySubject();
    switchTab('practiceTab');
    setTimeout(() => {
      const input = document.getElementById('practiceSubjectInput');
      const countSelect = document.getElementById('practiceCountSelect');
      if (input) input.value = subject;
      if (countSelect) countSelect.value = '5';
      if (typeof checkAdaptiveSuggestion === 'function') checkAdaptiveSuggestion();
    }, 50);
    toast(`10 minutes — quick quiz on ${subject} 📝`, 'info');
    return;
  }

  if (minutes === 15) {
    // 15 min -> a real, tracked focus session on the weakest subject
    // (Phase 5-8's timer) rather than a passive "revision" screen.
    const subject = await pickQuickStudySubject();
    switchTab('timerTab');
    setTimeout(() => {
      if (typeof startTimer === 'function') {
        startTimer({ subject, topic: 'Quick 15-minute focus session', minutes: 15 });
      }
    }, 50);
    toast(`15 minutes — focused session on ${subject} 🎯`, 'info');
  }
};
