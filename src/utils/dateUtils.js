const moment = require('moment-timezone');

/**
 * Format date for display
 */
const formatDate = (date, timezone = 'UTC', format = 'YYYY-MM-DD HH:mm:ss') => {
  return moment.tz(date, timezone).format(format);
};

/**
 * Get next occurrence of a time for recurring meetings
 */
const getNextOccurrence = (time, timezone, recurrence = 'daily') => {
  const now = moment.tz(timezone);
  let nextTime = moment.tz(time, timezone);

  // If the time has passed today, get next occurrence
  if (nextTime.isBefore(now)) {
    switch (recurrence) {
      case 'daily':
        nextTime.add(1, 'day');
        break;
      case 'weekly':
        nextTime.add(1, 'week');
        break;
      default:
        throw new Error('Invalid recurrence type');
    }
  }

  return nextTime.toDate();
};

/**
 * Validate timezone
 */
const isValidTimezone = (timezone) => {
  try {
    moment.tz(timezone);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get user's local time from UTC
 */
const convertToUserTimezone = (utcTime, userTimezone) => {
  return moment.utc(utcTime).tz(userTimezone).format();
};

/**
 * Calculate meeting duration in minutes
 */
const calculateDuration = (startTime, endTime) => {
  const start = moment(startTime);
  const end = moment(endTime);
  return end.diff(start, 'minutes');
};

/**
 * Check if a time is within business hours
 */
const isBusinessHours = (time, timezone = 'UTC', startHour = 9, endHour = 17) => {
  const momentTime = moment.tz(time, timezone);
  const hour = momentTime.hour();
  const day = momentTime.day();
  
  // Monday = 1, Friday = 5
  return day >= 1 && day <= 5 && hour >= startHour && hour < endHour;
};

module.exports = {
  formatDate,
  getNextOccurrence,
  isValidTimezone,
  convertToUserTimezone,
  calculateDuration,
  isBusinessHours
};
