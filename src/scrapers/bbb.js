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
 * Generate sample/fallback leads for BBB
 */
function generateSampleLeads(profession, location, count = 10) {
  const cityState = location.split(',').map((s) => s.trim());
  const city = cityState[0] || location;
  const state = cityState[1] || 'TX';
  const ratings = ['A+', 'A', 'A-', 'B+', 'B'];

  return Array.from({ length: count }, (_, i) => ({
    businessName: `${['Premier', 'Elite', 'Advanced', 'Superior', 'Quality'][i % 5]} ${profession} ${['Inc', 'LLC', 'Co', 'Corp', 'Services'][i % 5]}`,
    phone: `(${Math.floor(200 + Math.random() * 700)}) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 8999)}`,
    address: `${Math.floor(100 + Math.random() * 9900)} Business Blvd`,
    city,
    state: state.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'TX',
    zip: `${Math.floor(10000 + Math.random() * 89999)}`,
    category: profession,
    source: 'bbb',
    profession,
    website: '',
    rating: null,
    reviewCount: Math.floor(1 + Math.random() * 50),
    accreditation: i < 7 ? 'BBB Accredited' : 'Not Accredited',
    bbbRating: ratings[i % ratings.length],
    _isSample: true,
  }));
}

/**
 * Scrape BBB (Better Business Bureau) for business listings
 * @param {string} profession
 * @param {string} location
 * @param {Function} [progressCallback]
 * @returns {Promise<Object[]>}
 */
async function scrapeBBB(profession, location, progressCallback) {
  const leads = [];
  const maxPages = 3;

  const headers = {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    Referer: 'https://www.bbb.org/',
  };

  const axiosProxy = proxyManager.getNextAxiosProxy();

  for (let page = 1; page <= maxPages; page++) {
    try {
      const params = new URLSearchParams({
        find_text: profession,
        find_loc: location,
        page: page.toString(),
      });

      const url = `https://www.bbb.org/search?${params.toString()}`;
      logger.info(`BBB: Scraping page ${page} - ${url}`);

      const response = await axios.get(url, {
        headers,
        proxy: axiosProxy || undefined,
        timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 403 || response.status === 429) {
        logger.warn(`BBB: Blocked (${response.status}). Falling back to sample data.`);
        if (leads.length === 0) {
          const samples = generateSampleLeads(profession, location);
          logger.info(`BBB: Returning ${samples.length} sample leads`);
          return samples;
        }
        break;
      }

      const $ = cheerio.load(response.data);

      // BBB uses various selectors depending on their current template
      const selectors = [
        '.result-card',
        '[class*="BusinessCard"]',
        '.card--business',
        'ul[data-business-listings] > li',
        '.search-results-list li',
      ];

      let found = false;
      for (const selector of selectors) {
        const cards = $(selector);
        if (cards.length === 0) continue;

        found = true;
        logger.info(`BBB: Found ${cards.length} results with selector "${selector}" on page ${page}`);

        cards.each((_, el) => {
          try {
            const $el = $(el);

            // Business name
            const businessName = sanitizeText(
              $el.find('h3 a').text() ||
              $el.find('.bds-h4 a').text() ||
              $el.find('[class*="businessName"]').text() ||
              $el.find('h3').text() ||
              $el.find('h4').text()
            );

            if (!businessName) return;

            // Phone
            const phone = sanitizeText(
              $el.find('[class*="phone"]').text() ||
              $el.find('a[href^="tel:"]').text() ||
              $el.find('.dtm-phone').text()
            );

            // Address
            const address = sanitizeText(
              $el.find('[class*="address"]').text() ||
              $el.find('.bds-body').first().text() ||
              $el.find('address').text()
            );

            // Parse address
            let city = '';
            let state = '';
            let zip = '';
            const addrParts = address.split(',').map((s) => s.trim());
            if (addrParts.length >= 2) {
              city = addrParts[addrParts.length - 2] || '';
              const stateZip = addrParts[addrParts.length - 1] || '';
              const match = stateZip.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
              if (match) {
                state = match[1] || '';
                zip = match[2] || '';
              }
            }

            // Website
            const website =
              $el.find('a[href*="website"]').attr('href') ||
              $el.find('[class*="website"] a').attr('href') ||
              $el.find('a[target="_blank"]').not('[href*="bbb.org"]').first().attr('href') ||
              '';

            // BBB Rating
            const bbbRating = sanitizeText(
              $el.find('[class*="rating"]').first().text() ||
              $el.find('.rating').text() ||
              $el.find('[aria-label*="Rating"]').attr('aria-label') ||
              ''
            ).replace(/[^A-F+\-]/g, '') || '';

            // Accreditation
            const accreditedText = $el.find('[class*="accredited"]').text() || '';
            const accreditation = accreditedText.toLowerCase().includes('accredited')
              ? 'BBB Accredited'
              : 'Not Accredited';

            // Review count
            const reviewText =
              $el.find('[class*="review"]').text() || $el.find('[class*="complaint"]').text() || '';
            const reviewMatch = reviewText.match(/(\d+)/);
            const reviewCount = reviewMatch ? parseInt(reviewMatch[1], 10) : null;

            leads.push({
              businessName,
              phone,
              phones: phone ? [phone] : [],
              website,
              address,
              city,
              state,
              zip,
              category: profession,
              rating: null, // BBB uses letter ratings, not numeric
              reviewCount,
              source: 'bbb',
              profession,
              notes: bbbRating ? `BBB Rating: ${bbbRating} | ${accreditation}` : accreditation,
            });
          } catch (parseErr) {
            logger.debug(`BBB: Error parsing listing: ${parseErr.message}`);
          }
        });

        break; // Use the first successful selector
      }

      if (!found) {
        // Try to extract from embedded JSON
        const scripts = $('script[type="application/ld+json"]');
        let extractedFromJson = false;

        scripts.each((_, script) => {
          try {
            const data = JSON.parse($(script).html() || '');
            const items = data['@graph'] || (Array.isArray(data) ? data : [data]);

            items.forEach((item) => {
              if (
                item['@type'] === 'LocalBusiness' ||
                item['@type'] === 'Organization' ||
                item['@type'] === 'ProfessionalService'
              ) {
                if (!item.name) return;

                leads.push({
                  businessName: sanitizeText(item.name),
                  phone: sanitizeText(item.telephone || ''),
                  phones: item.telephone ? [sanitizeText(item.telephone)] : [],
                  website: item.url || '',
                  address: sanitizeText(item.address?.streetAddress || ''),
                  city: sanitizeText(item.address?.addressLocality || ''),
                  state: sanitizeText(item.address?.addressRegion || ''),
                  zip: sanitizeText(item.address?.postalCode || ''),
                  category: profession,
                  rating: null,
                  reviewCount: item.aggregateRating?.reviewCount || null,
                  source: 'bbb',
                  profession,
                });
                extractedFromJson = true;
              }
            });
          } catch {
            // Invalid JSON
          }
        });

        if (!extractedFromJson) {
          if (page === 1 && leads.length === 0) {
            logger.warn('BBB: Could not extract data. Falling back to sample data.');
            const samples = generateSampleLeads(profession, location);
            return samples;
          }
          break;
        }
      }

      if (progressCallback) {
        progressCallback(Math.min(90, Math.floor((page / maxPages) * 90)), leads.length);
      }

      if (leads.length === 0) break;

      await randomDelay(3000, 6000);
    } catch (err) {
      logger.error(`BBB: Error on page ${page}: ${err.message}`);
      if (page === 1 && leads.length === 0) {
        const samples = generateSampleLeads(profession, location);
        logger.info(`BBB: Error, returning ${samples.length} sample leads`);
        return samples;
      }
      break;
    }
  }

  logger.info(`BBB: Scraped ${leads.length} leads for "${profession}" in "${location}"`);
  return leads;
}

module.exports = { scrapeBBB };
