const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Mistake = require('../models/Mistake');
const { asQueryString } = require('../utils/sanitize');

router.use(protect);

// @route   GET /api/mistakes
// @desc    "My Mistakes" - unresolved mistakes for this user, newest first.
//          Optional ?subject= filter (used by the dashboard's weak-area
//          "Practice Now" links to jump straight to that subject's mistakes).
router.get('/', async (req, res) => {
  try {
    const filter = { user: req.user._id, resolved: false };
    const subject = asQueryString(req.query.subject);
    if (subject) filter.subject = subject;
    const mistakes = await Mistake.find(filter).sort({ createdAt: -1 }).lean();
    res.json(mistakes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/mistakes/:id/retry
// @desc    "Try Again" - grades a retry attempt against the same stored
//          answer key and marks the mistake resolved on success.
router.post('/:id/retry', async (req, res) => {
  try {
    const mistake = await Mistake.findOne({ _id: req.params.id, user: req.user._id });
    if (!mistake) return res.status(404).json({ message: 'Mistake not found' });

    // Coerce defensively - a strict === against a string "0" from a
    // non-standard client would otherwise mark a genuinely correct answer
    // wrong. Our own frontend already sends a number; this just makes the
    // API robust for any client.
    const selectedIndex = Number.isInteger(req.body.selectedIndex) ? req.body.selectedIndex : parseInt(req.body.selectedIndex, 10);
    const correct = Number.isInteger(selectedIndex) && selectedIndex === mistake.correctIndex;

    if (correct && !mistake.resolved) {
      mistake.resolved = true;
      await mistake.save();
    }

    res.json({ correct, correctIndex: mistake.correctIndex, explanation: mistake.explanation, resolved: mistake.resolved });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
