const express = require('express');
const router = express.Router();
const StudySession = require('../models/StudySession');
const { protect } = require('../middleware/authMiddleware');
const { computeStudyFacts } = require('../utils/studyFacts');
const llmService = require('../services/llmService');

router.use(protect);

// Fields the onboarding wizard / profile editor are allowed to write.
// Keeping this as an allow-list (rather than `req.user.profile = req.body`)
// stops a client from ever setting onboardingCompleted or injecting
// unexpected keys directly.
const WRITABLE_FIELDS = [
  'educationLevel', 'schoolClass', 'year', 'semester', 'branch', 'department',
  'stream', 'institution', 'subjects', 'academicGoals', 'careerGoals',
  'targetExam', 'targetDate', 'dailyStudyMinutes', 'preferredStudyTime',
  'strengths', 'weakAreas', 'learningPreferences', 'careerInterests', 'skills',
];

// @route   GET /api/profile
// @desc    Fetch the current student's full profile
router.get('/', async (req, res) => {
  res.json(req.user.profile || {});
});

// @route   PUT /api/profile
// @desc    Create/update the student profile. Used by both the onboarding
//          wizard (Phase 1, first save marks onboardingCompleted = true)
//          and the "Edit profile" flow on the Profile tab (Phase 21).
router.put('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!req.user.profile) req.user.profile = {};

    for (const field of WRITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      req.user.profile[field] = body[field];
    }

    // Any successful save of the wizard's final step completes onboarding.
    if (body.completeOnboarding) {
      req.user.profile.onboardingCompleted = true;
    }

    req.user.markModified('profile');
    await req.user.save();
    res.json(req.user.toPublicJSON());
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to save profile' });
  }
});

// @route   GET /api/profile/summary
// @desc    "AI Student Summary" card on the Profile tab. Hybrid: real LLM
//          when configured, deterministic rule-based paragraph otherwise -
//          same fallback pattern as the rest of the app's AI features.
router.get('/summary', async (req, res) => {
  try {
    const profile = req.user.profile || {};
    const sessions = await StudySession.find({ user: req.user._id });
    const facts = computeStudyFacts(sessions, req.user);

    if (llmService.isConfigured()) {
      try {
        const summary = await llmService.generateStudentSummary(profile, facts);
        if (summary) return res.json({ summary, source: 'ai' });
      } catch (err) {
        // fall through to rule-based summary below
      }
    }

    res.json({ summary: buildRuleBasedSummary(profile, req.user, facts), source: 'rule-based' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to build summary' });
  }
});

// ===== Rule-based fallback (zero-API-key path) =====
function levelLabel(level) {
  return {
    school: 'a school student',
    pu: 'a PU / junior college student',
    undergraduate: 'an undergraduate student',
    postgraduate: 'a postgraduate student',
    competitive: 'preparing for a competitive exam',
    government: 'preparing for a government exam',
    other: 'a self-directed learner',
  }[level] || 'a student';
}

function buildRuleBasedSummary(profile, user, facts) {
  const parts = [];
  const name = user.name ? user.name.split(' ')[0] : 'You';

  parts.push(`${name}, you're ${levelLabel(profile.educationLevel)}${profile.institution ? ` at ${profile.institution}` : ''}.`);

  if (profile.subjects && profile.subjects.length) {
    parts.push(`Right now you're focused on ${profile.subjects.slice(0, 4).join(', ')}.`);
  }
  if (profile.targetExam || profile.careerGoals) {
    const goal = profile.targetExam ? `cracking ${profile.targetExam}` : profile.careerGoals;
    parts.push(`Your goal is ${goal}${profile.targetDate ? ` by ${profile.targetDate}` : ''}.`);
  }
  if (facts && typeof facts.completionRate === 'number') {
    parts.push(`Your recent completion rate is ${Math.round(facts.completionRate)}%, with a ${user.streak || 0}-day streak.`);
  }
  if (profile.weakAreas && profile.weakAreas.length) {
    parts.push(`Consider spending extra focused time on ${profile.weakAreas[0]} this week - it's a self-identified weak area.`);
  } else if (facts && facts.weakSubjects && facts.weakSubjects.length) {
    parts.push(`${facts.weakSubjects[0]} has the lowest completion rate right now - worth a session soon.`);
  }
  if (parts.length <= 1) {
    parts.push('Finish setting up your profile and log a few study sessions so this summary can get sharper.');
  }
  return parts.join(' ');
}

module.exports = router;
