const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getAllUsers,
  updateUser,
  overrideBooking,
  getOccupancyAnalytics,
} = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect, restrictTo('admin'));

router.get('/dashboard', getDashboard);
router.get('/users', getAllUsers);
router.patch('/users/:id', updateUser);
router.patch('/bookings/:id/override', overrideBooking);
router.get('/analytics/occupancy', getOccupancyAnalytics);

module.exports = router;
