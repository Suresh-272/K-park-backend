const Waitlist = require('../models/Waitlist');
const ParkingSlot = require('../models/ParkingSlot');
const Booking = require('../models/Booking');
const sms = require('../utils/sms');
const { timesOverlap, getAccessibleCategories } = require('../utils/bookingHelpers');

// POST /api/waitlist  — join waitlist
exports.joinWaitlist = async (req, res, next) => {
  try {
    const { bookingDate, preferredStartTime, preferredEndTime, slotType } = req.body;

    if (!bookingDate || !preferredStartTime || !preferredEndTime || !slotType) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Check user isn't already on waitlist for this date/time
    const existing = await Waitlist.findOne({
      user: req.user._id,
      bookingDate,
      status: 'waiting',
    });
    if (existing && timesOverlap(preferredStartTime, preferredEndTime, existing.preferredStartTime, existing.preferredEndTime)) {
      return res.status(409).json({ success: false, message: 'You are already on the waitlist for this time.' });
    }

    // Compute FIFO position
    const position =
      (await Waitlist.countDocuments({ bookingDate, slotType, status: 'waiting' })) + 1;

    const entry = await Waitlist.create({
      user: req.user._id,
      bookingDate,
      preferredStartTime,
      preferredEndTime,
      slotType,
      position,
    });

    await sms.notifyWaitlistJoined(req.user, position);

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
};

// GET /api/waitlist/my  — user's waitlist entries
exports.getMyWaitlist = async (req, res, next) => {
  try {
    const entries = await Waitlist.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/waitlist/:id  — leave waitlist
exports.leaveWaitlist = async (req, res, next) => {
  try {
    const entry = await Waitlist.findById(req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'Waitlist entry not found.' });

    if (String(entry.user) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    entry.status = 'expired';
    await entry.save();

    res.status(200).json({ success: true, message: 'Removed from waitlist.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/waitlist/:id/confirm  — confirm a notified waitlist slot
exports.confirmWaitlistSlot = async (req, res, next) => {
  try {
    const entry = await Waitlist.findById(req.params.id).populate('user');

    if (!entry) return res.status(404).json({ success: false, message: 'Waitlist entry not found.' });
    if (String(entry.user._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (entry.status !== 'notified') {
      return res.status(400).json({ success: false, message: 'This entry is not awaiting confirmation.' });
    }
    if (new Date() > entry.confirmationDeadline) {
      entry.status = 'expired';
      await entry.save();
      return res.status(400).json({ success: false, message: 'Confirmation window expired.' });
    }

    // Find an available slot matching slotType and accessible categories
    const accessible = getAccessibleCategories(req.user.role);
    const slots = await ParkingSlot.find({
      slotType: entry.slotType,
      category: { $in: accessible },
      isActive: true,
    }).lean();

    let availableSlot = null;
    for (const slot of slots) {
      const activeBookings = await Booking.find({
        slot: slot._id,
        bookingDate: entry.bookingDate,
        status: 'active',
      }).lean();
      const hasConflict = activeBookings.some((b) =>
        timesOverlap(entry.preferredStartTime, entry.preferredEndTime, b.startTime, b.endTime)
      );
      if (!hasConflict) {
        availableSlot = slot;
        break;
      }
    }

    if (!availableSlot) {
      return res.status(409).json({ success: false, message: 'No slots available anymore. You have been removed from waitlist.' });
    }

    // Create the booking
    const { getGraceDeadline } = require('../utils/bookingHelpers');
    const booking = await Booking.create({
      user: req.user._id,
      slot: availableSlot._id,
      bookingDate: entry.bookingDate,
      startTime: entry.preferredStartTime,
      endTime: entry.preferredEndTime,
      gracePeriodDeadline: getGraceDeadline(entry.bookingDate, entry.preferredStartTime),
    });

    entry.status = 'booked';
    await entry.save();

    await sms.notifyBookingConfirmed(req.user, booking, availableSlot);

    res.status(201).json({ success: true, message: 'Slot confirmed and booking created.', data: booking });
  } catch (err) {
    next(err);
  }
};

// GET /api/waitlist  [Admin only]
exports.getAllWaitlist = async (req, res, next) => {
  try {
    const { date, status } = req.query;
    const filter = {};
    if (date) filter.bookingDate = date;
    if (status) filter.status = status;

    const entries = await Waitlist.find(filter)
      .populate('user', 'name email phone role')
      .sort({ createdAt: 1 });

    res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (err) {
    next(err);
  }
};
