const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Validate an email address
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim().toLowerCase());
}

/**
 * Extract all emails found in a text string
 * @param {string} text
 * @returns {string[]} Array of unique, valid emails
 */
function extractEmailsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(EMAIL_REGEX) || [];
  const unique = [...new Set(matches.map((e) => e.toLowerCase()))];
  return unique.filter(validateEmail);
}

/**
 * Extract domain from a URL
 * @param {string} url
 * @returns {string} domain or empty string
 */
function extractDomain(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(normalized);
    // Remove www. prefix
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * Visit a website and extract emails from mailto links and visible text
 * @param {string} websiteUrl
 * @returns {Promise<string[]>} Array of found emails
 */
async function findEmailsOnWebsite(websiteUrl) {
  if (!websiteUrl) return [];

  try {
    const normalized = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

    const response = await axios.get(normalized, {
      timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      maxRedirects: 5,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    const emails = new Set();

    // Extract from mailto: links
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
      if (validateEmail(email)) {
        emails.add(email.toLowerCase());
      }
    });

    // Extract from visible text
    const bodyText = $('body').text();
    extractEmailsFromText(bodyText).forEach((e) => emails.add(e));

    // Also check contact page if emails not found
    if (emails.size === 0) {
      try {
        const contactUrls = [
          `${normalized}/contact`,
          `${normalized}/contact-us`,
          `${normalized}/about`,
          `${normalized}/about-us`,
        ];

        for (const contactUrl of contactUrls.slice(0, 2)) {
          try {
            const contactResp = await axios.get(contactUrl, {
              timeout: 8000,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              },
              maxRedirects: 3,
            });
            const $c = cheerio.load(contactResp.data);

            $c('a[href^="mailto:"]').each((_, el) => {
              const href = $c(el).attr('href') || '';
              const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
              if (validateEmail(email)) {
                emails.add(email.toLowerCase());
              }
            });

            extractEmailsFromText($c('body').text()).forEach((e) => emails.add(e));

            if (emails.size > 0) break;
          } catch {
            // Contact page not found, continue
          }
        }
      } catch {
        // Ignore errors on contact page attempts
      }
    }

    const result = [...emails];
    logger.debug(`Found ${result.length} emails on ${websiteUrl}`);
    return result;
  } catch (err) {
    logger.debug(`Could not fetch emails from ${websiteUrl}: ${err.message}`);
    return [];
  }
}

/**
 * Find emails using Hunter.io API
 * @param {string} domain - Domain to search
 * @param {string} apiKey - Hunter.io API key
 * @returns {Promise<string[]>} Array of found emails
 */
async function findEmailsViaHunter(domain, apiKey) {
  if (!domain || !apiKey) return [];

  try {
    const response = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { domain, api_key: apiKey, limit: 10 },
      timeout: 10000,
    });

    const emails =
      response.data?.data?.emails?.map((e) => e.value).filter(validateEmail) || [];
    logger.debug(`Hunter.io found ${emails.length} emails for ${domain}`);
    return emails;
  } catch (err) {
    logger.debug(`Hunter.io API error for ${domain}: ${err.message}`);
    return [];
  }
}

module.exports = {
  findEmailsOnWebsite,
  findEmailsViaHunter,
  validateEmail,
  extractEmailsFromText,
  extractDomain,
};
