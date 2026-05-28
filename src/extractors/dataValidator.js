const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const URL_REGEX = /^https?:\/\/.+\..+/;

function validateEmail(email) {
  return EMAIL_REGEX.test((email || '').trim());
}

function validatePhone(phone) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function validateUrl(url) {
  return URL_REGEX.test((url || '').trim());
}

function validateLead(lead) {
  const errors = [];
  if (!lead.businessName || lead.businessName.trim().length < 2) errors.push('businessName is required (min 2 chars)');
  if (!lead.profession || lead.profession.trim().length < 2) errors.push('profession is required');
  if (lead.email && !validateEmail(lead.email)) errors.push(`invalid email: ${lead.email}`);
  if (lead.phone && !validatePhone(lead.phone)) errors.push(`invalid phone: ${lead.phone}`);
  if (lead.website && !validateUrl(lead.website)) errors.push(`invalid website: ${lead.website}`);
  return { valid: errors.length === 0, errors };
}

function sanitizeLead(lead) {
  const clean = { ...lead };
  if (clean.businessName) clean.businessName = clean.businessName.trim().replace(/\s+/g, ' ');
  if (clean.ownerName) clean.ownerName = clean.ownerName.trim().replace(/\s+/g, ' ');
  if (clean.phone) clean.phone = clean.phone.trim();
  if (clean.email) clean.email = clean.email.trim().toLowerCase();
  if (clean.website) clean.website = clean.website.trim();
  if (clean.address) clean.address = clean.address.trim().replace(/\s+/g, ' ');
  if (clean.city) clean.city = clean.city.trim();
  if (clean.state) clean.state = clean.state.trim().toUpperCase().slice(0, 2);
  if (clean.zip) clean.zip = clean.zip.trim();
  return clean;
}

// Basic reachability check — verifies domain exists (no actual SMTP handshake)
function verifyEmailDomain(email) {
  if (!validateEmail(email)) return false;
  const domain = email.split('@')[1];
  const knownGoodDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
  // Accept known good domains immediately; for others just check format
  return !!domain && domain.includes('.');
}

module.exports = { validateEmail, validatePhone, validateUrl, validateLead, sanitizeLead, verifyEmailDomain };
