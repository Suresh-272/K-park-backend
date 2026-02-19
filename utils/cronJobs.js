const cron = require('node-cron');
const Booking = require('../models/Booking');
const Waitlist = require('../models/Waitlist');
const sms = require('./sms');
const { triggerWaitlistReallocation } = require('../controllers/bookingController');

/**
 * Run every minute — auto-cancel bookings whose grace period has expired
 * (booking start time + GRACE_PERIOD_MINUTES) and user hasn't arrived
 */
const graceExpiryCron = cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const expiredBookings = await Booking.find({
      status: 'active',
      arrivedAt: null,
      gracePeriodDeadline: { $lte: now },
    }).populate(['user', 'slot']);

    for (const booking of expiredBookings) {
      booking.status = 'cancelled';
      booking.cancellationReason = 'Grace period expired — no-show';
      await booking.save();

      await sms.notifyGraceExpired(booking.user, booking.slot);

      await triggerWaitlistReallocation(
        booking.slot,
        booking.bookingDate,
        booking.startTime,
        booking.endTime
      );

      console.log(`[Grace Cron] Auto-cancelled booking ${booking._id} for ${booking.user.email}`);
    }
  } catch (err) {
    console.error('[Grace Cron] Error:', err.message);
  }
});

/**
 * Run every minute — expire waitlist confirmations that weren't confirmed in time
 */
const waitlistExpiryCron = cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const expiredEntries = await Waitlist.find({
      status: 'notified',
      confirmationDeadline: { $lte: now },
    }).populate('user');

    for (const entry of expiredEntries) {
      entry.status = 'expired';
      await entry.save();

      // Notify next in line
      const nextEntry = await Waitlist.findOne({
        bookingDate: entry.bookingDate,
        slotType: entry.slotType,
        status: 'waiting',
        createdAt: { $gt: entry.createdAt },
      })
        .sort({ createdAt: 1 })
        .populate('user');

      if (nextEntry) {
        const confirmDeadline = new Date(Date.now() + 10 * 60 * 1000);
        nextEntry.status = 'notified';
        nextEntry.notifiedAt = now;
        nextEntry.confirmationDeadline = confirmDeadline;
        await nextEntry.save();

        // We need a slot to tell them about — find one
        const ParkingSlot = require('../models/ParkingSlot');
        const slot = await ParkingSlot.findOne({ slotType: entry.slotType, isActive: true });
        if (slot) {
          await sms.notifySlotAvailable(nextEntry.user, slot, confirmDeadline.toTimeString().slice(0, 5));
        }
      }

      console.log(`[Waitlist Cron] Expired confirmation for entry ${entry._id}`);
    }
  } catch (err) {
    console.error('[Waitlist Cron] Error:', err.message);
  }
});

/**
 * Run every 5 minutes — send reminder 30 min before booking start
 */
const reminderCron = cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    const thirtyMinsLater = new Date(now.getTime() + 30 * 60 * 1000);

    const today = now.toISOString().split('T')[0];
    const targetHour = String(thirtyMinsLater.getHours()).padStart(2, '0');
    const targetMin = String(thirtyMinsLater.getMinutes()).padStart(2, '0');
    const targetTime = `${targetHour}:${targetMin}`;

    const upcomingBookings = await Booking.find({
      bookingDate: today,
      startTime: targetTime,
      status: 'active',
      arrivedAt: null,
    }).populate(['user', 'slot']);

    for (const booking of upcomingBookings) {
      await sms.notifyBookingReminder(booking.user, booking, booking.slot);
      console.log(`[Reminder Cron] Sent reminder for booking ${booking._id}`);
    }
  } catch (err) {
    console.error('[Reminder Cron] Error:', err.message);
  }
});

/**
 * Run daily at midnight — mark expired active bookings as 'expired'
 */
const dailyCleanupCron = cron.schedule('0 0 * * *', async () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cutoff = yesterday.toISOString().split('T')[0];

    const result = await Booking.updateMany(
      { status: 'active', bookingDate: { $lt: cutoff } },
      { status: 'expired' }
    );
    console.log(`[Daily Cron] Expired ${result.modifiedCount} old bookings.`);

    // Also expire old waitlist entries
    await Waitlist.updateMany(
      { status: 'waiting', bookingDate: { $lt: cutoff } },
      { status: 'expired' }
    );
  } catch (err) {
    console.error('[Daily Cron] Error:', err.message);
  }
});

module.exports = {
  graceExpiryCron,
  waitlistExpiryCron,
  reminderCron,
  dailyCleanupCron,
};
