const express = require('express');
const router = express.Router();
const JobApplication = require('../models/JobApplication');
const StudySession = require('../models/StudySession');
const TestAttempt = require('../models/TestAttempt');
const { protect } = require('../middleware/authMiddleware');
const { generatePrepPlan, generateCustomPrepPlan, ROLE_CURRICULA, getRoleCurriculum } = require('../utils/interviewPrep');
const llmService = require('../services/llmService');

router.use(protect);

const DATE_TO_DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// @route   GET /api/jobs/career-readiness
// @desc    Phase 14: "Career Readiness" - per-subject test accuracy (Phase 10
//          TestAttempt data) plus real interview-prep completion (planner
//          sessions tagged "Interview Prep" from the prep-plan sync below).
//          Deliberately does NOT include a "Projects" category or anything
//          else the app has no actual data for - only ever surfaces what's
//          computed from the student's own attempts/sessions.
router.get('/career-readiness', async (req, res) => {
  try {
    const attempts = await TestAttempt.find({ user: req.user._id }).lean();

    const bySubject = {};
    attempts.forEach((a) => {
      if (!bySubject[a.subject]) bySubject[a.subject] = { total: 0, sumAccuracy: 0 };
      bySubject[a.subject].total += 1;
      bySubject[a.subject].sumAccuracy += a.accuracy;
    });

    const skillReadiness = Object.entries(bySubject)
      .map(([subject, v]) => ({ subject, accuracy: Math.round(v.sumAccuracy / v.total), attemptCount: v.total }))
      .sort((a, b) => b.attemptCount - a.attemptCount)
      .slice(0, 4);

    const prepSessions = await StudySession.find({ user: req.user._id, tag: 'Interview Prep' }).lean();
    const interviewPrepReadiness = prepSessions.length
      ? {
          completed: prepSessions.filter((s) => s.completed).length,
          total: prepSessions.length,
          percent: Math.round((prepSessions.filter((s) => s.completed).length / prepSessions.length) * 100),
        }
      : null;

    let recommendation = null;
    if (skillReadiness.length) {
      const weakest = [...skillReadiness].sort((a, b) => a.accuracy - b.accuracy)[0];
      if (weakest.accuracy < 75) {
        recommendation = `Your ${weakest.subject} accuracy (${weakest.accuracy}%) is your lowest tested area — a few more practice questions there would help most.`;
      }
    }

    res.json({ skillReadiness, interviewPrepReadiness, recommendation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await JobApplication.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/jobs/stats
router.get('/stats', async (req, res) => {
  try {
    const jobs = await JobApplication.find({ user: req.user._id }).lean();
    const byStatus = { Applied: 0, Assessment: 0, Interview: 0, Offer: 0, Rejected: 0 };
    for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;

    const totalActive = jobs.filter((j) => j.status !== 'Rejected').length;
    const responseRate = jobs.length
      ? Math.round(((byStatus.Assessment + byStatus.Interview + byStatus.Offer + byStatus.Rejected) / jobs.length) * 100)
      : 0;

    res.json({ total: jobs.length, byStatus, totalActive, responseRate });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/jobs
router.post('/', async (req, res) => {
  try {
    const { company, role, status, appliedDate, interviewDate, link, location, salary, notes, nextStep, nextStepDate } = req.body;
    if (!company || !role) {
      return res.status(400).json({ message: 'Company and role are required' });
    }
    const job = await JobApplication.create({
      user: req.user._id,
      company,
      role,
      status: status || 'Applied',
      appliedDate: appliedDate || Date.now(),
      interviewDate: interviewDate || null,
      link,
      location,
      salary,
      notes,
      nextStep,
      nextStepDate: nextStepDate || null,
    });
    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update a job application (status changes for the Kanban board go
//          through this too).
router.put('/:id', async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });

    const previousStatus = job.status;
    Object.assign(job, req.body);
    await job.save();

    res.json({ job, statusChanged: previousStatus !== job.status, previousStatus });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/jobs/:id
router.delete('/:id', async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });

    await JobApplication.findByIdAndDelete(req.params.id);
    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/jobs/:id/prep-plan
// @desc    Generate (or regenerate) a day-by-day interview prep curriculum
//          counting back from the job's interviewDate. Does not touch the
//          planner by itself - see /prep-plan/sync-to-planner for that.
router.post('/:id/prep-plan', async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });
    if (!job.interviewDate) {
      return res.status(400).json({ message: 'Set an interview date first' });
    }

    const plan = generatePrepPlan(job.interviewDate);
    job.prepPlan = plan.map((p) => ({ date: p.date, topic: p.topic, addedToPlanner: false }));
    await job.save();

    res.json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/jobs/:id/prep-plan/sync-to-planner
// @desc    Connects the Job Tracker to the Planner: creates one StudySession
//          per prep-plan topic (skipping ones already synced), tagged
//          "Interview Prep" so they're visually distinguishable, at a
//          default evening slot.
router.post('/:id/prep-plan/sync-to-planner', async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });
    if (!job.prepPlan || !job.prepPlan.length) {
      return res.status(400).json({ message: 'Generate a prep plan first' });
    }

    const DEFAULT_START = '18:00';
    const DEFAULT_DURATION = 60;
    let created = 0;

    for (const item of job.prepPlan) {
      if (item.addedToPlanner) continue;
      const day = DATE_TO_DAY_ABBR[new Date(item.date).getDay()];
      await StudySession.create({
        user: req.user._id,
        day,
        subject: `Interview Prep - ${job.company}`,
        timeSlot: `${DEFAULT_START} (${DEFAULT_DURATION} min)`,
        startTime: DEFAULT_START,
        duration: DEFAULT_DURATION,
        goal: item.topic,
        priority: 'High',
        tag: 'Interview Prep',
      });
      item.addedToPlanner = true;
      created += 1;
    }

    await job.save();
    res.json({ job, sessionsCreated: created });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== CUSTOM INTERVIEW PREPARATION =====

// @route   GET /api/jobs/prep-config/roles
// @desc    Returns the built-in role -> topic checklist templates (Software
//          Developer, Frontend Developer, Backend Developer, Data Analyst)
//          used to pre-populate the customization UI. Static reference data,
//          doesn't need :id.
router.get('/prep-config/roles', (req, res) => {
  res.json({ roles: Object.keys(ROLE_CURRICULA), curricula: ROLE_CURRICULA });
});

// @route   PUT /api/jobs/:id/prep-config
// @desc    Saves the user's customized interview-prep configuration: target
//          role, experience level, daily prep time, and the topic checklist
//          (built-in topics toggled on/off, plus any custom topics the user
//          added). Does NOT generate the plan itself - see
//          /prep-plan/custom below.
router.put('/:id/prep-config', async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });

    const { targetRole, experienceLevel, dailyPrepMinutes, topics } = req.body;

    job.prepConfig = job.prepConfig || {};
    if (targetRole) job.prepConfig.targetRole = targetRole;
    if (experienceLevel) job.prepConfig.experienceLevel = experienceLevel;
    if (typeof dailyPrepMinutes === 'number') job.prepConfig.dailyPrepMinutes = dailyPrepMinutes;
    if (Array.isArray(topics)) {
      job.prepConfig.topics = topics.map((t) => ({
        name: t.name,
        category: t.category || 'General',
        selected: t.selected !== false,
        custom: Boolean(t.custom),
        difficulty: t.difficulty || 'Medium',
        priority: t.priority || 'Medium',
      }));
    }

    await job.save();
    res.json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/jobs/:id/prep-plan/custom
// @desc    Generates a day-by-day plan from the saved prepConfig (only the
//          topics marked `selected`), respecting priority order. This runs
//          alongside - not instead of - the original fixed-curriculum
//          /prep-plan route.
router.post('/:id/prep-plan/custom', async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });
    if (!job.interviewDate) return res.status(400).json({ message: 'Set an interview date first' });
    if (!job.prepConfig || !job.prepConfig.topics || !job.prepConfig.topics.length) {
      return res.status(400).json({ message: 'Select at least one topic in your prep configuration first' });
    }

    const selectedTopics = job.prepConfig.topics.filter((t) => t.selected);
    const plan = generateCustomPrepPlan(job.interviewDate, selectedTopics);
    job.prepPlan = plan.map((p) => ({ date: p.date, topic: p.topic, addedToPlanner: false }));
    await job.save();

    res.json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/jobs/:id/prep-config/ai-suggestion
// @desc    Asks the LLM to prioritize the user's selected topics into
//          Priority 1/2/3 groups for their target role. This is only a
//          RECOMMENDATION - it's stored with status "pending" and never
//          silently changes the saved topic list. The user must explicitly
//          accept (which the frontend then reflects by re-saving priorities)
//          or reject it via PUT /prep-config or a dedicated accept action.
router.post('/:id/prep-config/ai-suggestion', async (req, res) => {
  try {
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });
    if (!job.prepConfig || !job.prepConfig.topics || !job.prepConfig.topics.length) {
      return res.status(400).json({ message: 'Select topics in your prep configuration first' });
    }

    const daysRemaining = job.interviewDate
      ? Math.max(0, Math.floor((new Date(job.interviewDate) - new Date()) / (24 * 60 * 60 * 1000)))
      : null;

    let text;
    if (llmService.isConfigured()) {
      try {
        text = await llmService.suggestInterviewCurriculum({
          targetRole: job.prepConfig.targetRole,
          experienceLevel: job.prepConfig.experienceLevel,
          dailyMinutes: job.prepConfig.dailyPrepMinutes,
          daysRemaining: daysRemaining ?? 'unspecified',
          topics: job.prepConfig.topics.filter((t) => t.selected).map((t) => ({ name: t.name, category: t.category })),
        });
      } catch (err) {
        console.error('AI curriculum suggestion failed:', err.message);
      }
    }

    if (!text) {
      // Deterministic fallback: keep CS-fundamentals/coding topics first,
      // HR/behavioral last, so the feature still works with zero AI cost.
      const selected = job.prepConfig.topics.filter((t) => t.selected).map((t) => t.name);
      const interviewish = selected.filter((n) => /hr|behavioral|mock/i.test(n));
      const rest = selected.filter((n) => !interviewish.includes(n));
      const third = Math.ceil(rest.length / 3);
      text = [
        'Priority 1:',
        ...rest.slice(0, third).map((n) => `- ${n}`),
        '',
        'Priority 2:',
        ...rest.slice(third, third * 2).map((n) => `- ${n}`),
        '',
        'Priority 3:',
        ...rest.slice(third * 2).map((n) => `- ${n}`),
        ...interviewish.map((n) => `- ${n}`),
        '',
        'Reasoning: Ordered using a simple even split since a live AI connection is not configured on this deployment; core/technical topics are front-loaded and behavioral prep is kept last.',
      ].join('\n');
    }

    job.prepConfig.aiSuggestion = { text, status: 'pending', generatedAt: new Date() };
    await job.save();

    res.json({ job, llmUsed: llmService.isConfigured() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/jobs/:id/prep-config/ai-suggestion/:action
// @desc    Accept or reject a pending AI curriculum suggestion. Accepting
//          only updates the suggestion's status - the user still edits the
//          actual topic list/priorities themselves via PUT /prep-config,
//          per the "AI recommends, user decides" rule.
router.put('/:id/prep-config/ai-suggestion/:action', async (req, res) => {
  try {
    const { action } = req.params;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }
    const job = await JobApplication.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Application not found' });
    if (!job.prepConfig || !job.prepConfig.aiSuggestion) {
      return res.status(400).json({ message: 'No suggestion to update' });
    }
    job.prepConfig.aiSuggestion.status = action === 'accept' ? 'accepted' : 'rejected';
    await job.save();
    res.json(job);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
