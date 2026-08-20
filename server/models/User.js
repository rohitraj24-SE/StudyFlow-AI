const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ===== PHASE 1 / PHASE 21: Universal Student Profile =====
// Deliberately a real sub-schema (not Mixed) so every field has a defined
// type/default and Mongoose actually persists it - a Mixed or undeclared
// path would silently no-op under the model's default strict mode.
const profileSchema = new mongoose.Schema(
  {
    educationLevel: { type: String, default: '' }, // school | pu | undergraduate | postgraduate | competitive | government | other
    schoolClass: { type: String, default: '' },
    year: { type: String, default: '' },
    semester: { type: String, default: '' },
    branch: { type: String, default: '' },
    department: { type: String, default: '' },
    stream: { type: String, default: '' },
    institution: { type: String, default: '' },
    subjects: { type: [String], default: [] },
    academicGoals: { type: String, default: '' },
    careerGoals: { type: String, default: '' },
    targetExam: { type: String, default: '' },
    targetDate: { type: String, default: '' },
    dailyStudyMinutes: { type: Number, default: 120 },
    preferredStudyTime: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    weakAreas: { type: [String], default: [] },
    learningPreferences: { type: [String], default: [] },
    careerInterests: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    onboardingCompleted: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },

    // ===== Gamification =====
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastCompletedDate: { type: String, default: null }, // stored as YYYY-MM-DD (local)
    totalSessionsCompleted: { type: Number, default: 0 },
    totalMinutesStudied: { type: Number, default: 0 },
    totalTestsCompleted: { type: Number, default: 0 },
    badges: { type: [String], default: [] },

    // ===== Notification preferences =====
    notificationsEnabled: { type: Boolean, default: true },
    reminderMinutesBefore: { type: Number, default: 10 },
    // "You still have Xh left today" nudges (Phase 8: Smart Reminders tied
    // to the study timer's remaining-time calculation) - a separate cadence
    // from reminderMinutesBefore (which is about upcoming session start
    // times), so a student who wants frequent start-reminders isn't forced
    // into frequent remaining-time nudges too, and vice versa.
    remainingReminderIntervalMinutes: { type: Number, default: 120 },

    // ===== Phase 1 / Phase 21: Universal Student Profile =====
    profile: { type: profileSchema, default: () => ({}) },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Level derived purely from XP - no need to persist it
userSchema.methods.getLevel = function () {
  return Math.floor(this.xp / 100) + 1;
};

userSchema.methods.getXpForNextLevel = function () {
  const level = this.getLevel();
  const currentLevelFloor = (level - 1) * 100;
  const nextLevelCeiling = level * 100;
  return {
    level,
    xpIntoLevel: this.xp - currentLevelFloor,
    xpNeeded: nextLevelCeiling - currentLevelFloor,
    xpToNext: nextLevelCeiling - this.xp,
  };
};

userSchema.methods.toPublicJSON = function () {
  const { level, xpIntoLevel, xpNeeded, xpToNext } = this.getXpForNextLevel();
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    xp: this.xp,
    level,
    xpIntoLevel,
    xpNeeded,
    xpToNext,
    streak: this.streak,
    longestStreak: this.longestStreak,
    totalSessionsCompleted: this.totalSessionsCompleted,
    totalMinutesStudied: this.totalMinutesStudied,
    totalTestsCompleted: this.totalTestsCompleted,
    badges: this.badges,
    notificationsEnabled: this.notificationsEnabled,
    reminderMinutesBefore: this.reminderMinutesBefore,
    remainingReminderIntervalMinutes: this.remainingReminderIntervalMinutes,
    profile: this.profile || {},
  };
};

module.exports = mongoose.model('User', userSchema);
