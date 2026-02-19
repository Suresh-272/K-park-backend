const mongoose = require('mongoose');

const parkingSlotSchema = new mongoose.Schema(
  {
    slotNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    slotType: {
      type: String,
      enum: ['two-wheeler', 'four-wheeler'],
      required: true,
    },
    category: {
      type: String,
      enum: ['manager', 'general'],
      default: 'general',
    },
    status: {
      type: String,
      enum: ['available', 'booked', 'inactive'],
      default: 'available',
    },
    floor: {
      type: String,
      default: 'G',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ParkingSlot', parkingSlotSchema);
