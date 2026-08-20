// ===== QUICK DOUBT-CLEARING ENGINE =====
// Honesty note: this is a lightweight, transparent keyword/topic matcher -
// not a general-purpose LLM. It recognizes common academic subject areas and
// question patterns, and responds with a structured, genuinely useful
// starting point (approach + what to check + where to dig deeper), rather
// than pretending to give an authoritative answer to an arbitrary question.
// Swap this out for a real LLM API call (OpenAI/Anthropic) in
// `server/routes/aiRoutes.js` if you want free-form answers.

const TOPIC_RULES = [
  {
    keywords: ['recursion', 'recursive'],
    subject: 'Computer Science',
    tip: "Recursion clicks once you nail two things: (1) the base case — the condition where the function stops calling itself, and (2) the recursive case — how the problem shrinks toward that base case. Trace a small example (like factorial(3)) by hand on paper, writing out each call and its return value, before trusting the code.",
  },
  {
    keywords: ['big o', 'time complexity', 'algorithm complexity', 'asymptotic'],
    subject: 'Computer Science',
    tip: "Big-O describes how runtime grows as input size grows, not exact speed. Count the loops: one loop over n items is O(n); a loop inside a loop is usually O(n²). Ignore constants and lower-order terms — O(2n + 5) simplifies to O(n).",
  },
  {
    keywords: ['integration', 'integral', 'antiderivative'],
    subject: 'Mathematics',
    tip: "Start by identifying the pattern: is it a basic power rule, or does it need substitution (look for a function and its derivative both present), integration by parts (product of two different types of functions), or partial fractions (rational function)? Always check your answer by differentiating it back.",
  },
  {
    keywords: ['derivative', 'differentiation'],
    subject: 'Mathematics',
    tip: "Differentiation is about rates of change. Master the core rules first (power, product, quotient, chain), then practice spotting which rule a problem needs before you start computing. The chain rule (for composite functions) trips up most students — always ask 'what's inside what?' first.",
  },
  {
    keywords: ['newton', 'law of motion', 'force', 'acceleration'],
    subject: 'Physics',
    tip: "For force/motion problems, always start with a free-body diagram — draw every force acting on the object before writing any equation. Then apply F = ma along each relevant axis separately (often horizontal and vertical).",
  },
  {
    keywords: ['thermodynamics', 'entropy', 'heat transfer'],
    subject: 'Physics',
    tip: "Thermodynamics problems usually hinge on identifying the system boundary (what's inside vs outside) and which law applies. Start by writing down what's conserved (energy in the 1st law) and what direction is favored (entropy increase in the 2nd law).",
  },
  {
    keywords: ['organic chemistry', 'reaction mechanism', 'functional group'],
    subject: 'Chemistry',
    tip: "For mechanism questions, identify the functional group first (that tells you what reactions are even possible), then track electron movement with curved arrows from electron-rich to electron-poor sites.",
  },
  {
    keywords: ['stoichiometry', 'mole', 'balancing equation'],
    subject: 'Chemistry',
    tip: "Balance the chemical equation first, then convert everything to moles before comparing quantities — grams, liters, and molecules can't be compared directly, but moles can via the coefficients in the balanced equation.",
  },
  {
    keywords: ['photosynthesis', 'cellular respiration', 'mitochondria'],
    subject: 'Biology',
    tip: "Photosynthesis and cellular respiration are near-mirror processes — photosynthesis stores energy (CO2 + water → glucose + O2), respiration releases it (glucose + O2 → CO2 + water + ATP). Drawing them side by side often makes both click at once.",
  },
  {
    keywords: ['essay structure', 'thesis statement', 'how to write an essay'],
    subject: 'Writing',
    tip: "A strong essay usually follows: a clear thesis (your argument in one sentence), body paragraphs that each defend one point of that thesis with evidence, and a conclusion that shows why the argument matters. Draft the thesis last if it's not clicking — write your points first, then summarize the throughline.",
  },
];

const GENERIC_TIPS = [
  "Try the Feynman technique: explain the concept out loud in the simplest words you can, as if teaching a beginner. Wherever you get stuck or reach for jargon, that's exactly the gap to go review.",
  "Break the question into smaller sub-questions. Most 'I don't understand this' moments are actually 'I don't understand this one specific step' — isolate it.",
  "Look for a worked example of the exact same problem type in your notes or textbook, and compare it step-by-step against what you're stuck on.",
  "Explain what you already know about the topic first, out loud or in writing — often the gap becomes obvious once you see what you can't articulate.",
];

const findTopicMatch = (question) => {
  const q = question.toLowerCase();
  return TOPIC_RULES.find((rule) => rule.keywords.some((kw) => q.includes(kw)));
};

const answerDoubt = (question) => {
  const trimmed = (question || '').trim();
  if (!trimmed) {
    return {
      answer: "Ask me a specific academic question — e.g. \"How does recursion work?\" or \"How do I approach an integration problem?\" — and I'll give you a starting point.",
      subject: null,
    };
  }

  const match = findTopicMatch(trimmed);
  if (match) {
    return {
      answer: `**${match.subject}** — ${match.tip}\n\nWant a deeper dive? Try the Resources tab with domain "${match.subject}" and your specific topic to pull up targeted videos and references.`,
      subject: match.subject,
    };
  }

  const fallback = GENERIC_TIPS[trimmed.length % GENERIC_TIPS.length];
  return {
    answer: `I don't have a specific rule for that exact topic yet, but here's a general approach: ${fallback}\n\nFor a topic-specific deep dive, try the Resources tab — enter the subject domain and the exact topic and I'll pull up targeted videos and references.`,
    subject: null,
  };
};

module.exports = { answerDoubt };
