// General-purpose web scraper — crawls a given URL and extracts lead data
const axios = require('axios');
const cheerio = require('cheerio');
const { getRandom } = require('../utils/userAgent');
const { randomDelay } = require('../utils/delay');
const { extractPhonesFromHtml } = require('../extractors/phoneExtractor');
const { findEmailsOnPage } = require('../utils/emailFinder');
const { extractDomain } = require('../utils/helpers');
const logger = require('../utils/logger');

async function scrapeWebPage(url, profession = '') {
  logger.info(`WebScraper: fetching ${url}`);
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': getRandom(), Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 20000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(data);
    const text = $('body').text();

    // Business name: try common patterns
    const businessName =
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="application-name"]').attr('content') ||
      $('[class*="company-name"], [class*="business-name"], [id*="company"]').first().text().trim() ||
      $('h1').first().text().trim() ||
      extractDomain(url);

    // Phone numbers from page
    const phones = extractPhonesFromHtml(data);

    // Emails
    const emails = await findEmailsOnPage(url);

    // Address — look for schema.org or common patterns
    let address = '';
    $('[itemprop="streetAddress"]').each((_, el) => { address += $(el).text().trim() + ' '; });
    $('[itemprop="addressLocality"]').each((_, el) => { address += $(el).text().trim() + ', '; });
    $('[itemprop="addressRegion"]').each((_, el) => { address += $(el).text().trim() + ' '; });
    $('[itemprop="postalCode"]').each((_, el) => { address += $(el).text().trim(); });
    address = address.replace(/\s+/g, ' ').trim();

    // Social links
    const socialMedia = {};
    $('a[href*="facebook.com"]').each((_, el) => { socialMedia.facebook = $(el).attr('href'); });
    $('a[href*="twitter.com"], a[href*="x.com"]').each((_, el) => { socialMedia.twitter = $(el).attr('href'); });
    $('a[href*="linkedin.com"]').each((_, el) => { socialMedia.linkedin = $(el).attr('href'); });
    $('a[href*="instagram.com"]').each((_, el) => { socialMedia.instagram = $(el).attr('href'); });

    return {
      businessName: businessName || extractDomain(url),
      email: emails[0] || null,
      emails,
      phone: phones[0] || null,
      phones,
      website: url,
      address: address || null,
      profession: profession || 'Unknown',
      socialMedia,
      source: 'direct',
    };
  } catch (err) {
    logger.error(`WebScraper failed for ${url}: ${err.message}`);
    return null;
  }
}

async function scrapeUrlList(urls, profession = '') {
  const leads = [];
  for (const url of urls) {
    await randomDelay();
    const lead = await scrapeWebPage(url, profession);
    if (lead) leads.push(lead);
  }
  return leads;
}

module.exports = { scrapeWebPage, scrapeUrlList };
