const mongoose = require('mongoose');

// Spaced-repetition schedule this model follows (in days). intervalIndex is
// how far along this ladder a card has climbed - see flashcardService.js
// reviewCard() for the exact promotion/reset rule.
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30];

const flashcardSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    topic: { type: String, default: '', trim: true },
    front: { type: String, required: true, trim: true },
    back: { type: String, required: true, trim: true },
    // 'mistake' cards are built directly from a wrong quiz answer (Phase 10)
    // so a bad test result turns into a revision item with one click.
    source: { type: String, enum: ['manual', 'ai', 'mistake'], default: 'manual' },
    mistake: { type: mongoose.Schema.Types.ObjectId, ref: 'Mistake' },

    intervalIndex: { type: Number, default: 0 }, // position on REVIEW_INTERVALS_DAYS
    reviewCount: { type: Number, default: 0 },
    correctStreak: { type: Number, default: 0 },
    nextReviewAt: { type: Date, default: Date.now, index: true }, // due immediately on creation
    lastReviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 'new' = never reviewed. 'mastered' = reached the longest interval and
// confirmed correct there at least twice in a row. Everything else is
// 'learning'. Computed, not stored, so the definition can't drift out of
// sync with the actual schedule.
flashcardSchema.methods.status = function status() {
  if (this.reviewCount === 0) return 'new';
  if (this.intervalIndex >= REVIEW_INTERVALS_DAYS.length - 1 && this.correctStreak >= 2) return 'mastered';
  return 'learning';
};

flashcardSchema.methods.toClientJSON = function toClientJSON() {
  return {
    _id: this._id,
    subject: this.subject,
    topic: this.topic,
    front: this.front,
    back: this.back,
    source: this.source,
    status: this.status(),
    reviewCount: this.reviewCount,
    nextReviewAt: this.nextReviewAt,
    lastReviewedAt: this.lastReviewedAt,
  };
};

module.exports = mongoose.model('Flashcard', flashcardSchema);
module.exports.REVIEW_INTERVALS_DAYS = REVIEW_INTERVALS_DAYS;
