// ===== GAMIFICATION ENGINE =====
// Pure functions that mutate a Mongoose User document in-memory based on a
// completed study session. Caller is responsible for calling user.save().

const BADGE_CATALOG = [
  { id: 'first_session', label: 'First Step', emoji: '🌱', desc: 'Completed your first study session' },
  { id: 'streak_3', label: 'On a Roll', emoji: '🔥', desc: '3-day study streak' },
  { id: 'streak_7', label: 'Week Warrior', emoji: '🏆', desc: '7-day study streak' },
  { id: 'streak_30', label: 'Unstoppable', emoji: '💎', desc: '30-day study streak' },
  { id: 'sessions_10', label: 'Getting Serious', emoji: '📚', desc: 'Completed 10 study sessions' },
  { id: 'sessions_50', label: 'Scholar', emoji: '🎓', desc: 'Completed 50 study sessions' },
  { id: 'sessions_100', label: 'Master Student', emoji: '👑', desc: 'Completed 100 study sessions' },
  { id: 'marathon', label: 'Marathoner', emoji: '⏳', desc: 'Completed a session of 2+ hours' },
  { id: 'early_bird', label: 'Early Bird', emoji: '🌅', desc: 'Completed a session starting before 7 AM' },
  { id: 'night_owl', label: 'Night Owl', emoji: '🦉', desc: 'Completed a session starting after 10 PM' },
  { id: 'hours_10', label: '10 Hour Club', emoji: '⏰', desc: 'Studied 10 total hours' },
  { id: 'hours_50', label: '50 Hour Club', emoji: '🕰️', desc: 'Studied 50 total hours' },
  { id: 'first_test', label: 'First Test Completed', emoji: '📝', desc: 'Completed your first practice test' },
  { id: 'tests_10', label: 'Quiz Regular', emoji: '🧠', desc: 'Completed 10 practice tests' },
  { id: 'accuracy_90', label: 'Sharp Shooter', emoji: '🎯', desc: 'Scored 90%+ accuracy on a test' },
];

function todayLocalStr(date = new Date()) {
  // YYYY-MM-DD, treated as the user's "day" boundary
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(aStr, bStr) {
  const a = new Date(aStr + 'T00:00:00');
  const b = new Date(bStr + 'T00:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Apply XP/streak/badge changes to `user` for one newly-completed `session`.
 * Returns { xpGained, newBadges, streak, leveledUp }
 */
function applySessionCompletion(user, session) {
  const before = { xp: user.xp, level: user.getLevel() };

  // ----- XP -----
  // Base 10 XP + 1 XP per 5 minutes studied (rewards longer, focused sessions)
  const xpGained = 10 + Math.floor((session.duration || 0) / 5);
  user.xp += xpGained;

  // ----- Totals -----
  user.totalSessionsCompleted += 1;
  user.totalMinutesStudied += session.duration || 0;

  // ----- Streak -----
  const today = todayLocalStr();
  if (!user.lastCompletedDate) {
    user.streak = 1;
  } else {
    const gap = daysBetween(user.lastCompletedDate, today);
    if (gap === 0) {
      // already logged a completion today, streak unchanged
    } else if (gap === 1) {
      user.streak += 1;
    } else if (gap > 1) {
      user.streak = 1; // streak broken, restart
    }
  }
  user.lastCompletedDate = today;
  if (user.streak > user.longestStreak) user.longestStreak = user.streak;

  // ----- Badges -----
  const earned = new Set(user.badges);
  const newlyEarned = [];
  const maybeAward = (id) => {
    if (!earned.has(id)) {
      earned.add(id);
      newlyEarned.push(id);
    }
  };

  if (user.totalSessionsCompleted >= 1) maybeAward('first_session');
  if (user.totalSessionsCompleted >= 10) maybeAward('sessions_10');
  if (user.totalSessionsCompleted >= 50) maybeAward('sessions_50');
  if (user.totalSessionsCompleted >= 100) maybeAward('sessions_100');
  if (user.streak >= 3) maybeAward('streak_3');
  if (user.streak >= 7) maybeAward('streak_7');
  if (user.streak >= 30) maybeAward('streak_30');
  if ((session.duration || 0) >= 120) maybeAward('marathon');
  if (user.totalMinutesStudied >= 600) maybeAward('hours_10');
  if (user.totalMinutesStudied >= 3000) maybeAward('hours_50');

  const startHour = parseInt((session.startTime || '00:00').split(':')[0], 10);
  if (!Number.isNaN(startHour)) {
    if (startHour < 7) maybeAward('early_bird');
    if (startHour >= 22) maybeAward('night_owl');
  }

  user.badges = Array.from(earned);

  const after = { xp: user.xp, level: user.getLevel() };

  return {
    xpGained,
    newBadges: newlyEarned.map((id) => BADGE_CATALOG.find((b) => b.id === id)).filter(Boolean),
    streak: user.streak,
    leveledUp: after.level > before.level,
    level: after.level,
  };
}

/**
 * Apply XP/badge changes to `user` for one newly-completed TestAttempt.
 * Deliberately does NOT touch streak/session totals (those are earned by
 * actual study time, not by taking a quiz) - keeps the two systems honest
 * and non-overlapping. Returns the same shape as applySessionCompletion so
 * the frontend's existing gamification-toast renderer can be reused as-is.
 */
function applyTestCompletion(user, attempt) {
  const before = { xp: user.xp, level: user.getLevel() };

  // Flat base + accuracy bonus, deliberately smaller than a full study
  // session's reward so testing complements studying rather than replacing it.
  const xpGained = 5 + Math.round((attempt.accuracy / 100) * 10);
  user.xp += xpGained;
  user.totalTestsCompleted = (user.totalTestsCompleted || 0) + 1;

  const earned = new Set(user.badges);
  const newlyEarned = [];
  const maybeAward = (id) => {
    if (!earned.has(id)) {
      earned.add(id);
      newlyEarned.push(id);
    }
  };

  if (user.totalTestsCompleted >= 1) maybeAward('first_test');
  if (user.totalTestsCompleted >= 10) maybeAward('tests_10');
  if (attempt.accuracy >= 90) maybeAward('accuracy_90');

  user.badges = Array.from(earned);

  const after = { xp: user.xp, level: user.getLevel() };

  return {
    xpGained,
    newBadges: newlyEarned.map((id) => BADGE_CATALOG.find((b) => b.id === id)).filter(Boolean),
    streak: user.streak,
    leveledUp: after.level > before.level,
    level: after.level,
  };
}

module.exports = { applySessionCompletion, applyTestCompletion, BADGE_CATALOG, todayLocalStr };
