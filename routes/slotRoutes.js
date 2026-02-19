const express = require('express');
const router = express.Router();
const {
  getAllSlots,
  getSlot,
  createSlot,
  updateSlot,
  deleteSlot,
} = require('../controllers/slotController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect); // All slot routes require auth

router.get('/', getAllSlots);
router.get('/:id', getSlot);
router.post('/', restrictTo('admin'), createSlot);
router.patch('/:id', restrictTo('admin'), updateSlot);
router.delete('/:id', restrictTo('admin'), deleteSlot);

module.exports = router;
