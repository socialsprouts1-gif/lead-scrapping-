const { normalizePhone } = require('../utils/helpers');

// Matches common North American and international phone formats
const PHONE_PATTERNS = [
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g,
  /(?:\+?1[-.\s]?)?\d{10}/g,
  /\+\d{1,3}[-.\s]\d{1,4}[-.\s]\d{4,}/g,
];

function extractPhonesFromText(text) {
  if (!text) return [];
  const found = new Set();
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags)) || [];
    matches.forEach((m) => {
      const normalized = normalizePhone(m.trim());
      if (normalized) found.add(normalized);
    });
  }
  return [...found];
}

function extractPhonesFromHtml(html) {
  // Strip tags first, then extract
  const text = html.replace(/<[^>]*>/g, ' ');
  return extractPhonesFromText(text);
}

function validatePhone(phone) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function primaryPhone(phones) {
  return phones && phones.length > 0 ? phones[0] : null;
}

module.exports = { extractPhonesFromText, extractPhonesFromHtml, validatePhone, primaryPhone };
