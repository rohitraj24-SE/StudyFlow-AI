const express = require('express');
const router = express.Router();
const StudySession = require('../models/StudySession');
const JobApplication = require('../models/JobApplication');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// @route   GET /api/analytics/overview
// @desc    Aggregate stats for the dashboard: completion rate, subject
//          breakdown, weekly activity, and a 30-day trend line.
router.get('/overview', async (req, res) => {
  try {
    const sessions = await StudySession.find({ user: req.user._id }).lean();

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed).length;
    const completionRate = totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0;
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.completed ? s.duration : 0), 0);

    // ----- Subject breakdown -----
    const subjectMap = {};
    for (const s of sessions) {
      if (!subjectMap[s.subject]) {
        subjectMap[s.subject] = { subject: s.subject, total: 0, completed: 0, minutes: 0 };
      }
      subjectMap[s.subject].total += 1;
      if (s.completed) {
        subjectMap[s.subject].completed += 1;
        subjectMap[s.subject].minutes += s.duration;
      }
    }
    const subjectBreakdown = Object.values(subjectMap).sort((a, b) => b.total - a.total);

    // ----- Weekly activity (Mon-Sun) -----
    const weeklyActivity = DAY_ORDER.map((day) => {
      const daySessions = sessions.filter((s) => s.day === day);
      return {
        day,
        total: daySessions.length,
        completed: daySessions.filter((s) => s.completed).length,
        minutes: daySessions.filter((s) => s.completed).reduce((sum, s) => sum + s.duration, 0),
      };
    });

    // ----- 30-day completion trend (by completedAt date) -----
    const trendMap = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      trendMap[key] = { date: key, sessions: 0, minutes: 0 };
    }
    for (const s of sessions) {
      if (s.completed && s.completedAt) {
        const key = new Date(s.completedAt).toISOString().split('T')[0];
        if (trendMap[key]) {
          trendMap[key].sessions += 1;
          trendMap[key].minutes += s.duration;
        }
      }
    }
    const trend30Day = Object.values(trendMap);

    // ----- Best performing hour buckets (by completion rate) -----
    const hourMap = {};
    for (const s of sessions) {
      const hour = parseInt((s.startTime || '00:00').split(':')[0], 10);
      if (Number.isNaN(hour)) continue;
      if (!hourMap[hour]) hourMap[hour] = { hour, total: 0, completed: 0 };
      hourMap[hour].total += 1;
      if (s.completed) hourMap[hour].completed += 1;
    }
    const hourlyPerformance = Object.values(hourMap)
      .map((h) => ({ ...h, rate: h.total ? Math.round((h.completed / h.total) * 100) : 0 }))
      .sort((a, b) => a.hour - b.hour);

    // ----- Activity heatmap: weekday x hour matrix of completed minutes -----
    // Powers the "focus heatmap" component shown on the Dashboard and Planner.
    const heatmap = DAY_ORDER.map((day) => ({
      day,
      hours: Array.from({ length: 24 }, () => 0),
    }));
    const dayIndex = Object.fromEntries(DAY_ORDER.map((d, i) => [d, i]));
    for (const s of sessions) {
      if (!s.completed) continue;
      const hour = parseInt((s.startTime || '00:00').split(':')[0], 10);
      if (Number.isNaN(hour) || dayIndex[s.day] === undefined) continue;
      heatmap[dayIndex[s.day]].hours[hour] += s.duration;
    }

    res.json({
      totalSessions,
      completedSessions,
      completionRate,
      totalMinutes,
      subjectBreakdown,
      weeklyActivity,
      trend30Day,
      hourlyPerformance,
      heatmap,
      gamification: req.user.toPublicJSON(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/analytics/briefing
// @desc    Powers the post-login "Daily Briefing" card: today's task count,
//          next session, highest-priority unfinished task, streak/XP status,
//          and the nearest upcoming job deadline (interview/assessment).
router.get('/briefing', async (req, res) => {
  try {
    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayAbbr = DAY_ABBR[new Date().getDay()];

    const todaySessions = await StudySession.find({ user: req.user._id, day: todayAbbr }).sort({ startTime: 1 }).lean();
    const pending = todaySessions.filter((s) => !s.completed);

    const priorityRank = { High: 0, Medium: 1, Low: 2 };
    const topPriorityTask = [...pending].sort((a, b) => {
      const pDiff = (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
      if (pDiff !== 0) return pDiff;
      return (a.startTime || '').localeCompare(b.startTime || '');
    })[0] || null;

    const nextSession = pending[0] || null;

    // Nearest job deadline (interview date or nextStepDate) in the future
    const jobs = await JobApplication.find({
      user: req.user._id,
      status: { $nin: ['Rejected'] },
    }).lean();

    const now = new Date();
    const upcoming = [];
    for (const j of jobs) {
      if (j.interviewDate && new Date(j.interviewDate) >= now) {
        upcoming.push({ company: j.company, role: j.role, date: j.interviewDate, type: 'Interview' });
      } else if (j.nextStepDate && new Date(j.nextStepDate) >= now) {
        upcoming.push({ company: j.company, role: j.role, date: j.nextStepDate, type: j.nextStep || 'Next step' });
      }
    }
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    const nearestDeadline = upcoming[0] || null;

    const user = req.user.toPublicJSON();

    res.json({
      totalToday: todaySessions.length,
      pendingToday: pending.length,
      nextSession,
      topPriorityTask,
      nearestDeadline,
      streak: user.streak,
      xpToNext: user.xpToNext,
      level: user.level,
      todayAbbr,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== CSV HELPERS =====
// Minimal, dependency-free CSV escaping: wrap in quotes and double any
// internal quotes whenever the value contains a comma, quote, or newline.
// This keeps the output valid for both Excel and Google Sheets.
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values) {
  return values.map(csvEscape).join(',') + '\r\n';
}

// @route   GET /api/analytics/export/csv
// @desc    Downloadable CSV of every study session, alongside the existing
//          PDF report (public/pdf.js). Uses only fields that actually exist
//          on the StudySession model - no invented columns.
router.get('/export/csv', async (req, res) => {
  try {
    const sessions = await StudySession.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();

    const header = ['Day', 'Subject', 'Goal', 'Start Time', 'Duration (min)', 'Priority', 'Tag', 'Completed', 'Completed At', 'Created At'];
    let csv = toCsvRow(header);

    for (const s of sessions) {
      csv += toCsvRow([
        s.day,
        s.subject,
        s.goal || '',
        s.startTime,
        s.duration,
        s.priority,
        s.tag || '',
        s.completed ? 'Yes' : 'No',
        s.completedAt ? new Date(s.completedAt).toISOString() : '',
        s.createdAt ? new Date(s.createdAt).toISOString() : '',
      ]);
    }

    const filename = `studyflow-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
