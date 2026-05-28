/**
 * General-purpose helper utilities
 */

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone.trim();
}

function normalizeUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
  return html ? html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function uniqueBy(arr, key) {
  const seen = new Set();
  return arr.filter((item) => {
    const val = typeof key === 'function' ? key(item) : item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

function formatDate(date) {
  return new Date(date).toISOString().split('T')[0];
}

module.exports = { slugify, extractDomain, normalizePhone, normalizeUrl, chunk, sleep, stripHtml, uniqueBy, formatDate };
