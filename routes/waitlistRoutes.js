const express = require('express');
const router = express.Router();
const {
  joinWaitlist,
  getMyWaitlist,
  leaveWaitlist,
  confirmWaitlistSlot,
  getAllWaitlist,
} = require('../controllers/waitlistController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

router.post('/', joinWaitlist);
router.get('/my', getMyWaitlist);
router.get('/all', restrictTo('admin'), getAllWaitlist);
router.delete('/:id', leaveWaitlist);
router.post('/:id/confirm', confirmWaitlistSlot);

module.exports = router;
