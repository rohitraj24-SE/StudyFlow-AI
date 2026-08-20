// ===== CENTRALIZED LLM SERVICE =====
// The ONLY place in the codebase that talks to OpenAI. Every AI route goes
// through here so there's a single spot to change providers, models, retry
// logic, or cost controls.
//
// Configured via env vars (see .env.example):
//   OPENAI_API_KEY   - required to enable real LLM responses
//   OPENAI_MODEL     - defaults to 'gpt-4o-mini' (cheap + fast, good enough
//                       for tutoring/coaching use cases)
//
// If OPENAI_API_KEY is not set, isConfigured() returns false and every
// route that depends on this service falls back to its existing
// deterministic/rule-based behavior instead of failing. StudyFlow AI is
// designed to work with zero AI spend out of the box.

let OpenAI = null;
try {
  // Lazy require so the app still boots if the package isn't installed yet
  // (e.g. before `npm install` picks up the new dependency).
  OpenAI = require('openai');
} catch (err) {
  OpenAI = null;
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_HISTORY_MESSAGES = 8; // cost control: only recent turns are sent
const MAX_TOKENS = 500; // cost control: keep responses concise

let client = null;
function getClient() {
  if (!OpenAI || !process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function isConfigured() {
  return Boolean(getClient());
}

const STUDYFLOW_SYSTEM_PROMPT = `You are StudyFlow AI Coach, an encouraging, knowledgeable study and career-prep assistant embedded inside a student productivity app.

Rules you must follow:
- Explain concepts clearly, adapting difficulty to what the student seems to know. Use short examples (and code snippets when the topic is technical) where helpful.
- Guide the student's thinking rather than only handing over answers — ask a brief follow-up question when it would help them learn, but don't force it if they just want a direct answer.
- You will sometimes be given a block of "Known facts about this student" (their real completion rate, streak, weak subjects, etc.) computed by the app's own analytics, NOT by you. Treat these as ground truth. Never invent or guess numeric stats, subjects, or streaks that weren't given to you — if you don't have a fact, say you don't have that data instead of making one up.
- Stay focused on studying, learning, and career/interview preparation. Politely decline unrelated requests (and don't provide medical, legal, or financial advice).
- If you are not sure about something, say so plainly instead of guessing.
- Keep responses concise and well-formatted (short paragraphs, bullet points, or numbered steps) — this is a chat panel, not an essay.`;

/**
 * Free-form conversational coaching / doubt-clearing.
 * @param {Object} opts
 * @param {string} opts.message - the student's latest message
 * @param {Array<{role:'user'|'assistant', content:string}>} [opts.history]
 * @param {Object} [opts.facts] - deterministic facts from computeStudyFacts()
 * @returns {Promise<string>} the assistant's reply text
 */
async function chatCoach({ message, history = [], facts = null }) {
  const c = getClient();
  if (!c) throw new Error('LLM_NOT_CONFIGURED');

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));

  const messages = [{ role: 'system', content: STUDYFLOW_SYSTEM_PROMPT }];

  if (facts) {
    messages.push({
      role: 'system',
      content: `Known facts about this student (computed by the app, treat as ground truth):\n${JSON.stringify(facts)}`,
    });
  }

  messages.push(...trimmedHistory);
  messages.push({ role: 'user', content: String(message).slice(0, 4000) });

  const response = await c.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.6,
  });

  return response.choices?.[0]?.message?.content?.trim() || "I couldn't generate a response — please try again.";
}

/**
 * Turns deterministic analytics facts into a short natural-language coaching
 * insight. The LLM narrates; it does not invent the underlying numbers.
 * @param {Object} facts - output of computeStudyFacts()
 * @returns {Promise<string>}
 */
async function narrateInsight(facts) {
  const c = getClient();
  if (!c) throw new Error('LLM_NOT_CONFIGURED');

  const response = await c.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: STUDYFLOW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Here are my current study analytics (computed by the app): ${JSON.stringify(facts)}.\n\nIn 3-5 short sentences, give me a personalized, encouraging coaching insight based ONLY on these facts. Mention one concrete thing to focus on today.`,
      },
    ],
    max_tokens: 220,
    temperature: 0.6,
  });

  return response.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Suggests a prioritized interview-prep curriculum given the student's
 * chosen role/topics. The LLM only RECOMMENDS an ordering/priority split —
 * it never writes directly to the database; the route layer decides what to
 * persist and only after the user accepts.
 * @param {Object} config - { targetRole, experienceLevel, dailyMinutes, daysRemaining, topics: [{name, category, difficulty}] }
 * @returns {Promise<string>}
 */
async function suggestInterviewCurriculum(config) {
  const c = getClient();
  if (!c) throw new Error('LLM_NOT_CONFIGURED');

  const response = await c.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: STUDYFLOW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `I'm preparing for a "${config.targetRole}" interview as a ${config.experienceLevel}, with ${config.dailyMinutes} minutes/day and ${config.daysRemaining} days left. My selected topics: ${JSON.stringify(config.topics)}.\n\nGroup these topics into "Priority 1", "Priority 2", and "Priority 3" (most to least urgent) based on typical interview weight for this role, and give one sentence of reasoning. Keep it short and use this exact format:\n\nPriority 1:\n- topic\n- topic\n\nPriority 2:\n...\n\nPriority 3:\n...\n\nReasoning: ...`,
      },
    ],
    max_tokens: 350,
    temperature: 0.4,
  });

  return response.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Generates multiple-choice quiz questions for the Practice/Tests feature.
 * Always returns strict JSON (response_format: json_object) which the
 * caller (quizService.js) validates - a malformed or missing field for any
 * question causes that question to be dropped, never silently guessed.
 * @param {Object} opts
 * @param {string} opts.subject
 * @param {string} [opts.topic]
 * @param {string} opts.difficulty - 'easy' | 'medium' | 'hard'
 * @param {number} opts.numQuestions
 * @returns {Promise<Array<{questionText, options: string[4], correctIndex, explanation}>>}
 */
async function generateQuiz({ subject, topic, difficulty, numQuestions }) {
  const c = getClient();
  if (!c) throw new Error('LLM_NOT_CONFIGURED');

  const response = await c.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You write multiple-choice quiz questions for a student study app. Always respond with valid JSON only - no markdown, no commentary.',
      },
      {
        role: 'user',
        content: `Write ${numQuestions} multiple-choice questions on the subject "${subject}"${topic ? ` (specific topic: "${topic}")` : ''} at ${difficulty} difficulty for a student studying this subject.\n\nRespond with JSON in exactly this shape and nothing else:\n{"questions": [{"questionText": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..."}]}\n\nRules: exactly 4 options per question, correctIndex is the 0-based index of the correct option, explanation is 1-2 concise sentences on why that answer is correct.`,
      },
    ],
    max_tokens: 1800,
    temperature: 0.5,
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty quiz response from LLM');

  const parsed = JSON.parse(raw); // let a parse failure bubble up - caller falls back
  if (!parsed || !Array.isArray(parsed.questions)) throw new Error('Malformed quiz response shape');
  return parsed.questions;
}

/**
 * Phase 11: "Learn Anything" - explains a topic/question in plain language
 * with a worked example and key points, using structured JSON output so the
 * frontend can render distinct sections (never a single wall of text).
 * @param {Object} opts
 * @param {string} opts.topic - the topic, question, or pasted notes to explain
 * @param {Object} [opts.facts] - deterministic student facts, for tone/level only
 * @returns {Promise<{explanation:string, example:string, keyPoints:string[]}>}
 */
async function explainTopic({ topic, facts = null }) {
  const c = getClient();
  if (!c) throw new Error('LLM_NOT_CONFIGURED');

  const response = await c.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a study explainer inside a student app. Always respond with valid JSON only - no markdown, no commentary. Keep language clear and adapted to a student who is encountering this for the first time.',
      },
      {
        role: 'user',
        content: `Explain this for a student: "${String(topic).slice(0, 500)}"${facts ? `\n\nKnown facts about this student (for tone/level calibration only, don't restate them): ${JSON.stringify(facts)}` : ''}\n\nRespond with JSON in exactly this shape and nothing else:\n{"explanation": "2-4 short sentences in plain language", "example": "one short concrete worked example", "keyPoints": ["3-5 short bullet-point facts to remember"]}`,
      },
    ],
    max_tokens: 500,
    temperature: 0.5,
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty explanation response from LLM');

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.explanation !== 'string') throw new Error('Malformed explanation response shape');

  return {
    explanation: parsed.explanation.trim(),
    example: typeof parsed.example === 'string' ? parsed.example.trim() : '',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter((p) => typeof p === 'string' && p.trim()).slice(0, 6) : [],
  };
}

/**
 * Generates front/back flashcard pairs for the Flashcards feature (Phase 12).
 * Same JSON-mode + validation pattern as generateQuiz - a malformed pair is
 * dropped by the caller (flashcardService.js), never guessed.
 * @param {Object} opts
 * @param {string} opts.subject
 * @param {string} [opts.topic]
 * @param {number} opts.count
 * @returns {Promise<Array<{front:string, back:string}>>}
 */
async function generateFlashcards({ subject, topic, count }) {
  const c = getClient();
  if (!c) throw new Error('LLM_NOT_CONFIGURED');

  const response = await c.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You write flashcards for a student study app. Always respond with valid JSON only - no markdown, no commentary.',
      },
      {
        role: 'user',
        content: `Write ${count} flashcards on the subject "${subject}"${topic ? ` (specific topic: "${topic}")` : ''} for a student studying this.\n\nRespond with JSON in exactly this shape and nothing else:\n{"cards": [{"front": "short question or term", "back": "concise answer or definition"}]}\n\nRules: front is a short prompt (a term or question), back is a concise, self-contained answer (1-2 sentences max).`,
      },
    ],
    max_tokens: 900,
    temperature: 0.5,
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty flashcard response from LLM');

  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.cards)) throw new Error('Malformed flashcard response shape');
  return parsed.cards;
}

module.exports = { isConfigured, chatCoach, narrateInsight, suggestInterviewCurriculum, generateQuiz, explainTopic, generateFlashcards, MODEL };
