const mongoose = require('mongoose');

const jobApplicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    company: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    role: {
      type: String,
      required: [true, 'Role/position is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['Applied', 'Assessment', 'Interview', 'Offer', 'Rejected'],
      default: 'Applied',
    },
    appliedDate: {
      type: Date,
      default: Date.now,
    },
    interviewDate: {
      type: Date,
      default: null,
    },
    link: {
      type: String,
      trim: true,
      default: '',
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    salary: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    nextStep: {
      type: String,
      trim: true,
      default: '',
    },
    nextStepDate: {
      type: Date,
      default: null,
    },
    prepPlan: {
      type: [
        {
          date: { type: Date, required: true },
          topic: { type: String, required: true },
          addedToPlanner: { type: Boolean, default: false },
        },
      ],
      default: [],
    },

    // ===== Custom interview preparation (role, topic checklist, AI suggestion) =====
    prepConfig: {
      targetRole: { type: String, default: 'Software Developer' },
      experienceLevel: { type: String, enum: ['Fresher', 'Junior', 'Mid-level', 'Senior'], default: 'Fresher' },
      dailyPrepMinutes: { type: Number, default: 90 },
      topics: {
        type: [
          {
            name: { type: String, required: true },
            category: { type: String, default: 'General' },
            selected: { type: Boolean, default: true },
            custom: { type: Boolean, default: false },
            difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
            priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
          },
        ],
        default: [],
      },
      aiSuggestion: {
        text: { type: String, default: '' },
        status: { type: String, enum: ['none', 'pending', 'accepted', 'rejected'], default: 'none' },
        generatedAt: { type: Date, default: null },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
