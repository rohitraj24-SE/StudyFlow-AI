const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Test = require('../models/Test');
const TestAttempt = require('../models/TestAttempt');
const Mistake = require('../models/Mistake');
const quizService = require('../services/quizService');
const { applyTestCompletion } = require('../utils/gamification');
const { asQueryString } = require('../utils/sanitize');

router.use(protect);

// Strips correctIndex/explanation so the client can't read answers from the
// network tab before submitting.
const toClientQuestion = (q, index) => ({
  index,
  questionText: q.questionText,
  options: q.options,
});

// @route   GET /api/tests/adaptive-suggestion
// @desc    Phase 10 adaptive difficulty - real recent-attempt-based only.
router.get('/adaptive-suggestion', async (req, res) => {
  try {
    const subject = asQueryString(req.query.subject);
    if (!subject) return res.status(400).json({ message: 'subject is required' });
    const topic = asQueryString(req.query.topic) || '';
    const suggestion = await quizService.suggestNextDifficulty(req.user._id, subject, topic);
    res.json({ suggestion });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/tests/generate
// @desc    Build a new Test (AI-generated when configured, fallback bank
//          otherwise - Test.source tells the client which).
router.post('/generate', async (req, res) => {
  try {
    const { subject, topic = '', difficulty = 'medium', numQuestions = 5 } = req.body;
    if (!subject || !subject.trim()) return res.status(400).json({ message: 'Subject is required' });

    const clampedCount = Math.min(15, Math.max(3, parseInt(numQuestions, 10) || 5));
    const test = await quizService.generateQuiz({
      userId: req.user._id,
      subject: subject.trim(),
      topic: topic.trim(),
      difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
      numQuestions: clampedCount,
    });

    res.status(201).json({
      testId: test._id,
      subject: test.subject,
      topic: test.topic,
      difficulty: test.difficulty,
      source: test.source,
      questions: test.questions.map(toClientQuestion),
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Could not generate a test right now' });
  }
});

// @route   POST /api/tests/:id/submit
// @desc    Grades against the server-stored answer key (never trusts a
//          client-sent "correct" flag), saves a TestAttempt, files a
//          Mistake per wrong answer, and awards real XP/badges.
router.post('/:id/submit', async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, user: req.user._id });
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const submittedAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const timeSpentSeconds = Math.max(0, parseInt(req.body.timeSpentSeconds, 10) || 0);

    const answerByIndex = new Map(submittedAnswers.map((a) => [a.questionIndex, a.selectedIndex]));

    let score = 0;
    const gradedAnswers = [];
    const wrongDetails = [];

    test.questions.forEach((q, i) => {
      const raw = answerByIndex.has(i) ? answerByIndex.get(i) : -1;
      const selectedIndex = Number.isInteger(raw) ? raw : parseInt(raw, 10);
      const correct = Number.isInteger(selectedIndex) && selectedIndex === q.correctIndex;
      if (correct) score += 1;
      else {
        wrongDetails.push({
          questionText: q.questionText,
          options: q.options,
          correctIndex: q.correctIndex,
          selectedIndex,
          explanation: q.explanation,
        });
      }
      gradedAnswers.push({ questionIndex: i, selectedIndex, correct });
    });

    const totalQuestions = test.questions.length;
    const accuracy = totalQuestions ? Math.round((score / totalQuestions) * 100) : 0;

    const attempt = await TestAttempt.create({
      user: req.user._id,
      test: test._id,
      subject: test.subject,
      topic: test.topic,
      difficulty: test.difficulty,
      answers: gradedAnswers,
      score,
      totalQuestions,
      accuracy,
      timeSpentSeconds,
    });

    if (wrongDetails.length) {
      await Mistake.insertMany(
        wrongDetails.map((w) => ({
          user: req.user._id,
          testAttempt: attempt._id,
          subject: test.subject,
          topic: test.topic,
          ...w,
        }))
      );
    }

    const gamification = applyTestCompletion(req.user, attempt);
    await req.user.save();

    res.json({
      score,
      totalQuestions,
      accuracy,
      timeSpentSeconds,
      mistakes: wrongDetails,
      gamification,
      user: req.user.toPublicJSON(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/tests/history
// @desc    Recent test attempts for this user (Practice tab + Analytics).
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
    const attempts = await TestAttempt.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(attempts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
