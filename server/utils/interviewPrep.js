// ===== INTERVIEW PREP PLAN GENERATOR =====
// Given an interview date, lays out a fixed DSA/CS-fundamentals curriculum
// on the days leading up to it, ending on the interview date itself.
// If there are more available days than curriculum topics, the earliest
// days get an extra "Light Review" buffer; if there are fewer days than
// topics, we compress by dropping the lowest-priority topics from the front
// (keeping Mock Interview, Revision, Light Review, and Interview day intact).

const CORE_CURRICULUM = [
  'Arrays & Strings',
  'Linked Lists',
  'Trees',
  'Graphs',
  'DBMS',
  'Operating Systems',
  'Computer Networks',
  'Mock Interview',
  'Revision',
  'Light Review',
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {Date|string} interviewDate
 * @returns {Array<{date: Date, topic: string}>} plan ending on interviewDate ("Interview Day")
 */
function generatePrepPlan(interviewDate) {
  const interview = new Date(interviewDate);
  interview.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAvailable = Math.floor((interview - today) / DAY_MS); // days strictly before interview
  const plan = [];

  if (daysAvailable <= 0) {
    // Interview is today or in the past - just return the interview day entry
    plan.push({ date: interview, topic: 'Interview Day' });
    return plan;
  }

  let topics = [...CORE_CURRICULUM];

  if (daysAvailable < topics.length) {
    // Compress: keep the tail (Mock Interview, Revision, Light Review) and
    // trim from the front of the core-subject list.
    const mustKeep = ['Mock Interview', 'Revision', 'Light Review'];
    const front = topics.filter((t) => !mustKeep.includes(t));
    const trimmedFront = front.slice(Math.max(0, front.length - (daysAvailable - mustKeep.length)));
    topics = [...trimmedFront, ...mustKeep];
    // If still too many (very short prep windows), just take the most recent N
    if (topics.length > daysAvailable) {
      topics = topics.slice(topics.length - daysAvailable);
    }
  } else if (daysAvailable > topics.length) {
    // Pad the front with extra generic review days
    const extra = daysAvailable - topics.length;
    const padding = Array.from({ length: extra }, (_, i) => `General Review ${i + 1}`);
    topics = [...padding, ...topics];
  }

  // Lay topics out on the days immediately before the interview, in order,
  // finishing the day before the interview.
  const startOffset = topics.length; // topics.length days before interview date
  for (let i = 0; i < topics.length; i++) {
    const date = new Date(interview.getTime() - (startOffset - i) * DAY_MS);
    plan.push({ date, topic: topics[i] });
  }

  plan.push({ date: interview, topic: 'Interview Day' });
  return plan;
}

// ===== ROLE-SPECIFIC CURRICULUM TEMPLATES =====
// Used to pre-populate the "Custom Interview Preparation" topic checklist
// (see jobRoutes.js -> PUT /:id/prep-config). Users can toggle any of these
// on/off and add their own custom topics on top.
const ROLE_CURRICULA = {
  'Software Developer': {
    DSA: ['Arrays', 'Strings', 'Linked Lists', 'Trees', 'Graphs', 'Dynamic Programming'],
    'CS Fundamentals': ['DBMS', 'Operating Systems', 'Computer Networks', 'OOP', 'System Design'],
    Development: ['JavaScript', 'Node.js'],
    Interview: ['HR / Behavioral', 'Mock Interview'],
  },
  'Frontend Developer': {
    DSA: ['Arrays', 'Strings'],
    'Web Fundamentals': ['HTML', 'CSS', 'JavaScript', 'Browser Concepts', 'Web APIs'],
    Development: ['React'],
    Interview: ['HR / Behavioral', 'Mock Interview'],
  },
  'Backend Developer': {
    DSA: ['Arrays', 'Strings', 'Trees'],
    Development: ['Node.js', 'Express', 'REST APIs', 'Authentication'],
    'CS Fundamentals': ['Databases', 'System Design'],
    Interview: ['HR / Behavioral', 'Mock Interview'],
  },
  'Data Analyst': {
    'Data Skills': ['SQL', 'Python', 'Statistics', 'Excel', 'Data Visualization'],
    Tools: ['Power BI / Tableau'],
    Interview: ['Case Studies', 'HR / Behavioral'],
  },
};

const DEFAULT_ROLE = 'Software Developer';

function getRoleCurriculum(role) {
  return ROLE_CURRICULA[role] || ROLE_CURRICULA[DEFAULT_ROLE];
}

/**
 * Builds a prep plan from a user-customized, ordered/prioritized topic list
 * instead of the fixed CORE_CURRICULUM. Topics are laid out across the
 * available days, respecting priority order (High -> Medium -> Low) so the
 * most important topics land first, ending on Interview Day. If there are
 * more topics than days, lower-priority topics are compressed into shared
 * days (comma-joined); if there are fewer topics than days, review days are
 * appended.
 *
 * @param {Date|string} interviewDate
 * @param {Array<{name: string, priority?: 'High'|'Medium'|'Low'}>} topics
 * @returns {Array<{date: Date, topic: string}>}
 */
function generateCustomPrepPlan(interviewDate, topics) {
  const interview = new Date(interviewDate);
  interview.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAvailable = Math.floor((interview - today) / DAY_MS);
  const plan = [];

  if (daysAvailable <= 0) {
    plan.push({ date: interview, topic: 'Interview Day' });
    return plan;
  }

  const priorityRank = { High: 0, Medium: 1, Low: 2 };
  const orderedNames = [...topics]
    .sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1))
    .map((t) => t.name)
    .filter(Boolean);

  const withTail = orderedNames.length ? [...orderedNames, 'Revision', 'Mock Interview'] : ['Revision', 'Mock Interview'];

  let dayBuckets;
  if (withTail.length <= daysAvailable) {
    // Pad the front with generic review days
    const extra = daysAvailable - withTail.length;
    const padding = Array.from({ length: extra }, (_, i) => `General Review ${i + 1}`);
    dayBuckets = [...padding, ...withTail].map((t) => [t]);
  } else {
    // Compress: distribute topics evenly across available days, grouping
    // multiple topics onto the same day where needed.
    dayBuckets = Array.from({ length: daysAvailable }, () => []);
    withTail.forEach((topic, i) => {
      dayBuckets[i % daysAvailable].push(topic);
    });
    // Keep chronological grouping intact (topics assigned round-robin above
    // can land out of order) - re-group sequentially instead for readability.
    dayBuckets = [];
    const perDay = Math.ceil(withTail.length / daysAvailable);
    for (let i = 0; i < daysAvailable; i++) {
      dayBuckets.push(withTail.slice(i * perDay, (i + 1) * perDay));
    }
  }

  const startOffset = dayBuckets.length;
  for (let i = 0; i < dayBuckets.length; i++) {
    const date = new Date(interview.getTime() - (startOffset - i) * DAY_MS);
    const topic = dayBuckets[i].filter(Boolean).join(', ') || 'Light Review';
    plan.push({ date, topic });
  }

  plan.push({ date: interview, topic: 'Interview Day' });
  return plan;
}

module.exports = {
  generatePrepPlan,
  generateCustomPrepPlan,
  CORE_CURRICULUM,
  ROLE_CURRICULA,
  getRoleCurriculum,
};
