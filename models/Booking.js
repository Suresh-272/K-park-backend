const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSlot',
      required: true,
    },
    bookingDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    startTime: {
      type: String, // HH:MM (24hr)
      required: true,
    },
    endTime: {
      type: String, // HH:MM (24hr)
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'completed'],
      default: 'active',
    },
    arrivedAt: {
      type: Date,
      default: null,
    },
    isExtended: {
      type: Boolean,
      default: false,
    },
    extensionCount: {
      type: Number,
      default: 0,
      max: 2,
    },
    gracePeriodDeadline: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent double booking: same slot, same date, overlapping times
bookingSchema.index({ slot: 1, bookingDate: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
