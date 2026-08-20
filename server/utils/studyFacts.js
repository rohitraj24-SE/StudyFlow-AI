// ===== DETERMINISTIC STUDY FACTS =====
// Single source of truth for the numeric/factual analysis of a user's study
// history. Used by:
//   - GET /api/ai/recommendations  (rule-based cards, unchanged behavior)
//   - POST /api/ai/coach           (fed to the LLM so it narrates facts
//                                    instead of inventing numbers)
// Keeping this in one place means the LLM coach and the rule-based engine
// never disagree about what "your completion rate" actually is.

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function computeStudyFacts(sessions, user) {
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.completed).length;
  const completionRate = totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.completed ? s.duration : 0), 0);

  // Subject stats
  const subjectMap = {};
  for (const s of sessions) {
    if (!subjectMap[s.subject]) subjectMap[s.subject] = { subject: s.subject, total: 0, completed: 0 };
    subjectMap[s.subject].total += 1;
    if (s.completed) subjectMap[s.subject].completed += 1;
  }
  const subjectStats = Object.values(subjectMap).map((s) => ({ ...s, rate: s.total ? Math.round((s.completed / s.total) * 100) : 0 }));
  const weakSubjects = subjectStats.filter((s) => s.total >= 2 && s.rate < 50).sort((a, b) => a.rate - b.rate).map((s) => s.subject);
  const strongSubjects = subjectStats.filter((s) => s.total >= 2 && s.rate >= 80).map((s) => s.subject);

  // Best hour
  const hourMap = {};
  for (const s of sessions) {
    const hour = parseInt((s.startTime || '00:00').split(':')[0], 10);
    if (Number.isNaN(hour)) continue;
    if (!hourMap[hour]) hourMap[hour] = { hour, total: 0, completed: 0 };
    hourMap[hour].total += 1;
    if (s.completed) hourMap[hour].completed += 1;
  }
  const hourStats = Object.values(hourMap)
    .map((h) => ({ ...h, rate: h.total ? h.completed / h.total : 0 }))
    .filter((h) => h.total >= 2)
    .sort((a, b) => b.rate - a.rate);
  const bestHour = hourStats[0] || null;
  const bestStudyTime = bestHour
    ? (bestHour.hour === 0 ? '12 AM' : bestHour.hour < 12 ? `${bestHour.hour} AM` : bestHour.hour === 12 ? '12 PM' : `${bestHour.hour - 12} PM`)
    : null;

  // Weekly gaps
  const daysWithSessions = new Set(sessions.map((s) => s.day));
  const emptyDays = DAY_ORDER.filter((d) => !daysWithSessions.has(d));

  return {
    totalSessions,
    completedSessions,
    completionRate,
    totalMinutes,
    weakSubjects,
    strongSubjects,
    bestStudyTime,
    emptyDays,
    streak: user ? user.streak : 0,
    longestStreak: user ? user.longestStreak : 0,
    level: user ? user.getLevel() : 1,
    xp: user ? user.xp : 0,
  };
}

module.exports = { computeStudyFacts };
