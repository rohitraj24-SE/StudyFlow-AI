const mongoose = require('mongoose');

const mistakeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    testAttempt: { type: mongoose.Schema.Types.ObjectId, ref: 'TestAttempt' },
    subject: { type: String, required: true },
    topic: { type: String, default: '' },
    questionText: { type: String, required: true },
    options: { type: [String], required: true },
    correctIndex: { type: Number, required: true },
    selectedIndex: { type: Number, required: true },
    explanation: { type: String, default: '' },
    // Set true once the student answers this exact question correctly via
    // the "Try Again" flow (POST /api/mistakes/:id/retry).
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mistake', mistakeSchema);
