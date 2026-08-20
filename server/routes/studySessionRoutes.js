const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const StudySessionTimer = require('../models/StudySessionTimer');
const StudySession = require('../models/StudySession');
const User = require('../models/User');
const timerService = require('../services/timerService');

// NOTE: this router is mounted at /api/study-sessions - deliberately
// separate from the existing /api/sessions (the weekly planner CRUD in
// sessionRoutes.js) so neither route set collides with or shadows the
// other. "Study session" here means a real, timestamped, actively-tracked
// study run; a "session" under /api/sessions is a planned weekly slot.

router.use(protect);

// @route   POST /api/study-sessions/start
// @desc    Starts a new server-truth timed study session. Body:
//          { subject, topic?, plannedMinutes, plannerSessionId?, force? }
//          If the user already has a live session (running/paused/
//          interrupted) elsewhere, responds 409 with the existing session
//          unless `force: true` is passed, in which case the old one is
//          finalized as interrupted and a fresh one starts (multi-device
//          "Take over here").
router.post('/start', async (req, res) => {
  try {
    const { subject, topic, plannedMinutes, plannerSessionId, force } = req.body;
    if (!subject || !plannedMinutes || Number(plannedMinutes) <= 0) {
      return res.status(400).json({ message: 'subject and a positive plannedMinutes are required' });
    }

    if (plannerSessionId) {
      const owns = await StudySession.exists({ _id: plannerSessionId, user: req.user._id });
      if (!owns) return res.status(404).json({ message: 'Linked planner session not found' });
    }

    const deviceLabel = timerService.deviceLabelFromUA(req.headers['user-agent'] || '');

    const session = await timerService.startSession(req.user._id, {
      subject,
      topic,
      plannedSeconds: Math.round(Number(plannedMinutes) * 60),
      plannerSessionId: plannerSessionId || null,
      deviceLabel,
      force: Boolean(force),
    });

    res.status(201).json({ session });
  } catch (error) {
    if (error.code === 'ACTIVE_SESSION_EXISTS') {
      return res.status(409).json({
        message: 'An active study session is already running',
        existing: error.existing,
      });
    }
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/study-sessions/active
// @desc    Returns the user's current live session (running/paused/
//          interrupted), if any, with a live-computed snapshot of elapsed
//          time. Also reconciles a stale "running" session into
//          "interrupted" server-side if its heartbeat has gone silent past
//          the allowed gap, so the interruption is reflected everywhere
//          (not just in this one response).
router.get('/active', async (req, res) => {
  try {
    let session = await timerService.getLiveSessionForUser(req.user._id);
    if (!session) return res.json({ session: null });

    session = await timerService.reconcileIfStale(session);
    res.json({ session: timerService.liveSnapshot(session) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/study-sessions/:id/heartbeat
// @desc    Called every ~30s by the frontend while a session is running.
//          Advances totalActiveSeconds by the real wall-clock gap since the
//          last heartbeat (capped - see timerService.HEARTBEAT_MAX_GAP_MS),
//          flipping to "interrupted" instead of over-counting if the gap
//          was too large (sleep, closed tab, dropped connection).
router.post('/:id/heartbeat', async (req, res) => {
  try {
    const session = await timerService.heartbeat(req.user._id, req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json({
      session,
      remainingSeconds: timerService.remainingSecondsFor(session),
      interrupted: session.status === 'interrupted',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/study-sessions/:id/pause
router.post('/:id/pause', async (req, res) => {
  try {
    const session = await timerService.pauseSession(req.user._id, req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json({ session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/study-sessions/:id/resume
router.post('/:id/resume', async (req, res) => {
  try {
    const session = await timerService.resumeSession(req.user._id, req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json({ session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/study-sessions/:id/finish
// @desc    Finalizes the session, awards real XP for actual minutes studied
//          (never planned minutes), and marks a linked planner slot
//          completed if - and only if - the actual time met the plan.
router.post('/:id/finish', async (req, res) => {
  try {
    const result = await timerService.finishSession(req.user._id, req.params.id);
    if (!result) return res.status(404).json({ message: 'Session not found' });

    const user = await User.findById(req.user._id);

    res.json({
      session: result.session,
      minutesStudied: result.minutesStudied,
      targetMet: result.targetMet,
      gamification: result.gamification,
      plannerSessionUpdated: result.plannerSessionUpdated,
      user: user ? user.toPublicJSON() : undefined,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/study-sessions/today
// @desc    Today's target (from planner slots) vs actual (from timer runs)
//          vs remaining, plus a rollup of today's individual runs - powers
//          "Today's Study Balance."
router.get('/today', async (req, res) => {
  try {
    const summary = await timerService.todaySummary(req.user._id);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const runs = await StudySessionTimer.find({
      user: req.user._id,
      sessionStartedAt: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ sessionStartedAt: 1 })
      .lean();

    res.json({ ...summary, runs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/study-sessions/remaining
// @desc    Lightweight variant of /today for polling from places like the
//          dashboard's "What's Left Today" widget without pulling the
//          full run list.
router.get('/remaining', async (req, res) => {
  try {
    const summary = await timerService.todaySummary(req.user._id);
    res.json({
      targetSeconds: summary.targetSeconds,
      actualSeconds: summary.actualSeconds,
      remainingSeconds: summary.remainingSeconds,
      progressPct: summary.progressPct,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/study-sessions/continue
// @desc    "Continue where you left off" - see timerService.continuePoint()
//          for the exact rule. Returns { continuePoint: null } when there's
//          genuinely nothing pending, never a fabricated card.
router.get('/continue', async (req, res) => {
  try {
    const point = await timerService.continuePoint(req.user._id);
    res.json({ continuePoint: point });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/study-sessions/remaining-plan
// @desc    Phase 7: "AI Remaining Plan" - see timerService.buildRemainingPlan()
//          for the exact rule. Breaks today's remaining target across
//          today's real incomplete planner tasks; never invents a task.
router.get('/remaining-plan', async (req, res) => {
  try {
    const plan = await timerService.buildRemainingPlan(req.user._id);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
