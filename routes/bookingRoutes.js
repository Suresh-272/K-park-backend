const express = require('express');
const router = express.Router();
const {
  createBooking,
  getMyBookings,
  getBooking,
  markArrival,
  extendBooking,
  cancelBooking,
  getAllBookings,
} = require('../controllers/bookingController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.post('/', createBooking);
router.get('/my', getMyBookings);
router.get('/all', restrictTo('admin'), getAllBookings);
router.get('/:id', getBooking);
router.patch('/:id/mark-arrival', markArrival);
router.patch('/:id/extend', extendBooking);
router.patch('/:id/cancel', cancelBooking);

module.exports = router;
