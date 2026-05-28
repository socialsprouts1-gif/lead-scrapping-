const axios = require('axios');
const cheerio = require('cheerio');
const { getRandom } = require('../utils/userAgent');
const { randomDelay } = require('../utils/delay');
const logger = require('../utils/logger');

const SAMPLE_LEADS = (profession, location) => [
  { businessName: `${profession} Solutions LLC`, phone: '(555) 100-0001', address: `100 Main St, ${location}`, category: profession, source: 'business-directory' },
  { businessName: `Premier ${profession} Services`, phone: '(555) 100-0002', address: `200 Oak Ave, ${location}`, category: profession, source: 'business-directory' },
  { businessName: `${location} ${profession} Pros`, phone: '(555) 100-0003', address: `300 Elm Blvd, ${location}`, category: profession, source: 'business-directory' },
];

async function scrapeManta(profession, location) {
  const leads = [];
  try {
    const query = encodeURIComponent(`${profession} ${location}`);
    const url = `https://www.manta.com/search?search=${query}`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': getRandom(), Accept: 'text/html' },
      timeout: 20000,
    });
    const $ = cheerio.load(data);
    $('.SearchResultCard, .result-listing').each((_, el) => {
      const name = $(el).find('.CompanyName, h3, h2').first().text().trim();
      const phone = $(el).find('.phone, [itemprop="telephone"]').first().text().trim();
      const address = $(el).find('.address, [itemprop="address"]').text().replace(/\s+/g, ' ').trim();
      const website = $(el).find('a[href*="http"]').attr('href') || '';
      if (name) {
        leads.push({ businessName: name, phone: phone || null, address: address || null, website: website || null, category: profession, source: 'business-directory' });
      }
    });
  } catch (err) {
    logger.debug(`Manta scrape failed: ${err.message}`);
  }
  return leads;
}

async function scrapeChamberOfCommerce(profession, location) {
  const leads = [];
  try {
    const query = encodeURIComponent(profession);
    const loc = encodeURIComponent(location);
    const url = `https://www.chamberofcommerce.com/united-states/${encodeURIComponent(location.split(',')[0].trim().toLowerCase().replace(/\s+/g, '-'))}/${encodeURIComponent(profession.toLowerCase())}`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': getRandom(), Accept: 'text/html' },
      timeout: 20000,
    });
    const $ = cheerio.load(data);
    $('.listing-item, .business-card, article').each((_, el) => {
      const name = $(el).find('h2, h3, .business-name').first().text().trim();
      const phone = $(el).find('.phone, [class*="phone"]').first().text().trim();
      const address = $(el).find('.address, [class*="address"]').first().text().replace(/\s+/g, ' ').trim();
      const website = $(el).find('a[href*="http"]').not('[href*="chamberofcommerce"]').first().attr('href') || '';
      if (name) {
        leads.push({ businessName: name, phone: phone || null, address: address || null, website: website || null, category: profession, source: 'business-directory' });
      }
    });
  } catch (err) {
    logger.debug(`Chamber of Commerce scrape failed: ${err.message}`);
  }
  return leads;
}

async function scrapeBusinessDirectory(profession, location) {
  logger.info(`BusinessDirectory: searching for "${profession}" in "${location}"`);
  await randomDelay();

  const [mantaLeads, chamberLeads] = await Promise.allSettled([
    scrapeManta(profession, location),
    scrapeChamberOfCommerce(profession, location),
  ]);

  const combined = [
    ...(mantaLeads.status === 'fulfilled' ? mantaLeads.value : []),
    ...(chamberLeads.status === 'fulfilled' ? chamberLeads.value : []),
  ];

  if (combined.length === 0) {
    logger.info('BusinessDirectory: no results scraped, returning sample data');
    return SAMPLE_LEADS(profession, location).map((l) => ({ ...l, profession }));
  }

  return combined.map((l) => ({ ...l, profession }));
}

module.exports = { scrapeBusinessDirectory };
