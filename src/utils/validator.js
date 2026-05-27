/**
 * Validation and sanitization utilities
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;

/**
 * Validate a lead object for required fields
 * @param {Object} lead
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateLead(lead) {
  const errors = [];

  if (!lead || typeof lead !== 'object') {
    return { valid: false, errors: ['Lead must be an object'] };
  }

  if (!lead.businessName || typeof lead.businessName !== 'string' || !lead.businessName.trim()) {
    errors.push('businessName is required');
  }

  if (!lead.profession || typeof lead.profession !== 'string' || !lead.profession.trim()) {
    errors.push('profession is required');
  }

  const validSources = ['google-maps', 'yellow-pages', 'yelp', 'bbb', 'linkedin', 'direct'];
  if (!lead.source || !validSources.includes(lead.source)) {
    errors.push(`source must be one of: ${validSources.join(', ')}`);
  }

  if (lead.email && !validateEmail(lead.email)) {
    errors.push('email format is invalid');
  }

  if (lead.rating !== undefined && lead.rating !== null) {
    const rating = Number(lead.rating);
    if (isNaN(rating) || rating < 0 || rating > 5) {
      errors.push('rating must be between 0 and 5');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an email address
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

/**
 * Validate a phone number (basic format check)
 * @param {string} phone
 * @returns {boolean}
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\(\)\+\.]/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15 && /^\d+$/.test(cleaned);
}

/**
 * Sanitize text by removing extra whitespace
 * @param {string} text
 * @returns {string}
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Validate scrape request inputs
 * @param {string} profession
 * @param {string} location
 * @param {string} source
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateScrapeRequest(profession, location, source) {
  const errors = [];

  if (!profession || !profession.trim()) {
    errors.push('profession is required');
  } else if (profession.trim().length < 2) {
    errors.push('profession must be at least 2 characters');
  } else if (profession.trim().length > 100) {
    errors.push('profession must be less than 100 characters');
  }

  if (!location || !location.trim()) {
    errors.push('location is required');
  } else if (location.trim().length < 2) {
    errors.push('location must be at least 2 characters');
  } else if (location.trim().length > 100) {
    errors.push('location must be less than 100 characters');
  }

  const validSources = ['google-maps', 'yellow-pages', 'yelp', 'bbb', 'all'];
  if (!source) {
    errors.push('source is required');
  } else if (!validSources.includes(source)) {
    errors.push(`source must be one of: ${validSources.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalize a URL (add https:// if missing)
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

module.exports = {
  validateLead,
  validateEmail,
  validatePhone,
  sanitizeText,
  validateScrapeRequest,
  normalizeUrl,
};
