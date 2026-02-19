const dotenv = require("dotenv");
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

// Route imports
const authRoutes = require('./routes/authRoutes');
const slotRoutes = require('./routes/slotRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const waitlistRoutes = require('./routes/waitlistRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Cron jobs
const { graceExpiryCron, waitlistExpiryCron, reminderCron, dailyCleanupCron } = require('./utils/cronJobs');

// Connect to DB
connectDB();

const app = express();

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Rate limiting for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: 'Too many requests from this IP. Please try again later.' },
});

// Rate limiting for booking routes
const bookingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { success: false, message: 'Too many booking requests. Slow down.' },
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingLimiter, bookingRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'K-Park API is running.' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler (must be last)
app.use(errorHandler);

// ─── Start Cron Jobs ─────────────────────────────────────────────────────────
graceExpiryCron.start();
waitlistExpiryCron.start();
reminderCron.start();
dailyCleanupCron.start();
console.log('Cron jobs started.');

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`K-Park server running on port ${PORT}`);
});

module.exports = app;
