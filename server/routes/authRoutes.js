const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { asQueryString } = require('../utils/sanitize');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @route   POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const name = asQueryString(req.body.name, { maxLength: 100 });
    const email = asQueryString(req.body.email, { maxLength: 254 })?.toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : undefined;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill in all fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await User.create({ name, email, password });

    res.status(201).json({
      message: 'Account created successfully',
      user: user.toPublicJSON(),
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = asQueryString(req.body.email, { maxLength: 254 })?.toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : undefined;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      message: 'Login successful',
      user: user.toPublicJSON(),
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json(req.user.toPublicJSON());
});

// @route   PUT /api/auth/preferences
// @desc    Update notification preferences
router.put('/preferences', protect, async (req, res) => {
  try {
    const { notificationsEnabled, reminderMinutesBefore, remainingReminderIntervalMinutes } = req.body;
    if (typeof notificationsEnabled === 'boolean') {
      req.user.notificationsEnabled = notificationsEnabled;
    }
    if (typeof reminderMinutesBefore === 'number') {
      req.user.reminderMinutesBefore = reminderMinutesBefore;
    }
    if (typeof remainingReminderIntervalMinutes === 'number') {
      req.user.remainingReminderIntervalMinutes = remainingReminderIntervalMinutes;
    }
    await req.user.save();
    res.json(req.user.toPublicJSON());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
