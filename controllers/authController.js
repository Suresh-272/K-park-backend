const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined; // strip password from output
  res.status(statusCode).json({ success: true, token, data: { user } });
};

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, role, vehicleNumber } = req.body;

    // Admins can assign any role; public registration capped at employee/manager
    const allowedRoles = ['employee', 'manager'];
    const assignedRole = allowedRoles.includes(role) ? role : 'employee';

    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: assignedRole,
      vehicleNumber,
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
};

// PATCH /api/auth/update-password
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();
    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/auth/update-profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, vehicleNumber } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }
    if (!vehicleNumber || !vehicleNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Vehicle number is required.' });
    }

    // Only allow safe fields to be updated (not email, password, role)
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        name: name.trim(),
        phone: phone ? phone.trim() : req.user.phone,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user: updated },
    });
  } catch (err) {
    next(err);
  }
};