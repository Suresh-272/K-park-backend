/**
 * Check whether two time ranges overlap
 * Times are in "HH:MM" 24hr format strings
 */
exports.timesOverlap = (start1, end1, start2, end2) => {
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);
  // Overlap if one starts before the other ends
  return s1 < e2 && s2 < e1;
};

/**
 * Get accessible slot categories for a user role
 */
exports.getAccessibleCategories = (role) => {
  if (role === 'manager' || role === 'admin') {
    return ['general', 'manager'];
  }
  return ['general'];
};

/**
 * Format Date to HH:MM
 */
exports.formatTime = (date) => {
  return date.toTimeString().slice(0, 5);
};

/**
 * Add minutes to a HH:MM string and return new HH:MM
 */
exports.addMinutesToTime = (timeStr, minutes) => {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

/**
 * Generate a grace period deadline Date object
 * bookingDate: "YYYY-MM-DD", startTime: "HH:MM"
 */
exports.getGraceDeadline = (bookingDate, startTime) => {
  const graceMins = parseInt(process.env.GRACE_PERIOD_MINUTES || 15);
  const [h, m] = startTime.split(':').map(Number);
  const deadline = new Date(bookingDate);
  deadline.setHours(h, m + graceMins, 0, 0);
  return deadline;
};
