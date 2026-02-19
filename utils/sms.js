/**
 * K-Park Notification Service — Twilio WhatsApp Sandbox
 * Lazy-loads Twilio so a missing credential never crashes the server on startup.
 */

const Notification = require('../models/Notification');

const toWhatsAppNumber = (phone) => {
  const digits = phone.replace(/\D/g, '');
  let e164;
  if (digits.startsWith('91') && digits.length === 12) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+91${digits}`;
  else if (digits.startsWith('0') && digits.length === 11) e164 = `+91${digits.slice(1)}`;
  else e164 = `+${digits}`;
  return `whatsapp:${e164}`;
};

const sendSMS = async (user, type, message) => {
  let status = 'sent';
  let sid = null;

  // Lazy-load Twilio — won't crash server if env vars are missing
  try {
    const sid_env = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;

    if (!sid_env || !token || !from) {
      console.warn(`⚠️  Twilio env vars missing — SMS skipped [${type}] to ${user.phone}`);
      status = 'failed';
    } else {
      const twilio = require('twilio');
      const client = twilio(sid_env, token);
      const to = toWhatsAppNumber(user.phone);
      const result = await client.messages.create({ from, to, body: message });
      sid = result.sid;
      console.log(`✅ WhatsApp sent → ${to} [${type}]`);
    }
  } catch (err) {
    console.error(`❌ WhatsApp failed [${type}] to ${user.phone}: ${err.message}`);
    status = 'failed';
  }

  // Always log — even failed attempts
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
    console.error('Notification log failed:', dbErr.message);
  }
};

// ─── Templates ────────────────────────────────────────────────────────────────

exports.notifyBookingConfirmed = async (user, booking, slot) => {
  await sendSMS(user, 'booking_confirmed',
    `🅿️ *K-Park: Booking Confirmed!*\nSlot: *${slot.slotNumber}* (${slot.category})\nDate: ${booking.bookingDate}\nTime: ${booking.startTime} → ${booking.endTime}\nVehicle: ${user.vehicleNumber}`);
};

exports.notifyBookingCancelled = async (user, booking, slot, reason = '') => {
  await sendSMS(user, 'booking_cancelled',
    `❌ *K-Park: Booking Cancelled*\nSlot: ${slot.slotNumber} | Date: ${booking.bookingDate}\n${reason ? `Reason: ${reason}` : 'You cancelled this booking.'}`);
};

exports.notifyBookingExtended = async (user, booking, slot) => {
  await sendSMS(user, 'booking_extended',
    `⏱️ *K-Park: Booking Extended*\nSlot: ${slot.slotNumber}\nNew end time: *${booking.endTime}*\nExtension ${booking.extensionCount}/2 used`);
};

exports.notifyGraceWarning = async (user, booking, slot, minutesLeft) => {
  await sendSMS(user, 'grace_warning',
    `⚠️ *K-Park: Grace Period Warning*\nOnly *${minutesLeft} minutes* left to mark arrival for Slot ${slot.slotNumber}.\nBooking will be auto-cancelled if not confirmed.`);
};

exports.notifyGraceExpired = async (user, slot) => {
  await sendSMS(user, 'grace_expired',
    `🚫 *K-Park: Booking Auto-Cancelled*\nSlot *${slot.slotNumber}* was released — no arrival confirmed within grace period.`);
};

exports.notifyWaitlistJoined = async (user, position) => {
  await sendSMS(user, 'waitlist_joined',
    `📋 *K-Park: You're on the Waitlist*\nPosition: *#${position}*\nWe'll notify you the moment a slot opens up.`);
};

exports.notifySlotAvailable = async (user, slot, confirmDeadline) => {
  await sendSMS(user, 'waitlist_slot_available',
    `🟢 *K-Park: Slot Available!*\nSlot *${slot.slotNumber}* is now free!\n⏰ Confirm within 10 minutes (by ${confirmDeadline}) or it goes to the next person.`);
};

exports.notifyBookingReminder = async (user, booking, slot) => {
  await sendSMS(user, 'booking_reminder',
    `🔔 *K-Park: Booking in 30 Minutes*\nSlot: *${slot.slotNumber}* | Starts at: ${booking.startTime}\nDon't forget to mark arrival after parking!`);
};