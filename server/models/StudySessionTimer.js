const mongoose = require('mongoose');

// ===== SMART STUDY TIMER — SERVER-TRUTH SESSION TRACKING =====
// This is deliberately a SEPARATE model from StudySession (the weekly
// planner slot). StudySession answers "what did I plan for Tuesday at
// 6pm?"; StudySessionTimer answers "did I actually study, and for how
// long?" — one planner slot can be linked to zero, one, or several timer
// runs (e.g. if a session was paused and resumed across multiple sittings).
//
// The backend is the single source of truth for elapsed time. The frontend
// never invents active seconds on its own — every second added to
// totalActiveSeconds is computed here from timestamps, bounded by the
// heartbeat gap check in server/services/timerService.js.
const studySessionTimerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Optional link back to a planner slot (server/models/StudySession.js).
    // Lets "Start Study" on a planner card resume/track time against that
    // specific task, and lets a completed timer run auto-mark it done.
    plannerSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudySession',
      default: null,
    },

    subject: { type: String, required: true, trim: true },
    topic: { type: String, trim: true, default: '' },

    plannedSeconds: { type: Number, required: true, min: 60 },
    totalActiveSeconds: { type: Number, default: 0 },
    totalPausedSeconds: { type: Number, default: 0 },

    sessionStartedAt: { type: Date, required: true },
    sessionPausedAt: { type: Date, default: null },
    sessionEndedAt: { type: Date, default: null },
    lastActiveAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ['running', 'paused', 'interrupted', 'completed', 'stopped'],
      default: 'running',
      index: true,
    },

    // Number of times this run flipped into "interrupted" (heartbeat gap
    // exceeded) before being resumed or finished — surfaced in study
    // history / analytics later as a focus-quality signal.
    interruptionCount: { type: Number, default: 0 },

    deviceLabel: { type: String, default: '' }, // derived from User-Agent, for multi-device messaging
  },
  { timestamps: true }
);

// Fast lookup of "does this user already have a live session running?"
studySessionTimerSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('StudySessionTimer', studySessionTimerSchema);
