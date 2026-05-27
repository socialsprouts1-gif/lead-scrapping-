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
 * Generate sample/fallback leads for Yelp
 */
function generateSampleLeads(profession, location, count = 10) {
  const cityState = location.split(',').map((s) => s.trim());
  const city = cityState[0] || location;
  const state = cityState[1] || 'CA';

  const categories = [profession, `${profession} Services`, `Local ${profession}`];

  return Array.from({ length: count }, (_, i) => ({
    businessName: `The ${profession} ${['Company', 'Group', 'Services', 'Pros', 'Experts'][i % 5]} ${i + 1}`,
    phone: `(${Math.floor(200 + Math.random() * 700)}) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 8999)}`,
    address: `${Math.floor(100 + Math.random() * 9900)} ${['Oak', 'Maple', 'Pine', 'Cedar', 'Elm'][i % 5]} Ave`,
    city,
    state: state.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'CA',
    zip: `${Math.floor(10000 + Math.random() * 89999)}`,
    category: categories[i % categories.length],
    source: 'yelp',
    profession,
    website: '',
    rating: Math.round((3 + Math.random() * 2) * 10) / 10,
    reviewCount: Math.floor(10 + Math.random() * 500),
    _isSample: true,
  }));
}

/**
 * Extract leads from Yelp JSON-LD data
 */
function extractFromJsonLd(html) {
  const leads = [];
  try {
    const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type'] === 'LocalBusiness' || item['@type'] === 'Restaurant') {
            const lead = {
              businessName: sanitizeText(item.name || ''),
              phone: sanitizeText(item.telephone || ''),
              website: item.url || '',
              address: '',
              city: '',
              state: '',
              zip: '',
              category: item['@type'] || '',
              rating: item.aggregateRating?.ratingValue
                ? parseFloat(item.aggregateRating.ratingValue)
                : null,
              reviewCount: item.aggregateRating?.reviewCount
                ? parseInt(item.aggregateRating.reviewCount, 10)
                : null,
            };

            if (item.address) {
              lead.address = sanitizeText(item.address.streetAddress || '');
              lead.city = sanitizeText(item.address.addressLocality || '');
              lead.state = sanitizeText(item.address.addressRegion || '');
              lead.zip = sanitizeText(item.address.postalCode || '');
            }

            if (lead.businessName) {
              leads.push(lead);
            }
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  } catch (err) {
    logger.debug(`JSON-LD extraction error: ${err.message}`);
  }
  return leads;
}

/**
 * Scrape Yelp for business listings
 * @param {string} profession
 * @param {string} location
 * @param {Function} [progressCallback]
 * @returns {Promise<Object[]>}
 */
async function scrapeYelp(profession, location, progressCallback) {
  const leads = [];
  const maxPages = 3;
  const resultsPerPage = 10;

  const headers = {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
  };

  const axiosProxy = proxyManager.getNextAxiosProxy();

  for (let page = 0; page < maxPages; page++) {
    try {
      const params = new URLSearchParams({
        find_desc: profession,
        find_loc: location,
        start: (page * resultsPerPage).toString(),
      });

      const url = `https://www.yelp.com/search?${params.toString()}`;
      logger.info(`Yelp: Scraping page ${page + 1} - ${url}`);

      const response = await axios.get(url, {
        headers,
        proxy: axiosProxy || undefined,
        timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 403 || response.status === 429) {
        logger.warn(`Yelp: Blocked (${response.status}). Falling back to sample data.`);
        if (leads.length === 0) {
          const samples = generateSampleLeads(profession, location);
          logger.info(`Yelp: Returning ${samples.length} sample leads`);
          return samples;
        }
        break;
      }

      const html = response.data;
      const $ = cheerio.load(html);

      // Try JSON-LD extraction first
      const jsonLdLeads = extractFromJsonLd(html);
      if (jsonLdLeads.length > 0) {
        logger.info(`Yelp: Extracted ${jsonLdLeads.length} leads from JSON-LD on page ${page + 1}`);
        jsonLdLeads.forEach((lead) => {
          leads.push({ ...lead, source: 'yelp', profession });
        });
      } else {
        // HTML parsing fallback
        // Yelp uses dynamic class names but we can look for common patterns
        const businessCards = $('[class*="businessName"], [data-testid="serp-ia-card"]');

        if (businessCards.length === 0 && page === 0 && leads.length === 0) {
          // Try to extract from Yelp's embedded JSON
          const scriptTags = $('script');
          let foundJson = false;

          scriptTags.each((_, script) => {
            const content = $(script).html() || '';
            if (content.includes('"businesses"') || content.includes('"name"')) {
              try {
                // Look for JSON data patterns
                const match = content.match(/"businesses"\s*:\s*(\[[\s\S]*?\])/);
                if (match) {
                  const businesses = JSON.parse(match[1]);
                  businesses.forEach((biz) => {
                    if (biz.name) {
                      leads.push({
                        businessName: sanitizeText(biz.name),
                        phone: sanitizeText(biz.phone || ''),
                        phones: biz.phone ? [sanitizeText(biz.phone)] : [],
                        website: biz.website_url || '',
                        address: sanitizeText(biz.location?.address1 || ''),
                        city: sanitizeText(biz.location?.city || ''),
                        state: sanitizeText(biz.location?.state || ''),
                        zip: sanitizeText(biz.location?.zip_code || ''),
                        category: biz.categories?.[0]?.title || profession,
                        rating: biz.rating || null,
                        reviewCount: biz.review_count || null,
                        source: 'yelp',
                        profession,
                      });
                    }
                  });
                  foundJson = true;
                }
              } catch {
                // JSON parsing failed
              }
            }
          });

          if (!foundJson && leads.length === 0) {
            logger.warn('Yelp: Could not extract data from HTML. Falling back to sample data.');
            const samples = generateSampleLeads(profession, location);
            return samples;
          }
        }
      }

      if (progressCallback) {
        progressCallback(Math.min(90, Math.floor(((page + 1) / maxPages) * 90)), leads.length);
      }

      if (leads.length > 0) {
        await randomDelay(3000, 6000);
      } else {
        break;
      }
    } catch (err) {
      logger.error(`Yelp: Error on page ${page + 1}: ${err.message}`);
      if (page === 0 && leads.length === 0) {
        const samples = generateSampleLeads(profession, location);
        logger.info(`Yelp: Error on first page, returning ${samples.length} sample leads`);
        return samples;
      }
      break;
    }
  }

  logger.info(`Yelp: Scraped ${leads.length} leads for "${profession}" in "${location}"`);
  return leads;
}

module.exports = { scrapeYelp };
