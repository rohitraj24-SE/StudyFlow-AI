const express = require('express');
const router = express.Router();
const StudySession = require('../models/StudySession');
const { protect } = require('../middleware/authMiddleware');
const { applySessionCompletion } = require('../utils/gamification');

router.use(protect);

// @route   GET /api/sessions
router.get('/', async (req, res) => {
  try {
    const sessions = await StudySession.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/sessions/day/:day
router.get('/day/:day', async (req, res) => {
  try {
    const sessions = await StudySession.find({
      user: req.user._id,
      day: req.params.day,
    }).sort({ startTime: 1 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/sessions
router.post('/', async (req, res) => {
  const { day, subject, timeSlot, startTime, duration, goal, priority, tag } = req.body;

  try {
    if (!day || !subject || !timeSlot || !startTime || !duration) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    const session = await StudySession.create({
      user: req.user._id,
      day,
      subject,
      timeSlot,
      startTime,
      duration,
      goal: goal || '',
      priority: priority || 'Medium',
      tag: tag || '',
    });

    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/sessions/:id
// @desc    Update a session. If `completed` flips false -> true, awards XP/streak/badges.
router.put('/:id', async (req, res) => {
  try {
    const session = await StudySession.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const wasCompleted = session.completed;
    const willBeCompleted = req.body.completed;

    Object.assign(session, req.body);

    let gamification = null;
    if (!wasCompleted && willBeCompleted === true) {
      session.completedAt = new Date();
      gamification = applySessionCompletion(req.user, session);
      await req.user.save();
    } else if (wasCompleted && willBeCompleted === false) {
      // Reopening a session does not revoke XP already earned (avoids
      // punishing accidental un-checks), but clears the completedAt stamp.
      session.completedAt = null;
    }

    await session.save();

    res.json({
      session,
      gamification,
      user: gamification ? req.user.toPublicJSON() : undefined,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/sessions/:id
router.delete('/:id', async (req, res) => {
  try {
    const session = await StudySession.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    await StudySession.findByIdAndDelete(req.params.id);
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/sessions/weekly/all
router.get('/weekly/all', async (req, res) => {
  try {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekly = {};

    for (const day of days) {
      weekly[day] = await StudySession.find({ user: req.user._id, day }).sort({ startTime: 1 });
    }

    res.json(weekly);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
