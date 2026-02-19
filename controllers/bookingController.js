const Booking = require('../models/Booking');
const ParkingSlot = require('../models/ParkingSlot');
const Waitlist = require('../models/Waitlist');
const {
  timesOverlap,
  getAccessibleCategories,
  addMinutesToTime,
  getGraceDeadline,
} = require('../utils/bookingHelpers');
const sms = require('../utils/sms');

// ─── Helper: check if a slot is free for the given time window ───────────────
const isSlotAvailable = async (slotId, bookingDate, startTime, endTime, excludeBookingId = null) => {
  const filter = {
    slot: slotId,
    bookingDate,
    status: 'active',
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };

  const conflicts = await Booking.find(filter).lean();
  return !conflicts.some((b) => timesOverlap(startTime, endTime, b.startTime, b.endTime));
};

// ─── Helper: trigger waitlist reallocation when a slot is freed ──────────────
const triggerWaitlistReallocation = async (slot, freedDate, freedStart, freedEnd) => {
  // Find oldest waiting entry for this date/type that fits the time window
  const waiting = await Waitlist.find({
    bookingDate: freedDate,
    slotType: slot.slotType,
    status: 'waiting',
  })
    .sort({ createdAt: 1 })
    .populate('user');

  for (const entry of waiting) {
    const fits = timesOverlap(
      freedStart,
      freedEnd,
      entry.preferredStartTime,
      entry.preferredEndTime
    );
    if (fits) {
      const confirmDeadline = new Date(Date.now() + 10 * 60 * 1000); // 10 min to confirm
      entry.status = 'notified';
      entry.notifiedAt = new Date();
      entry.confirmationDeadline = confirmDeadline;
      await entry.save();

      await sms.notifySlotAvailable(
        entry.user,
        slot,
        confirmDeadline.toTimeString().slice(0, 5)
      );
      break; // Notify only the first eligible person
    }
  }
};

// POST /api/bookings
exports.createBooking = async (req, res, next) => {
  try {
    const { slotId, bookingDate, startTime, endTime } = req.body;

    if (!slotId || !bookingDate || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'slotId, bookingDate, startTime, endTime are required.' });
    }

    if (startTime >= endTime) {
      return res.status(400).json({ success: false, message: 'startTime must be before endTime.' });
    }

    // 1. Fetch slot
    const slot = await ParkingSlot.findById(slotId);
    if (!slot || !slot.isActive) {
      return res.status(404).json({ success: false, message: 'Slot not found or inactive.' });
    }

    // 2. Role-based category check
    const accessible = getAccessibleCategories(req.user.role);
    if (!accessible.includes(slot.category)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to book this slot category.' });
    }

    // 3. Prevent double booking by same user on same date/time
    const userConflict = await Booking.findOne({
      user: req.user._id,
      bookingDate,
      status: 'active',
    });
    if (userConflict && timesOverlap(startTime, endTime, userConflict.startTime, userConflict.endTime)) {
      return res.status(409).json({ success: false, message: 'You already have a booking that overlaps with this time.' });
    }

    // 4. Check slot availability
    const available = await isSlotAvailable(slotId, bookingDate, startTime, endTime);
    if (!available) {
      return res.status(409).json({
        success: false,
        message: 'Slot is already booked for the selected time. Consider joining the waitlist.',
        suggestWaitlist: true,
      });
    }

    // 5. Create booking with grace period
    const gracePeriodDeadline = getGraceDeadline(bookingDate, startTime);

    const booking = await Booking.create({
      user: req.user._id,
      slot: slotId,
      bookingDate,
      startTime,
      endTime,
      gracePeriodDeadline,
    });

    await booking.populate(['user', 'slot']);

    // 6. Send SMS
    await sms.notifyBookingConfirmed(req.user, booking, slot);

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// GET /api/bookings  — user's own bookings
exports.getMyBookings = async (req, res, next) => {
  try {
    const { status, upcoming } = req.query;
    const filter = { user: req.user._id };

    if (status) filter.status = status;
    if (upcoming === 'true') {
      const today = new Date().toISOString().split('T')[0];
      filter.bookingDate = { $gte: today };
      filter.status = 'active';
    }

    const bookings = await Booking.find(filter)
      .populate('slot')
      .sort({ bookingDate: -1, startTime: -1 });

    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    next(err);
  }
};

// GET /api/bookings/:id
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate(['user', 'slot']);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    // Only allow owner or admin
    if (String(booking.user._id) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/bookings/:id/mark-arrival
exports.markArrival = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('slot');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (booking.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Booking is not active.' });
    }
    if (booking.arrivedAt) {
      return res.status(400).json({ success: false, message: 'Arrival already marked.' });
    }

    booking.arrivedAt = new Date();
    await booking.save();

    res.status(200).json({ success: true, message: 'Arrival confirmed.', data: booking });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/bookings/:id/extend
exports.extendBooking = async (req, res, next) => {
  try {
    const { extraMinutes } = req.body;
    if (!extraMinutes || extraMinutes <= 0) {
      return res.status(400).json({ success: false, message: 'extraMinutes must be a positive number.' });
    }

    const booking = await Booking.findById(req.params.id).populate('slot');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (booking.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot extend an inactive booking.' });
    }
    if (booking.extensionCount >= 2) {
      return res.status(400).json({ success: false, message: 'Maximum 2 extensions allowed per booking.' });
    }

    const newEndTime = addMinutesToTime(booking.endTime, extraMinutes);

    // Check no conflict for the extended window
    const available = await isSlotAvailable(
      booking.slot._id,
      booking.bookingDate,
      booking.endTime, // from current end
      newEndTime,
      booking._id
    );
    if (!available) {
      return res.status(409).json({ success: false, message: 'Cannot extend — slot is booked right after your current end time.' });
    }

    booking.endTime = newEndTime;
    booking.isExtended = true;
    booking.extensionCount += 1;
    await booking.save();

    await sms.notifyBookingExtended(req.user, booking, booking.slot);

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/bookings/:id/cancel
exports.cancelBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id).populate('slot');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    // Allow owner or admin
    if (String(booking.user) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (booking.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Booking is not active.' });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'User cancelled';
    await booking.save();

    await sms.notifyBookingCancelled(req.user, booking, booking.slot, reason);

    // Trigger waitlist reallocation
    await triggerWaitlistReallocation(
      booking.slot,
      booking.bookingDate,
      booking.startTime,
      booking.endTime
    );

    res.status(200).json({ success: true, message: 'Booking cancelled.', data: booking });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: get all bookings ─────────────────────────────────────────────────
exports.getAllBookings = async (req, res, next) => {
  try {
    const { status, date, userId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date) filter.bookingDate = date;
    if (userId) filter.user = userId;

    const bookings = await Booking.find(filter)
      .populate('user', 'name email phone role vehicleNumber')
      .populate('slot', 'slotNumber category slotType floor')
      .sort({ bookingDate: -1 });

    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (err) {
    next(err);
  }
};

// Export helper for use in cron jobs
exports.triggerWaitlistReallocation = triggerWaitlistReallocation;
