const twilio = require('twilio');
const Notification = require('../models/Notification');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send SMS via Twilio and log to DB
 * @param {Object} user - User document (needs _id, phone)
 * @param {string} type - Notification type enum
 * @param {string} message - SMS body
 */
const sendSMS = async (user, type, message) => {
  let status = 'sent';
  let twilioSid = null;

  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: user.phone,
    });
    twilioSid = result.sid;
    console.log(`SMS sent to ${user.phone} [${type}]`);
  } catch (err) {
    console.error(`SMS failed for ${user.phone}:`, err.message);
    status = 'failed';
  }

  // Log regardless of success
  await Notification.create({
    user: user._id,
    phone: user.phone,
    type,
    message,
    status,
    twilioSid,
  });
};

// ----- Pre-built message templates -----

exports.notifyBookingConfirmed = async (user, booking, slot) => {
  const msg =
    `K-Park: Your booking is confirmed!\n` +
    `Slot: ${slot.slotNumber} | Date: ${booking.bookingDate}\n` +
    `Time: ${booking.startTime} - ${booking.endTime}\n` +
    `Vehicle: ${user.vehicleNumber}`;
  await sendSMS(user, 'booking_confirmed', msg);
};

exports.notifyBookingCancelled = async (user, booking, slot, reason = '') => {
  const msg =
    `K-Park: Booking CANCELLED.\n` +
    `Slot: ${slot.slotNumber} | Date: ${booking.bookingDate}\n` +
    (reason ? `Reason: ${reason}` : '');
  await sendSMS(user, 'booking_cancelled', msg);
};

exports.notifyBookingExtended = async (user, booking, slot) => {
  const msg =
    `K-Park: Booking extended!\n` +
    `Slot: ${slot.slotNumber} | New end time: ${booking.endTime}`;
  await sendSMS(user, 'booking_extended', msg);
};

exports.notifyGraceWarning = async (user, booking, slot, minutesLeft) => {
  const msg =
    `K-Park: Reminder - You have ${minutesLeft} min to mark arrival for Slot ${slot.slotNumber}.\n` +
    `Booking will auto-cancel if not confirmed.`;
  await sendSMS(user, 'grace_warning', msg);
};

exports.notifyGraceExpired = async (user, slot) => {
  const msg =
    `K-Park: Your booking for Slot ${slot.slotNumber} was auto-cancelled due to no-show (grace period expired).`;
  await sendSMS(user, 'grace_expired', msg);
};

exports.notifyWaitlistJoined = async (user, position) => {
  const msg =
    `K-Park: You have joined the waitlist.\n` +
    `Your position: #${position}. You will be notified when a slot becomes available.`;
  await sendSMS(user, 'waitlist_joined', msg);
};

exports.notifySlotAvailable = async (user, slot, confirmDeadline) => {
  const msg =
    `K-Park: A parking slot is now available!\n` +
    `Slot: ${slot.slotNumber} | Please confirm within 10 minutes (by ${confirmDeadline}).`;
  await sendSMS(user, 'waitlist_slot_available', msg);
};

exports.notifyBookingReminder = async (user, booking, slot) => {
  const msg =
    `K-Park: Reminder - Your parking booking starts in 30 minutes.\n` +
    `Slot: ${slot.slotNumber} | Time: ${booking.startTime}`;
  await sendSMS(user, 'booking_reminder', msg);
};
