const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();

// Phase 16: standard protective headers (clickjacking, MIME-sniffing, HSTS,
// etc.). contentSecurityPolicy is off deliberately - the whole frontend is
// built on inline onclick="" handlers throughout every page, and helmet's
// default CSP blocks inline script by default, which would break the app
// rather than secure it. Everything else helmet sets stays on.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phase 16: rate-limit auth endpoints specifically (brute-force / account
// enumeration protection) rather than the whole API - the rest of the app
// relies on frequent legitimate polling (30s timer heartbeats, 60s
// notification checks), so a blanket limiter would risk breaking real usage.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts - please try again in a few minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// Ensure a DB connection exists before any API route runs. connectDB() is
// cached, so on warm serverless invocations this resolves instantly.
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection error:', err.message);
    res.status(500).json({ message: 'Database connection failed. Check MONGO_URI.' });
  }
});

// ===== API Routes =====
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/sessions', require('./routes/sessionRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/cron', require('./routes/cronRoutes'));
app.use('/api/study-sessions', require('./routes/studySessionRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/tests', require('./routes/testRoutes'));
app.use('/api/mistakes', require('./routes/mistakeRoutes'));
app.use('/api/flashcards', require('./routes/flashcardRoutes'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Smart Study Planner API is running 🎓' });
});

// ===== Phase 16: 404 for unmatched API routes =====
// Without this, a typo'd or removed endpoint falls through to Express's
// default (non-JSON) 404 page instead of a clean API error the frontend's
// apiFetch() can handle consistently. Placed after every real route
// (including /api/health above) so it only ever catches genuine misses.
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Serve the static frontend (only matters for local dev; on Vercel this is
// served directly from /public by the platform, but keeping this doesn't hurt).
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

module.exports = app;
