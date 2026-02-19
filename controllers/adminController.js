const User = require('../models/User');
const Booking = require('../models/Booking');
const ParkingSlot = require('../models/ParkingSlot');
const Waitlist = require('../models/Waitlist');

// GET /api/admin/dashboard  — summary analytics
exports.getDashboard = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      totalUsers,
      totalSlots,
      activeBookingsToday,
      totalBookings,
      waitlistToday,
      slotBreakdown,
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      ParkingSlot.countDocuments({ isActive: true }),
      Booking.countDocuments({ bookingDate: today, status: 'active' }),
      Booking.countDocuments(),
      Waitlist.countDocuments({ bookingDate: today, status: 'waiting' }),
      ParkingSlot.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: { category: '$category', slotType: '$slotType' }, count: { $sum: 1 } } },
      ]),
    ]);

    const availableSlotsToday = totalSlots - activeBookingsToday;

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalSlots,
        activeBookingsToday,
        availableSlotsToday,
        totalBookings,
        waitlistToday,
        slotBreakdown,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users
exports.getAllUsers = async (req, res, next) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id
exports.updateUser = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'role', 'vehicleNumber', 'isActive'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/bookings/:id/override  — force cancel any booking
exports.overrideBooking = async (req, res, next) => {
  try {
    const { action, reason } = req.body; // action: 'cancel'

    const booking = await Booking.findById(req.params.id).populate(['user', 'slot']);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (action === 'cancel') {
      booking.status = 'cancelled';
      booking.cancellationReason = reason || 'Admin override';
      await booking.save();

      const { triggerWaitlistReallocation } = require('./bookingController');
      await triggerWaitlistReallocation(
        booking.slot,
        booking.bookingDate,
        booking.startTime,
        booking.endTime
      );

      return res.status(200).json({ success: true, message: 'Booking cancelled by admin.', data: booking });
    }

    res.status(400).json({ success: false, message: 'Unknown action.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/analytics/occupancy  — occupancy per date range
exports.getOccupancyAnalytics = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const match = { status: { $in: ['active', 'completed'] } };
    if (from || to) {
      match.bookingDate = {};
      if (from) match.bookingDate.$gte = from;
      if (to) match.bookingDate.$lte = to;
    }

    const occupancy = await Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$bookingDate',
          bookingCount: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user' },
        },
      },
      {
        $project: {
          date: '$_id',
          bookingCount: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
        },
      },
      { $sort: { date: 1 } },
    ]);

    res.status(200).json({ success: true, data: occupancy });
  } catch (err) {
    next(err);
  }
};
