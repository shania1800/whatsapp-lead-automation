/**
 * sanitizePhone.js
 *
 * Twilio's webhook payload injects newline characters (\n) into phone numbers.
 * Without sanitization, every Supabase lookup fails silently - the phone number
 * appears correct in logs but doesn't match the stored value.
 *
 * Applied at two levels:
 *   1. JavaScript (n8n Code node) - before any lookup or send
 *   2. SQL (Supabase) - REPLACE(phone_number, chr(10), '') on stored values
 */

/**
 * Strips all whitespace from a phone number string.
 * Handles Twilio's \n injection and any other whitespace variants.
 *
 * @param {string} raw - Raw phone number from Twilio webhook (e.g. "+18005550199\n")
 * @returns {string} Clean phone number (e.g. "+18005550199")
 */
function sanitizePhone(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').trim();
}

/**
 * Validates that a phone number has at least 10 digits after stripping non-numeric chars.
 * Used as a guard before sending messages or doing lookups.
 *
 * @param {string} phone - Sanitized phone number
 * @returns {boolean}
 */
function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
}

module.exports = { sanitizePhone, isValidPhone };
