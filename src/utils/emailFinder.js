const axios = require('axios');
const cheerio = require('cheerio');
const { extractDomain } = require('./helpers');
const logger = require('./logger');

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us', '/team', '/staff'];

async function findEmailsOnPage(url, timeout = 15000) {
  try {
    const { data } = await axios.get(url, {
      timeout,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' },
      maxRedirects: 5,
    });
    const emails = new Set();

    // mailto links
    const $ = cheerio.load(data);
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
      if (email) emails.add(email);
    });

    // regex match on raw HTML
    const matches = data.match(EMAIL_REGEX) || [];
    matches.forEach((e) => emails.add(e.toLowerCase()));

    return [...emails];
  } catch (err) {
    logger.debug(`findEmailsOnPage failed for ${url}: ${err.message}`);
    return [];
  }
}

async function findEmailsForDomain(websiteUrl, timeout = 15000) {
  const emails = new Set();
  const domain = extractDomain(websiteUrl);
  if (!domain) return [];

  const base = `https://${domain}`;

  // Check homepage + common contact paths in parallel
  const pages = [base, ...CONTACT_PATHS.map((p) => base + p)];
  const results = await Promise.allSettled(pages.map((url) => findEmailsOnPage(url, timeout)));
  results.forEach((r) => {
    if (r.status === 'fulfilled') r.value.forEach((e) => emails.add(e));
  });

  // Filter out common false positives
  const filtered = [...emails].filter((e) => {
    const lower = e.toLowerCase();
    return !lower.includes('example.com') &&
      !lower.includes('test.com') &&
      !lower.includes('sentry.io') &&
      !lower.includes('.png') &&
      !lower.includes('.jpg');
  });

  return filtered;
}

async function findEmailsViaHunter(domain, apiKey) {
  if (!apiKey) return [];
  try {
    const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { domain, api_key: apiKey, limit: 10 },
      timeout: 10000,
    });
    const emails = (data.data?.emails || []).map((e) => e.value).filter(Boolean);
    return emails;
  } catch (err) {
    logger.debug(`Hunter.io lookup failed for ${domain}: ${err.message}`);
    return [];
  }
}

module.exports = { findEmailsForDomain, findEmailsOnPage, findEmailsViaHunter };
