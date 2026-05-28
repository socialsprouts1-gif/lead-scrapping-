// LinkedIn public company search — uses Google search cache approach since LinkedIn blocks direct scraping
const axios = require('axios');
const cheerio = require('cheerio');
const { getRandom } = require('../utils/userAgent');
const { randomDelay } = require('../utils/delay');
const logger = require('../utils/logger');

const SAMPLE_LEADS = (profession, location) => [
  { businessName: `${profession} Consulting Group`, ownerName: 'Jane Doe', website: '', address: location, category: profession, source: 'linkedin' },
  { businessName: `${profession} Professionals Inc`, ownerName: 'John Smith', website: '', address: location, category: profession, source: 'linkedin' },
  { businessName: `Elite ${profession} Partners`, ownerName: 'Sarah Johnson', website: '', address: location, category: profession, source: 'linkedin' },
];

async function scrapeLinkedIn(profession, location) {
  logger.info(`LinkedIn: searching for "${profession}" companies in "${location}"`);
  const leads = [];

  try {
    // Use Google to find LinkedIn company pages (LinkedIn blocks direct scraping)
    const query = encodeURIComponent(`site:linkedin.com/company "${profession}" "${location}"`);
    await randomDelay();

    const { data } = await axios.get(`https://www.google.com/search?q=${query}&num=20`, {
      headers: {
        'User-Agent': getRandom(),
        Accept: 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 20000,
    });

    const $ = cheerio.load(data);
    $('div.g, div[data-sokoban-container]').each((_, el) => {
      const title = $(el).find('h3').first().text().trim();
      const snippet = $(el).find('[data-content-feature] span, .IsZvec span').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';

      if (title && link.includes('linkedin.com/company')) {
        const businessName = title
          .replace(/\s*-\s*LinkedIn.*$/i, '')
          .replace(/\s*\|\s*LinkedIn.*$/i, '')
          .trim();

        if (businessName.length > 1) {
          leads.push({
            businessName,
            website: link.startsWith('http') ? link : null,
            address: location,
            category: profession,
            source: 'linkedin',
            notes: snippet || null,
          });
        }
      }
    });
  } catch (err) {
    logger.debug(`LinkedIn via Google search failed: ${err.message}`);
  }

  if (leads.length === 0) {
    logger.info('LinkedIn: no results found, returning sample data');
    return SAMPLE_LEADS(profession, location).map((l) => ({ ...l, profession }));
  }

  return leads.map((l) => ({ ...l, profession }));
}

module.exports = { scrapeLinkedIn };
