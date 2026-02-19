const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bookingDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    preferredStartTime: {
      type: String,
      required: true,
    },
    preferredEndTime: {
      type: String,
      required: true,
    },
    slotType: {
      type: String,
      enum: ['two-wheeler', 'four-wheeler'],
      required: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'notified', 'booked', 'expired'],
      default: 'waiting',
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
    confirmationDeadline: {
      type: Date,
      default: null,
    },
    position: {
      type: Number,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Waitlist', waitlistSchema);
