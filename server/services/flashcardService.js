// ===== FLASHCARD SERVICE (Phase 12: Revision + Flashcards) =====
// Simple, transparent spaced-repetition ladder (server/models/Flashcard.js
// REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] days) - not full SM-2, but the
// same core idea: a correct review promotes the card to a longer interval,
// an incorrect one resets it to the start. All scheduling is real, computed
// from the card's own review history - nothing is faked as "due."

const llmService = require('./llmService');
const Flashcard = require('../models/Flashcard');
const Mistake = require('../models/Mistake');

const { REVIEW_INTERVALS_DAYS } = Flashcard;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function createManual(userId, { subject, topic = '', front, back }) {
  if (!subject || !subject.trim()) throw new Error('Subject is required');
  if (!front || !front.trim() || !back || !back.trim()) throw new Error('Both front and back are required');

  return Flashcard.create({
    user: userId,
    subject: subject.trim(),
    topic: topic.trim(),
    front: front.trim(),
    back: back.trim(),
    source: 'manual',
  });
}

async function createFromMistake(userId, mistakeId) {
  const mistake = await Mistake.findOne({ _id: mistakeId, user: userId });
  if (!mistake) throw new Error('Mistake not found');

  const existing = await Flashcard.findOne({ user: userId, mistake: mistake._id });
  if (existing) return existing; // idempotent - don't create duplicates if clicked twice

  return Flashcard.create({
    user: userId,
    subject: mistake.subject,
    topic: mistake.topic,
    front: mistake.questionText,
    back: `${mistake.options[mistake.correctIndex]}${mistake.explanation ? ` — ${mistake.explanation}` : ''}`,
    source: 'mistake',
    mistake: mistake._id,
  });
}

async function generateAI(userId, { subject, topic = '', count }) {
  if (!subject || !subject.trim()) throw new Error('Subject is required');
  const clampedCount = Math.min(10, Math.max(3, parseInt(count, 10) || 5));

  const raw = await llmService.generateFlashcards({ subject: subject.trim(), topic: topic.trim(), count: clampedCount });
  const sanitized = (Array.isArray(raw) ? raw : [])
    .filter((c) => c && typeof c.front === 'string' && c.front.trim() && typeof c.back === 'string' && c.back.trim())
    .slice(0, clampedCount)
    .map((c) => ({ front: c.front.trim(), back: c.back.trim() }));

  if (!sanitized.length) throw new Error('Could not generate flashcards right now — try again.');

  const docs = sanitized.map((c) => ({
    user: userId,
    subject: subject.trim(),
    topic: topic.trim(),
    front: c.front,
    back: c.back,
    source: 'ai',
  }));

  return Flashcard.insertMany(docs);
}

/**
 * Records one review outcome and reschedules the card.
 * @param {string} result - 'good' (recalled correctly) | 'again' (didn't)
 */
async function reviewCard(userId, cardId, result) {
  const card = await Flashcard.findOne({ _id: cardId, user: userId });
  if (!card) throw new Error('Flashcard not found');

  if (result === 'good') {
    card.intervalIndex = Math.min(card.intervalIndex + 1, REVIEW_INTERVALS_DAYS.length - 1);
    card.correctStreak += 1;
  } else {
    card.intervalIndex = 0;
    card.correctStreak = 0;
  }

  card.reviewCount += 1;
  card.lastReviewedAt = new Date();
  card.nextReviewAt = addDays(new Date(), REVIEW_INTERVALS_DAYS[card.intervalIndex]);
  await card.save();

  return card;
}

async function getDue(userId, limit = 30) {
  return Flashcard.find({ user: userId, nextReviewAt: { $lte: new Date() } })
    .sort({ nextReviewAt: 1 })
    .limit(limit);
}

async function getAll(userId, subject) {
  const filter = { user: userId };
  if (subject) filter.subject = subject;
  return Flashcard.find(filter).sort({ createdAt: -1 });
}

module.exports = { createManual, createFromMistake, generateAI, reviewCard, getDue, getAll };
