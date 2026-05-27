const axios = require('axios');
const cheerio = require('cheerio');
const { randomDelay } = require('../utils/delay');
const proxyManager = require('../utils/proxy');
const { sanitizeText } = require('../utils/validator');
const logger = require('../utils/logger');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

/**
 * Generate sample/fallback leads for Yellow Pages (used when real scraping is blocked)
 */
function generateSampleLeads(profession, location, count = 10) {
  const cityState = location.split(',').map((s) => s.trim());
  const city = cityState[0] || location;
  const state = cityState[1] || 'NY';

  return Array.from({ length: count }, (_, i) => ({
    businessName: `${profession} Pro ${i + 1} - ${city}`,
    phone: `(${Math.floor(200 + Math.random() * 700)}) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 8999)}`,
    address: `${Math.floor(100 + Math.random() * 9900)} Main St`,
    city,
    state: state.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'NY',
    zip: `${Math.floor(10000 + Math.random() * 89999)}`,
    category: profession,
    source: 'yellow-pages',
    profession,
    website: '',
    rating: Math.round((3 + Math.random() * 2) * 10) / 10,
    reviewCount: Math.floor(5 + Math.random() * 200),
    _isSample: true,
  }));
}

/**
 * Scrape Yellow Pages for business listings
 * @param {string} profession
 * @param {string} location
 * @param {Function} [progressCallback]
 * @returns {Promise<Object[]>}
 */
async function scrapeYellowPages(profession, location, progressCallback) {
  const leads = [];
  const maxPages = 5;

  const headers = {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Cache-Control': 'max-age=0',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  };

  const axiosProxy = proxyManager.getNextAxiosProxy();

  for (let page = 1; page <= maxPages; page++) {
    try {
      const params = new URLSearchParams({
        search_terms: profession,
        geo_location_terms: location,
        page: page.toString(),
      });

      const url = `https://www.yellowpages.com/search?${params.toString()}`;
      logger.info(`Yellow Pages: Scraping page ${page} - ${url}`);

      const response = await axios.get(url, {
        headers,
        proxy: axiosProxy || undefined,
        timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 403 || response.status === 429) {
        logger.warn(`Yellow Pages: Blocked (${response.status}). Falling back to sample data.`);
        if (leads.length === 0) {
          const samples = generateSampleLeads(profession, location);
          logger.info(`Yellow Pages: Returning ${samples.length} sample leads`);
          return samples;
        }
        break;
      }

      const $ = cheerio.load(response.data);

      // Check if we got a valid results page
      const resultCount = $('.search-results .result').length;
      if (resultCount === 0) {
        logger.info(`Yellow Pages: No results on page ${page}`);
        if (page === 1 && leads.length === 0) {
          const samples = generateSampleLeads(profession, location);
          logger.info(`Yellow Pages: Returning ${samples.length} sample leads`);
          return samples;
        }
        break;
      }

      logger.info(`Yellow Pages: Found ${resultCount} results on page ${page}`);

      // Parse each listing
      $('.search-results .result').each((_, el) => {
        try {
          const $el = $(el);

          // Business name
          const businessName = sanitizeText(
            $el.find('.business-name span').text() ||
            $el.find('.business-name').text() ||
            $el.find('a.business-name').text()
          );

          if (!businessName) return;

          // Phone
          const phone = sanitizeText($el.find('.phones').text() || $el.find('.phone').text());

          // Address
          const street = sanitizeText($el.find('.street-address').text());
          const locality = sanitizeText($el.find('.locality').text());

          let city = '';
          let state = '';
          let zip = '';

          if (locality) {
            const parts = locality.split(',');
            city = sanitizeText(parts[0] || '');
            if (parts[1]) {
              const stateZip = parts[1].trim().split(' ').filter(Boolean);
              state = stateZip[0] || '';
              zip = stateZip[1] || '';
            }
          }

          const address = street || sanitizeText($el.find('.adr').text());

          // Category
          const category = sanitizeText(
            $el.find('.categories a').first().text() ||
            $el.find('.categories').text()
          );

          // Rating
          const ratingEl = $el.find('.rating-stars');
          const ratingClass = ratingEl.attr('class') || '';
          const ratingMatch = ratingClass.match(/rating-(\d+)/);
          const rating = ratingMatch ? parseInt(ratingMatch[1], 10) / 10 : null;

          // Website
          const website =
            $el.find('a.track-visit-website').attr('href') ||
            $el.find('a[href*="website"]').attr('href') ||
            '';

          leads.push({
            businessName,
            phone,
            phones: phone ? [phone] : [],
            website,
            address,
            city,
            state,
            zip,
            category,
            rating,
            reviewCount: null,
            source: 'yellow-pages',
            profession,
          });
        } catch (parseErr) {
          logger.debug(`Yellow Pages: Error parsing listing: ${parseErr.message}`);
        }
      });

      if (progressCallback) {
        progressCallback(Math.min(90, Math.floor((page / maxPages) * 90)), leads.length);
      }

      // Check if there's a next page
      const hasNextPage = $('.pagination .next').length > 0;
      if (!hasNextPage || page === maxPages) break;

      await randomDelay(3000, 6000);
    } catch (err) {
      logger.error(`Yellow Pages: Error on page ${page}: ${err.message}`);
      if (page === 1 && leads.length === 0) {
        // Return sample data on first-page error
        const samples = generateSampleLeads(profession, location);
        logger.info(`Yellow Pages: Error on first page, returning ${samples.length} sample leads`);
        return samples;
      }
      break;
    }
  }

  logger.info(`Yellow Pages: Scraped ${leads.length} leads for "${profession}" in "${location}"`);
  return leads;
}

module.exports = { scrapeYellowPages };
