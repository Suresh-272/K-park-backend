/**
 * K-Park Notification Service — Twilio SMS (plain text SMS, not WhatsApp)
 */

const Notification = require('../models/Notification');

// ── Startup validation ────────────────────────────────────────────────────────
const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM  = process.env.TWILIO_PHONE_NUMBER; // Your Twilio SMS number e.g. +12345678901

const TWILIO_READY = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

if (TWILIO_READY) {
  console.log(`✅ Twilio SMS configured — FROM: ${TWILIO_FROM}`);
} else {
  const missing = [
    !TWILIO_SID   && 'TWILIO_ACCOUNT_SID',
    !TWILIO_TOKEN && 'TWILIO_AUTH_TOKEN',
    !TWILIO_FROM  && 'TWILIO_PHONE_NUMBER',
  ].filter(Boolean);
  console.warn(`⚠️  Twilio SMS NOT configured. Missing: ${missing.join(', ')}`);
}

// ── Phone normalizer → E.164 format for SMS ───────────────────────────────────
const toE164 = (phone) => {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10)                             return `+91${digits}`;
  if (digits.startsWith('0') && digits.length === 11)  return `+91${digits.slice(1)}`;
  return `+${digits}`;
};

// ── Core SMS sender ───────────────────────────────────────────────────────────
const sendSMS = async (user, type, message) => {
  let status = 'sent';
  let sid = null;

  if (!TWILIO_READY) {
    console.warn(`⚠️  SMS skipped [${type}] to ${user.phone} — Twilio not configured`);
    status = 'skipped';
  } else {
    try {
      const twilio = require('twilio');
      const client = twilio(TWILIO_SID, TWILIO_TOKEN);
      const to = toE164(user.phone);

      const result = await client.messages.create({
        from: TWILIO_FROM,  // plain Twilio phone number — no "whatsapp:" prefix
        to,                 // plain E.164 number — no "whatsapp:" prefix
        body: message,
      });

      sid = result.sid;
      console.log(`✅ SMS sent → ${to} [${type}] sid:${sid}`);
    } catch (err) {
      console.error(`❌ SMS FAILED [${type}] to ${user.phone}: ${err.message}`);
      if (err.code) console.error(`   Twilio error code: ${err.code}`);
      status = 'failed';
    }
  }

  // Always log to DB
  try {
    await Notification.create({
      user: user._id,
      phone: user.phone,
      type,
      message,
      status,
      twilioSid: sid,
    });
  } catch (dbErr) {
    console.error('Notification DB log failed:', dbErr.message);
  }
};

// ── Templates (plain text — no WhatsApp markdown like *bold*) ─────────────────

exports.notifyBookingConfirmed = (user, booking, slot) =>
  sendSMS(user, 'booking_confirmed',
    `K-Park: Booking Confirmed!\nSlot: ${slot.slotNumber} (${slot.category})\nDate: ${booking.bookingDate}\nTime: ${booking.startTime} - ${booking.endTime}\nVehicle: ${user.vehicleNumber}`);

exports.notifyBookingCancelled = (user, booking, slot, reason = '') =>
  sendSMS(user, 'booking_cancelled',
    `K-Park: Booking Cancelled\nSlot: ${slot.slotNumber} | Date: ${booking.bookingDate}\n${reason ? `Reason: ${reason}` : 'You cancelled this booking.'}`);

exports.notifyBookingExtended = (user, booking, slot) =>
  sendSMS(user, 'booking_extended',
    `K-Park: Booking Extended\nSlot: ${slot.slotNumber}\nNew end time: ${booking.endTime}\nExtension ${booking.extensionCount}/2 used`);

exports.notifyGraceWarning = (user, booking, slot, minutesLeft) =>
  sendSMS(user, 'grace_warning',
    `K-Park: Grace Period Warning\nOnly ${minutesLeft} minutes left to mark arrival for Slot ${slot.slotNumber}.\nBooking will be auto-cancelled if not confirmed.`);

exports.notifyGraceExpired = (user, slot) =>
  sendSMS(user, 'grace_expired',
    `K-Park: Booking Auto-Cancelled\nSlot ${slot.slotNumber} was released — no arrival confirmed within grace period.`);

exports.notifyWaitlistJoined = (user, position) =>
  sendSMS(user, 'waitlist_joined',
    `K-Park: You're on the Waitlist\nPosition: #${position}\nWe'll notify you the moment a slot opens up.`);

exports.notifySlotAvailable = (user, slot, confirmDeadline) =>
  sendSMS(user, 'waitlist_slot_available',
    `K-Park: Slot Available!\nSlot ${slot.slotNumber} is now free!\nConfirm within 10 minutes (by ${confirmDeadline}) or it goes to the next person.`);

exports.notifyBookingReminder = (user, booking, slot) =>
  sendSMS(user, 'booking_reminder',
    `K-Park: Booking in 30 Minutes\nSlot: ${slot.slotNumber} | Starts at: ${booking.startTime}\nDon't forget to mark arrival after parking!`);

// Used by health check endpoint
exports.twilioReady = TWILIO_READY;
exports.twilioFrom  = TWILIO_FROM;