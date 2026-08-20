const express = require('express');
const router = express.Router();
const StudySession = require('../models/StudySession');
const { protect } = require('../middleware/authMiddleware');
const { todayLocalStr } = require('../utils/gamification');
const { answerDoubt } = require('../utils/doubtBot');
const { computeStudyFacts } = require('../utils/studyFacts');
const llmService = require('../services/llmService');

router.use(protect);

// @route   GET /api/ai/status
// @desc    Lets the frontend know whether the real LLM is configured, so it
//          can show "Powered by AI" vs "Rule-based" in the UI without
//          guessing or leaking whether a key is present in any other way.
router.get('/status', (req, res) => {
  res.json({ llmConfigured: llmService.isConfigured(), model: llmService.isConfigured() ? llmService.MODEL : null });
});

// @route   POST /api/ai/doubt-clear
// @desc    Floating chatbot widget backend. Hybrid: uses the real LLM
//          (server/services/llmService.js) when OPENAI_API_KEY is
//          configured, falling back to the original rule-based keyword
//          matcher (utils/doubtBot.js) otherwise - so the feature never
//          hard-fails and never requires an API key to work.
router.post('/doubt-clear', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ message: 'Please provide a question' });
    }

    if (llmService.isConfigured()) {
      try {
        const answer = await llmService.chatCoach({ message: question });
        return res.json({ answer, source: 'llm' });
      } catch (err) {
        console.error('LLM doubt-clear failed, falling back to rule-based:', err.message);
        // fall through to rule-based below
      }
    }

    const result = answerDoubt(question);
    res.json({ ...result, source: 'rule-based' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/ai/coach
// @desc    Free-form conversational AI Coach. This is the hybrid AI feature:
//          deterministic facts about the student (completion rate, streak,
//          weak subjects, best study time - see utils/studyFacts.js) are
//          computed here in plain JS and handed to the LLM as ground truth,
//          so the model narrates/coaches instead of inventing numbers.
//          Requires OPENAI_API_KEY; if not configured, returns a friendly
//          message rather than a 500 so the chat panel degrades gracefully.
router.post('/coach', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'Please provide a message' });
    }

    if (!llmService.isConfigured()) {
      return res.json({
        reply:
          "Free-form coaching needs a real LLM connection, which isn't configured on this deployment yet (missing OPENAI_API_KEY). In the meantime, check the AI Coach recommendation cards above, or ask a quick question in the doubt-clear chat bubble.",
        source: 'unconfigured',
      });
    }

    const sessions = await StudySession.find({ user: req.user._id }).lean();
    const facts = computeStudyFacts(sessions, req.user);

    const reply = await llmService.chatCoach({
      message,
      history: Array.isArray(history) ? history : [],
      facts,
    });

    res.json({ reply, source: 'llm', facts });
  } catch (error) {
    console.error('AI coach error:', error.message);
    res.status(500).json({ message: 'The AI coach is temporarily unavailable. Please try again shortly.' });
  }
});

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// @route   GET /api/ai/recommendations
// @desc    Heuristic "AI-powered" study recommendation engine. This is a
//          transparent, explainable rule-based system (not an external LLM
//          call) that mines the user's own session history for patterns:
//          neglected subjects, best/worst performing time slots, streak
//          risk, and weekly balance gaps.
router.get('/recommendations', async (req, res) => {
  try {
    const sessions = await StudySession.find({ user: req.user._id }).lean();
    const recommendations = [];

    if (sessions.length === 0) {
      recommendations.push({
        type: 'onboarding',
        icon: '🚀',
        title: 'Add your first study session',
        detail: 'Once you log a few sessions, this panel will start surfacing personalized patterns and suggestions.',
      });
      return res.json({ recommendations, generatedAt: new Date() });
    }

    // ----- Subject completion rates -----
    const subjectMap = {};
    for (const s of sessions) {
      if (!subjectMap[s.subject]) subjectMap[s.subject] = { total: 0, completed: 0, minutes: 0 };
      subjectMap[s.subject].total += 1;
      if (s.completed) {
        subjectMap[s.subject].completed += 1;
        subjectMap[s.subject].minutes += s.duration;
      }
    }
    const subjectStats = Object.entries(subjectMap).map(([subject, v]) => ({
      subject,
      ...v,
      rate: v.total ? v.completed / v.total : 0,
    }));

    const neglected = subjectStats
      .filter((s) => s.total >= 2 && s.rate < 0.5)
      .sort((a, b) => a.rate - b.rate)[0];
    if (neglected) {
      recommendations.push({
        type: 'neglected_subject',
        icon: '📉',
        title: `${neglected.subject} needs attention`,
        detail: `You've only completed ${Math.round(neglected.rate * 100)}% of your ${neglected.subject} sessions. Try scheduling shorter, more frequent sessions for this subject to rebuild momentum.`,
      });
    }

    const strongest = subjectStats
      .filter((s) => s.total >= 2)
      .sort((a, b) => b.rate - a.rate)[0];
    if (strongest && strongest.rate >= 0.8) {
      recommendations.push({
        type: 'strong_subject',
        icon: '💪',
        title: `You're crushing ${strongest.subject}`,
        detail: `${Math.round(strongest.rate * 100)}% completion rate. Consider using this subject's time slot as a template for others.`,
      });
    }

    // ----- Best performing hour -----
    const hourMap = {};
    for (const s of sessions) {
      const hour = parseInt((s.startTime || '00:00').split(':')[0], 10);
      if (Number.isNaN(hour)) continue;
      if (!hourMap[hour]) hourMap[hour] = { total: 0, completed: 0 };
      hourMap[hour].total += 1;
      if (s.completed) hourMap[hour].completed += 1;
    }
    const hourStats = Object.entries(hourMap)
      .map(([hour, v]) => ({ hour: Number(hour), ...v, rate: v.total ? v.completed / v.total : 0 }))
      .filter((h) => h.total >= 2);
    const bestHour = hourStats.sort((a, b) => b.rate - a.rate)[0];
    if (bestHour && bestHour.rate >= 0.7) {
      const label = bestHour.hour === 0 ? '12 AM' : bestHour.hour < 12 ? `${bestHour.hour} AM` : bestHour.hour === 12 ? '12 PM' : `${bestHour.hour - 12} PM`;
      recommendations.push({
        type: 'best_time',
        icon: '⏰',
        title: `Your peak focus window is around ${label}`,
        detail: `Sessions started near ${label} have a ${Math.round(bestHour.rate * 100)}% completion rate — noticeably better than your average. Try scheduling your hardest subject then.`,
      });
    }

    // ----- Weekly balance: days with zero sessions -----
    const daysWithSessions = new Set(sessions.map((s) => s.day));
    const emptyDays = DAY_ORDER.filter((d) => !daysWithSessions.has(d));
    if (emptyDays.length > 0 && emptyDays.length < 7) {
      recommendations.push({
        type: 'weekly_gap',
        icon: '🗓️',
        title: `No sessions planned on ${emptyDays.join(', ')}`,
        detail: `Spreading sessions across more days (even short 20-30 min ones) tends to improve retention versus cramming on fewer days.`,
      });
    }

    // ----- Streak risk -----
    const today = todayLocalStr();
    const completedToday = sessions.some(
      (s) => s.completed && s.completedAt && new Date(s.completedAt).toISOString().split('T')[0] === today
    );
    const hourNow = new Date().getHours();
    if (!completedToday && hourNow >= 17) {
      recommendations.push({
        type: 'streak_risk',
        icon: '🔥',
        title: 'Your streak is at risk today',
        detail: `You haven't completed a session yet today. Even a quick 20-minute session keeps your streak alive.`,
      });
    }

    // ----- Ideal session length -----
    const completedDurations = sessions.filter((s) => s.completed).map((s) => s.duration);
    const incompleteDurations = sessions.filter((s) => !s.completed).map((s) => s.duration);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const avgCompleted = avg(completedDurations);
    const avgIncomplete = avg(incompleteDurations);
    if (avgCompleted && avgIncomplete && avgIncomplete - avgCompleted >= 20) {
      recommendations.push({
        type: 'session_length',
        icon: '⏱️',
        title: 'Shorter sessions get finished more often',
        detail: `Completed sessions average ${Math.round(avgCompleted)} min, while abandoned ones average ${Math.round(avgIncomplete)} min. Try breaking long sessions into ${Math.round(avgCompleted)}-minute blocks.`,
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'steady',
        icon: '✅',
        title: "You're on track",
        detail: 'No red flags in your recent study pattern — keep the consistency going!',
      });
    }

    res.json({ recommendations, generatedAt: new Date() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/ai/coach-insight
// @desc    Turns the same deterministic facts used above into one short,
//          personalized paragraph via the LLM (hybrid architecture: facts
//          are computed here, the LLM only narrates them). Returns
//          configured:false (not an error) when no OPENAI_API_KEY is set,
//          so the UI can hide the card instead of showing a broken state.
router.get('/coach-insight', async (req, res) => {
  try {
    if (!llmService.isConfigured()) {
      return res.json({ configured: false, insight: null });
    }
    const sessions = await StudySession.find({ user: req.user._id }).lean();
    const facts = computeStudyFacts(sessions, req.user);
    const insight = await llmService.narrateInsight(facts);
    res.json({ configured: true, insight, facts });
  } catch (error) {
    console.error('AI coach-insight error:', error.message);
    res.json({ configured: true, insight: null, error: 'Insight temporarily unavailable' });
  }
});

// @route   GET /api/ai/facts
// @desc    Exposes the same deterministic study facts (weak/strong subjects,
//          completion rate, best study time, streak, empty days) used
//          internally by /coach and /coach-insight - but without requiring
//          an LLM key. Powers the Dashboard's "Weak Areas" / "Strengths"
//          cards, which must work even when OPENAI_API_KEY isn't set.
router.get('/facts', async (req, res) => {
  try {
    const sessions = await StudySession.find({ user: req.user._id }).lean();
    const facts = computeStudyFacts(sessions, req.user);
    res.json(facts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/ai/learn
// @desc    Phase 11: "Learn Anything" mode - explains a topic/question with
//          an example and key points. Requires OPENAI_API_KEY; when not
//          configured, returns configured:false (not an error) so the
//          frontend can show a graceful fallback that still points the
//          student at the Practice tab's quiz bank, which works either way.
router.post('/learn', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ message: 'Please provide a topic or question' });
    }

    if (!llmService.isConfigured()) {
      return res.json({ configured: false });
    }

    const sessions = await StudySession.find({ user: req.user._id }).lean();
    const facts = computeStudyFacts(sessions, req.user);

    const result = await llmService.explainTopic({ topic: topic.trim(), facts });
    res.json({ configured: true, topic: topic.trim(), ...result });
  } catch (error) {
    console.error('AI learn error:', error.message);
    res.status(500).json({ message: 'Could not generate an explanation right now — please try again.' });
  }
});

module.exports = router;
