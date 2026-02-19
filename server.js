require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const slotRoutes = require('./routes/slotRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const waitlistRoutes = require('./routes/waitlistRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Connect to DB
connectDB();

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow your Netlify frontend + localhost for dev
const allowedOrigins = [
  'https://kpark.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // relaxed for demo
  message: { success: false, message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many booking requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingLimiter, bookingRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/admin', adminRoutes);

// Health check — used by cron-job.org to keep Render awake
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'K-Park API is running.',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'K-Park API. Visit /api/health for status.' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler (must be last)
app.use(errorHandler);

// ─── Start Cron Jobs (safe — won't crash server if they fail) ─────────────────
try {
  const { graceExpiryCron, waitlistExpiryCron, reminderCron, dailyCleanupCron } = require('./utils/cronJobs');
  graceExpiryCron.start();
  waitlistExpiryCron.start();
  reminderCron.start();
  dailyCleanupCron.start();
  console.log('✅ Cron jobs started.');
} catch (err) {
  console.error('⚠️  Cron jobs failed to start (non-fatal):', err.message);
}

// ─── Start Server ─────────────────────────────────────────────────────────────
// Render requires binding to 0.0.0.0 (not just port)
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 K-Park server running on http://${HOST}:${PORT}`);
});

module.exports = app;