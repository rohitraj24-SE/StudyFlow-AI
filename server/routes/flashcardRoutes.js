const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const flashcardService = require('../services/flashcardService');
const { asQueryString } = require('../utils/sanitize');

router.use(protect);

// @route   GET /api/flashcards
// @desc    All of the student's flashcards (optional ?subject= filter),
//          newest first - used by the "My Flashcards" browser.
router.get('/', async (req, res) => {
  try {
    const cards = await flashcardService.getAll(req.user._id, asQueryString(req.query.subject));
    res.json(cards.map((c) => c.toClientJSON()));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/flashcards/due
// @desc    "Revision Due" - cards whose real nextReviewAt has passed.
router.get('/due', async (req, res) => {
  try {
    const cards = await flashcardService.getDue(req.user._id);
    res.json(cards.map((c) => c.toClientJSON()));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/flashcards
// @desc    Create a manual flashcard.
router.post('/', async (req, res) => {
  try {
    const { subject, topic, front, back } = req.body;
    const card = await flashcardService.createManual(req.user._id, { subject, topic, front, back });
    res.status(201).json(card.toClientJSON());
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @route   POST /api/flashcards/generate
// @desc    AI-generated flashcards for a subject/topic (falls back to a
//          clear error if the LLM isn't configured - no fabricated cards).
router.post('/generate', async (req, res) => {
  try {
    const { subject, topic, count } = req.body;
    const cards = await flashcardService.generateAI(req.user._id, { subject, topic, count });
    res.status(201).json(cards.map((c) => c.toClientJSON()));
  } catch (error) {
    const status = error.message === 'LLM_NOT_CONFIGURED' ? 200 : 500;
    if (status === 200) return res.json({ configured: false, cards: [] });
    res.status(status).json({ message: error.message });
  }
});

// @route   POST /api/flashcards/from-mistake/:mistakeId
// @desc    Turns one wrong quiz answer (Phase 10) into a flashcard.
//          Idempotent - clicking twice on the same mistake reuses the card.
router.post('/from-mistake/:mistakeId', async (req, res) => {
  try {
    const card = await flashcardService.createFromMistake(req.user._id, req.params.mistakeId);
    res.status(201).json(card.toClientJSON());
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @route   POST /api/flashcards/:id/review
// @desc    Records a review outcome and reschedules per the spaced-
//          repetition ladder. body: { result: 'good' | 'again' }
router.post('/:id/review', async (req, res) => {
  try {
    const { result } = req.body;
    if (!['good', 'again'].includes(result)) {
      return res.status(400).json({ message: "result must be 'good' or 'again'" });
    }
    const card = await flashcardService.reviewCard(req.user._id, req.params.id, result);
    res.json(card.toClientJSON());
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @route   DELETE /api/flashcards/:id
router.delete('/:id', async (req, res) => {
  try {
    const Flashcard = require('../models/Flashcard');
    const deleted = await Flashcard.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!deleted) return res.status(404).json({ message: 'Flashcard not found' });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
