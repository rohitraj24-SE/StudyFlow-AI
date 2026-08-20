// ===== TIMER SERVICE =====
// The single place that computes "how much did the student actually
// study." Every route in server/routes/studySessionRoutes.js delegates
// here rather than touching timestamps itself, so there is exactly one
// implementation of the elapsed-time math to reason about / test.
//
// CORE RULE: timestamps are the source of truth, never a client-side
// setInterval counter. The frontend polls/heartbeats this service roughly
// every 30 seconds while a session is "running"; this service then adds
// the *actual* wall-clock gap since the last heartbeat to totalActiveSeconds
// - capped at HEARTBEAT_MAX_GAP_MS so that a closed tab, sleeping laptop,
// or lost connection cannot silently count as active study time. If the
// gap exceeds that cap, the session is flipped to "interrupted" instead of
// quietly absorbing the missing time.

const StudySessionTimer = require('../models/StudySessionTimer');
const StudySession = require('../models/StudySession');
const User = require('../models/User');
const { applySessionCompletion, todayLocalStr } = require('../utils/gamification');

// Frontend heartbeats every 30s (see public/timer.js). 90s gives headroom
// for normal network/tab-visibility jitter while still catching a closed
// tab, sleeping machine, or dropped connection well before it could
// meaningfully inflate "active" time.
const HEARTBEAT_MAX_GAP_MS = 90 * 1000;

function boundedElapsedMs(fromDate, toDate) {
  const raw = Math.max(0, toDate.getTime() - new Date(fromDate).getTime());
  return { boundedMs: Math.min(raw, HEARTBEAT_MAX_GAP_MS), rawMs: raw, exceeded: raw > HEARTBEAT_MAX_GAP_MS };
}

/**
 * Advances a RUNNING session's accounting up to `now`, capping the gap.
 * Does NOT save - caller decides when to persist. Mutates the doc in place.
 * Returns whether the gap indicates an interruption occurred.
 */
function settleRunningElapsed(sessionDoc, now = new Date()) {
  if (sessionDoc.status !== 'running') return false;
  const { boundedMs, exceeded } = boundedElapsedMs(sessionDoc.lastActiveAt, now);
  sessionDoc.totalActiveSeconds += Math.floor(boundedMs / 1000);
  sessionDoc.lastActiveAt = now;
  if (exceeded) {
    sessionDoc.status = 'interrupted';
    sessionDoc.interruptionCount += 1;
  }
  return exceeded;
}

function remainingSecondsFor(sessionDoc) {
  return Math.max(0, sessionDoc.plannedSeconds - sessionDoc.totalActiveSeconds);
}

function deviceLabelFromUA(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) return 'Android device';
  if (ua.includes('mac os')) return 'Mac';
  if (ua.includes('windows')) return 'Windows PC';
  if (ua.includes('linux')) return 'Linux device';
  return 'a device';
}

/** Any session that isn't finished yet counts as "the active one" for multi-device checks. */
const LIVE_STATUSES = ['running', 'paused', 'interrupted'];

async function getLiveSessionForUser(userId) {
  return StudySessionTimer.findOne({ user: userId, status: { $in: LIVE_STATUSES } }).sort({ sessionStartedAt: -1 });
}

/**
 * Starts a new timer session. If the user already has a live session
 * elsewhere (multi-device safety), refuses unless `force` is true - in
 * which case the old one is finalized as "interrupted" first.
 */
async function startSession(userId, { subject, topic, plannedSeconds, plannerSessionId, deviceLabel, force }) {
  const existing = await getLiveSessionForUser(userId);
  if (existing && !force) {
    const now = new Date();
    // Give the caller an accurate live snapshot of the conflicting session
    // without mutating it, so the "already running" prompt shows real numbers.
    const preview = existing.toObject();
    if (preview.status === 'running') {
      const { boundedMs } = boundedElapsedMs(preview.lastActiveAt, now);
      preview.totalActiveSeconds += Math.floor(boundedMs / 1000);
    }
    const err = new Error('ACTIVE_SESSION_EXISTS');
    err.code = 'ACTIVE_SESSION_EXISTS';
    err.existing = preview;
    throw err;
  }

  if (existing && force) {
    settleRunningElapsed(existing); // bank whatever time was legitimately active
    existing.status = 'interrupted';
    existing.sessionEndedAt = null; // left for the other device/tab to explicitly finish or for user to resume later
    await existing.save();
  }

  const now = new Date();
  const doc = await StudySessionTimer.create({
    user: userId,
    plannerSession: plannerSessionId || null,
    subject,
    topic: topic || '',
    plannedSeconds,
    totalActiveSeconds: 0,
    totalPausedSeconds: 0,
    sessionStartedAt: now,
    lastActiveAt: now,
    status: 'running',
    deviceLabel: deviceLabel || '',
  });

  return doc;
}

async function heartbeat(userId, sessionId) {
  const session = await StudySessionTimer.findOne({ _id: sessionId, user: userId });
  if (!session) return null;
  if (session.status === 'running') settleRunningElapsed(session);
  await session.save();
  return session;
}

async function pauseSession(userId, sessionId) {
  const session = await StudySessionTimer.findOne({ _id: sessionId, user: userId });
  if (!session) return null;
  if (session.status === 'running' || session.status === 'interrupted') {
    if (session.status === 'running') settleRunningElapsed(session);
    session.status = 'paused';
    session.sessionPausedAt = new Date();
    await session.save();
  }
  return session;
}

async function resumeSession(userId, sessionId) {
  const session = await StudySessionTimer.findOne({ _id: sessionId, user: userId });
  if (!session) return null;
  const now = new Date();
  if (session.status === 'paused' && session.sessionPausedAt) {
    session.totalPausedSeconds += Math.floor((now.getTime() - new Date(session.sessionPausedAt).getTime()) / 1000);
  }
  session.sessionPausedAt = null;
  session.lastActiveAt = now;
  session.status = 'running';
  await session.save();
  return session;
}

/**
 * Finishes a session: finalizes any trailing active time, marks it
 * completed, awards real gamification XP for the *actual* minutes studied
 * (never the planned minutes), and - if linked to a planner slot and the
 * target was met - marks that planner slot completed too, without a second
 * XP award (this service is the only place XP is granted for timer runs).
 */
async function finishSession(userId, sessionId) {
  const session = await StudySessionTimer.findOne({ _id: sessionId, user: userId });
  if (!session) return null;

  if (session.status === 'running') settleRunningElapsed(session);
  session.status = 'completed';
  session.sessionEndedAt = new Date();
  session.sessionPausedAt = null;

  const minutesStudied = Math.floor(session.totalActiveSeconds / 60);

  let gamification = null;
  const user = await User.findById(userId);
  if (user && minutesStudied > 0) {
    const startHH = String(new Date(session.sessionStartedAt).getHours()).padStart(2, '0');
    const startMM = String(new Date(session.sessionStartedAt).getMinutes()).padStart(2, '0');
    gamification = applySessionCompletion(user, { duration: minutesStudied, startTime: `${startHH}:${startMM}` });
    await user.save();
  }

  let plannerSessionUpdated = null;
  if (session.plannerSession) {
    const targetMet = session.totalActiveSeconds >= session.plannedSeconds;
    if (targetMet) {
      plannerSessionUpdated = await StudySession.findOneAndUpdate(
        { _id: session.plannerSession, user: userId, completed: false },
        { completed: true, completedAt: new Date() },
        { new: true }
      );
    }
  }

  await session.save();

  return { session, gamification, plannerSessionUpdated, minutesStudied, targetMet: session.totalActiveSeconds >= session.plannedSeconds };
}

/** Live (un-persisted) snapshot for GET /active — safe to call often. */
function liveSnapshot(sessionDoc, now = new Date()) {
  const snap = sessionDoc.toObject();
  if (snap.status === 'running') {
    const { boundedMs, exceeded } = boundedElapsedMs(snap.lastActiveAt, now);
    snap.totalActiveSeconds += Math.floor(boundedMs / 1000);
    snap.likelyInterrupted = exceeded;
  } else {
    snap.likelyInterrupted = snap.status === 'interrupted';
  }
  snap.remainingSeconds = remainingSecondsFor(snap);
  return snap;
}

/**
 * Called on GET /active - if a "running" session's heartbeat has actually
 * gone silent past the cap, persist the interruption now (rather than only
 * reporting it live) so history/analytics reflect it even if the user never
 * reopens the tab.
 */
async function reconcileIfStale(sessionDoc) {
  if (sessionDoc.status !== 'running') return sessionDoc;
  const wasInterrupted = settleRunningElapsed(sessionDoc);
  if (wasInterrupted) await sessionDoc.save();
  return sessionDoc;
}

async function todaySummary(userId) {
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayAbbr = DAY_ABBR[new Date().getDay()];

  // Target: sum of planned durations from today's planner slots (existing
  // StudySession model) - this is what "Today's Study Balance" targets,
  // consistent with what the Planner tab already shows for today.
  const plannerToday = await StudySession.find({ user: userId, day: todayAbbr }).lean();
  const targetSeconds = plannerToday.reduce((sum, s) => sum + (s.duration || 0) * 60, 0);

  // Actual: sum of real active seconds from every timer run started today
  // (regardless of link to a planner slot), including the live session.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const todaysRuns = await StudySessionTimer.find({
    user: userId,
    sessionStartedAt: { $gte: startOfDay, $lte: endOfDay },
  });

  const now = new Date();
  let actualSeconds = 0;
  for (const run of todaysRuns) {
    actualSeconds += run.status === 'running' ? liveSnapshot(run, now).totalActiveSeconds : run.totalActiveSeconds;
  }

  const remainingSeconds = Math.max(0, targetSeconds - actualSeconds);
  const progressPct = targetSeconds > 0 ? Math.min(100, Math.round((actualSeconds / targetSeconds) * 100)) : 0;

  return {
    date: todayLocalStr(),
    targetSeconds,
    actualSeconds,
    remainingSeconds,
    progressPct,
    sessionsRun: todaysRuns.length,
    plannerTasksToday: plannerToday.length,
    plannerTasksCompleted: plannerToday.filter((s) => s.completed).length,
  };
}

/**
 * "Continue where you left off" - finds the most recent thing the student
 * was genuinely partway through, using only real StudySessionTimer/
 * StudySession data (never invented percentages):
 *
 *  - If their most recent timer run is still paused/interrupted, that run
 *    itself is the thing to resume.
 *  - Otherwise, if their most recent *completed* run is linked to a planner
 *    slot that isn't marked completed yet, we sum every timer run ever
 *    linked to that planner slot to get a real "minutes studied so far"
 *    and offer to continue it (a fresh run against the remaining time).
 *  - Otherwise there is nothing pending - the frontend shows no card
 *    rather than a fabricated one.
 */
async function continuePoint(userId) {
  const lastRun = await StudySessionTimer.findOne({ user: userId }).sort({ sessionStartedAt: -1 });
  if (!lastRun) return null;

  if (lastRun.status === 'paused' || lastRun.status === 'interrupted') {
    return {
      mode: 'resume',
      timerSessionId: lastRun._id,
      subject: lastRun.subject,
      topic: lastRun.topic,
      minutesStudied: Math.floor(lastRun.totalActiveSeconds / 60),
      plannedMinutes: Math.round(lastRun.plannedSeconds / 60),
      percentComplete: lastRun.plannedSeconds ? Math.min(100, Math.round((lastRun.totalActiveSeconds / lastRun.plannedSeconds) * 100)) : 0,
      lastStudiedAt: lastRun.lastActiveAt,
    };
  }

  if (lastRun.status !== 'completed' || !lastRun.plannerSession) return null;

  const plannerSlot = await StudySession.findOne({ _id: lastRun.plannerSession, user: userId });
  if (!plannerSlot || plannerSlot.completed) return null;

  const allRuns = await StudySessionTimer.find({ user: userId, plannerSession: plannerSlot._id });
  const totalActiveSeconds = allRuns.reduce((sum, r) => sum + (r.totalActiveSeconds || 0), 0);
  const plannedSeconds = plannerSlot.duration * 60;
  const remainingMinutes = Math.max(5, Math.round((plannedSeconds - totalActiveSeconds) / 60));

  return {
    mode: 'continue',
    plannerSessionId: plannerSlot._id,
    subject: plannerSlot.subject,
    topic: plannerSlot.goal || '',
    minutesStudied: Math.floor(totalActiveSeconds / 60),
    plannedMinutes: Math.round(plannedSeconds / 60),
    remainingMinutes,
    percentComplete: plannedSeconds ? Math.min(100, Math.round((totalActiveSeconds / plannedSeconds) * 100)) : 0,
    lastStudiedAt: lastRun.sessionEndedAt || lastRun.lastActiveAt,
  };
}

/**
 * "AI Remaining Plan" (Phase 7) - breaks today's remaining study target
 * across today's still-incomplete planner tasks, in priority order, with a
 * 10-minute break between blocks. Purely deterministic and built only from
 * real data (today's planner slots + the real remaining-seconds figure from
 * todaySummary) - never invents a task or a duration that isn't already on
 * the student's own plan.
 *
 *  - If the incomplete tasks' total planned time fits within what's left,
 *    each block keeps its own planned duration.
 *  - If it doesn't fit, every block is scaled down proportionally (floor
 *    10 min/block) so the whole plan exactly fits the remaining time.
 *  - Blocks are scheduled back-to-back starting from "now" (rounded up to
 *    the next 5 minutes), separated by a 10-minute break.
 */
async function buildRemainingPlan(userId) {
  const summary = await todaySummary(userId);

  if (summary.remainingSeconds <= 0) {
    return { remainingSeconds: 0, blocks: [], reason: summary.targetSeconds === 0 ? 'no_target' : 'target_met' };
  }

  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayAbbr = DAY_ABBR[new Date().getDay()];
  const PRIORITY_WEIGHT = { High: 0, Medium: 1, Low: 2 };

  const incomplete = (await StudySession.find({ user: userId, day: todayAbbr, completed: false }).lean())
    .sort((a, b) => (PRIORITY_WEIGHT[a.priority] ?? 1) - (PRIORITY_WEIGHT[b.priority] ?? 1) || (a.startTime || '').localeCompare(b.startTime || ''))
    .slice(0, 6); // cap so the plan stays realistic, not a wall of blocks

  if (incomplete.length === 0) {
    return { remainingSeconds: summary.remainingSeconds, blocks: [], reason: 'no_incomplete_tasks' };
  }

  const totalPlannedSeconds = incomplete.reduce((sum, t) => sum + t.duration * 60, 0);
  const scale = totalPlannedSeconds > summary.remainingSeconds ? summary.remainingSeconds / totalPlannedSeconds : 1;

  const BREAK_SECONDS = 10 * 60;
  let cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 5) * 5); // round up to next 5 min

  const blocks = [];
  incomplete.forEach((task, i) => {
    const minutes = Math.max(10, Math.round(task.duration * scale));
    blocks.push({
      type: 'study',
      plannerSessionId: task._id,
      subject: task.subject,
      topic: task.goal || '',
      startTime: `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`,
      minutes,
    });
    cursor = new Date(cursor.getTime() + minutes * 60 * 1000);

    if (i < incomplete.length - 1) {
      blocks.push({
        type: 'break',
        startTime: `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`,
        minutes: 10,
      });
      cursor = new Date(cursor.getTime() + BREAK_SECONDS * 1000);
    }
  });

  return {
    remainingSeconds: summary.remainingSeconds,
    scaled: scale < 1,
    blocks,
  };
}

module.exports = {
  HEARTBEAT_MAX_GAP_MS,
  deviceLabelFromUA,
  getLiveSessionForUser,
  startSession,
  heartbeat,
  pauseSession,
  resumeSession,
  finishSession,
  liveSnapshot,
  reconcileIfStale,
  todaySummary,
  continuePoint,
  buildRemainingPlan,
  remainingSecondsFor,
};
