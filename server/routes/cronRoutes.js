const express = require('express');
const router = express.Router();
const User = require('../models/User');
const StudySession = require('../models/StudySession');
const JobApplication = require('../models/JobApplication');
const PushSubscription = require('../models/PushSubscription');
const pushSender = require('../utils/pushSender');

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// @route   GET /api/cron/daily-digest
// @desc    Server-side scheduled push reminder, meant to be triggered by
//          Vercel Cron (see vercel.json -> "crons"). Sends each subscribed
//          user a single push summarizing today's sessions and any
//          interview within the next 2 days.
//
//          IMPORTANT HOSTING LIMITATION: Vercel's Hobby plan only allows
//          cron jobs to run once per day (and not at a guaranteed exact
//          minute) - see https://vercel.com/docs/cron-jobs/usage-and-pricing.
//          This endpoint is therefore a once-a-day digest, NOT a
//          minute-accurate "your session starts in 10 minutes" alert. That
//          finer-grained reminder still runs client-side (see
//          public/notifications.js) while the tab is open. Upgrading to a
//          Vercel Pro plan (or an external scheduler hitting this same
//          route more frequently) would allow tighter timing.
//
// Protected by a shared secret (CRON_SECRET) passed either as
// `Authorization: Bearer <secret>` (what Vercel Cron sends automatically
// when CRON_SECRET is set in the project) or `?secret=` query param for
// manual/external triggering.
router.get('/daily-digest', async (req, res) => {
  try {
    const expected = process.env.CRON_SECRET;
    if (expected) {
      const authHeader = req.headers.authorization || '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const provided = bearer || req.query.secret;
      if (provided !== expected) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
    }

    if (!pushSender.isConfigured()) {
      return res.json({ message: 'Web Push is not configured (missing VAPID keys) - nothing to send', sent: 0 });
    }

    const userIds = await PushSubscription.distinct('user');
    const todayAbbr = DAY_ABBR[new Date().getDay()];
    let usersNotified = 0;

    for (const userId of userIds) {
      const user = await User.findById(userId);
      if (!user) continue;

      const todaySessions = await StudySession.find({ user: userId, day: todayAbbr, completed: false });
      const jobs = await JobApplication.find({ user: userId, status: { $ne: 'Rejected' } });
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const upcomingInterviews = jobs.filter((j) => {
        if (!j.interviewDate) return false;
        const diffDays = Math.round((new Date(j.interviewDate).setHours(0, 0, 0, 0) - now) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 2;
      });

      if (!todaySessions.length && !upcomingInterviews.length) continue;

      const parts = [];
      if (todaySessions.length) parts.push(`${todaySessions.length} session${todaySessions.length !== 1 ? 's' : ''} planned today`);
      if (upcomingInterviews.length) parts.push(`${upcomingInterviews.length} interview${upcomingInterviews.length !== 1 ? 's' : ''} coming up`);

      await pushSender.sendToUser(userId, {
        title: 'StudyFlow AI 📚 — Daily Digest',
        body: parts.join(' · '),
        url: '/',
      });
      usersNotified += 1;
    }

    res.json({ message: 'Daily digest sent', usersNotified, totalSubscribedUsers: userIds.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
