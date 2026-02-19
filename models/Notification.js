const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    phone: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'booking_confirmed',
        'booking_cancelled',
        'booking_extended',
        'grace_warning',
        'grace_expired',
        'waitlist_joined',
        'waitlist_slot_available',
        'booking_reminder',
      ],
      required: true,
    },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
    twilioSid: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
