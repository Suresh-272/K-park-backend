const ParkingSlot = require('../models/ParkingSlot');
const Booking = require('../models/Booking');
const { getAccessibleCategories, timesOverlap } = require('../utils/bookingHelpers');

// GET /api/slots  — get all active slots with real-time availability
exports.getAllSlots = async (req, res, next) => {
  try {
    const { date, startTime, endTime, slotType } = req.query;

    const filter = { isActive: true };
    if (slotType) filter.slotType = slotType;

    // Managers can see all; employees only see general
    const accessibleCategories = getAccessibleCategories(req.user.role);
    filter.category = { $in: accessibleCategories };

    const slots = await ParkingSlot.find(filter).lean();

    // If date and times are provided, compute real-time availability
    if (date && startTime && endTime) {
      const activeBookings = await Booking.find({
        bookingDate: date,
        status: 'active',
        slot: { $in: slots.map((s) => s._id) },
      }).lean();

      const slotsWithAvailability = slots.map((slot) => {
        const conflictingBooking = activeBookings.find(
          (b) =>
            String(b.slot) === String(slot._id) &&
            timesOverlap(startTime, endTime, b.startTime, b.endTime)
        );
        return {
          ...slot,
          isAvailableForSlot: !conflictingBooking,
        };
      });

      return res.status(200).json({ success: true, count: slotsWithAvailability.length, data: slotsWithAvailability });
    }

    res.status(200).json({ success: true, count: slots.length, data: slots });
  } catch (err) {
    next(err);
  }
};

// GET /api/slots/:id
exports.getSlot = async (req, res, next) => {
  try {
    const slot = await ParkingSlot.findById(req.params.id);
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });
    res.status(200).json({ success: true, data: slot });
  } catch (err) {
    next(err);
  }
};

// POST /api/slots  [Admin only]
exports.createSlot = async (req, res, next) => {
  try {
    const slot = await ParkingSlot.create(req.body);
    res.status(201).json({ success: true, data: slot });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/slots/:id  [Admin only]
exports.updateSlot = async (req, res, next) => {
  try {
    const slot = await ParkingSlot.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });
    res.status(200).json({ success: true, data: slot });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/slots/:id  [Admin only]
exports.deleteSlot = async (req, res, next) => {
  try {
    const slot = await ParkingSlot.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });
    res.status(200).json({ success: true, message: 'Slot deactivated.' });
  } catch (err) {
    next(err);
  }
};
