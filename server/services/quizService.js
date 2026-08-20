// ===== QUIZ SERVICE (Phase 10: Tests & Practice) =====
// Generates a Test's questions (AI when configured, a small generic
// fallback bank otherwise - clearly labeled via Test.source), and computes
// the adaptive difficulty suggestion from the student's own real recent
// TestAttempt history. No fabricated content is ever presented as
// "AI-personalized" when it isn't.

const llmService = require('./llmService');
const Test = require('../models/Test');
const TestAttempt = require('../models/TestAttempt');

// A small, generic, subject-agnostic bank of study-skill questions used
// only when the LLM isn't configured (or fails) - so the feature still
// works with zero AI spend, same philosophy as the rest of the app. This
// is intentionally NOT presented as being about the student's chosen
// subject/topic; the frontend labels it "Practice Quiz (offline bank)".
const FALLBACK_BANK = [
  {
    questionText: 'Which study technique relies on reviewing material at increasing intervals over time?',
    options: ['Cramming', 'Spaced repetition', 'Passive re-reading', 'Highlighting'],
    correctIndex: 1,
    explanation: 'Spaced repetition schedules reviews at increasing intervals, which strengthens long-term retention far more than cramming.',
  },
  {
    questionText: 'The Pomodoro Technique typically uses work intervals of about how long?',
    options: ['5 minutes', '25 minutes', '90 minutes', '3 hours'],
    correctIndex: 1,
    explanation: 'The classic Pomodoro interval is 25 minutes of focused work followed by a short break.',
  },
  {
    questionText: 'Actively testing yourself on material (retrieval practice) compared to just re-reading notes generally:',
    options: ['Makes no difference', 'Improves retention more', 'Only helps for math', 'Wastes study time'],
    correctIndex: 1,
    explanation: 'Retrieval practice - actively recalling information - produces stronger long-term retention than passive review.',
  },
  {
    questionText: 'Which of these is a sign a topic should go into a "weak areas" revision list?',
    options: ['You scored well on it once', 'You consistently score low on it in tests', 'You enjoy the subject', 'It was studied recently'],
    correctIndex: 1,
    explanation: 'Weak areas are best identified from a consistent pattern of low test performance, not a single data point.',
  },
  {
    questionText: 'What is the main benefit of setting a specific study target (e.g. "3 hours today") rather than an open-ended one?',
    options: ['It guarantees a good score', 'It gives a concrete way to measure progress and remaining time', 'It removes the need to plan', 'It has no real benefit'],
    correctIndex: 1,
    explanation: 'A concrete target lets you measure actual progress against it and calculate exactly how much time remains.',
  },
  {
    questionText: 'Interleaving (mixing multiple subjects/topics in one study session) compared to blocking (one topic at a time) tends to:',
    options: ['Feel easier and learn worse', 'Feel harder but improve long-term learning', 'Have no effect either way', 'Only work for languages'],
    correctIndex: 1,
    explanation: 'Interleaving feels more difficult in the moment but research shows it improves long-term retention and transfer.',
  },
];

function pickFallbackQuestions(numQuestions) {
  const shuffled = [...FALLBACK_BANK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(numQuestions, shuffled.length));
}

function sanitizeQuestions(questions, numQuestions) {
  return (Array.isArray(questions) ? questions : [])
    .filter(
      (q) =>
        q &&
        typeof q.questionText === 'string' &&
        q.questionText.trim() &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every((o) => typeof o === 'string' && o.trim()) &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3
    )
    .slice(0, numQuestions)
    .map((q) => ({
      questionText: q.questionText.trim(),
      options: q.options.map((o) => o.trim()),
      correctIndex: q.correctIndex,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
    }));
}

/**
 * Builds and persists a new Test document, then returns it (still holding
 * correctIndex/explanation server-side - the route layer strips those
 * before responding to the client).
 */
async function generateQuiz({ userId, subject, topic, difficulty, numQuestions }) {
  let questions = [];
  let source = 'fallback';

  if (llmService.isConfigured()) {
    try {
      const raw = await llmService.generateQuiz({ subject, topic, difficulty, numQuestions });
      const sanitized = sanitizeQuestions(raw, numQuestions);
      if (sanitized.length >= Math.min(3, numQuestions)) {
        questions = sanitized;
        source = 'ai';
      }
    } catch (err) {
      // fall through to the fallback bank below
    }
  }

  if (!questions.length) {
    questions = sanitizeQuestions(pickFallbackQuestions(numQuestions), numQuestions);
  }

  if (!questions.length) throw new Error('Could not build a quiz right now — try again.');

  return Test.create({ user: userId, subject, topic, difficulty, source, questions });
}

/**
 * Adaptive difficulty (Phase 10): looks at the student's own last 3
 * TestAttempts for this exact subject (+topic, if given) - real data only.
 * Needs at least 2 attempts before suggesting anything, so a single lucky
 * or unlucky attempt never triggers a swing.
 */
async function suggestNextDifficulty(userId, subject, topic) {
  const filter = { user: userId, subject };
  if (topic) filter.topic = topic;

  const recent = await TestAttempt.find(filter).sort({ createdAt: -1 }).limit(3).lean();
  if (recent.length < 2) return null;

  const avgAccuracy = recent.reduce((sum, a) => sum + a.accuracy, 0) / recent.length;
  const currentDifficulty = recent[0].difficulty;
  const order = ['easy', 'medium', 'hard'];
  const idx = order.indexOf(currentDifficulty);

  if (avgAccuracy >= 80 && idx < order.length - 1) {
    return {
      difficulty: order[idx + 1],
      message: `You're averaging ${Math.round(avgAccuracy)}% on ${currentDifficulty} ${subject} tests — try ${order[idx + 1]} next.`,
    };
  }
  if (avgAccuracy < 50) {
    return {
      difficulty: 'easy',
      message: `Recent ${subject} accuracy is ${Math.round(avgAccuracy)}% — let's strengthen the basics first.`,
    };
  }
  return null;
}

module.exports = { generateQuiz, suggestNextDifficulty };
