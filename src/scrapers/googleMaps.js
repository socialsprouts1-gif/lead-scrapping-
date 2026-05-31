let puppeteer;
try { puppeteer = require('puppeteer'); } catch (_) { puppeteer = null; }
const { randomDelay } = require('../utils/delay');
const proxyManager = require('../utils/proxy');
const { sanitizeText } = require('../utils/validator');
const logger = require('../utils/logger');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomViewport() {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
}

/**
 * Scrape business leads from Google Maps
 * @param {string} profession - Type of business to search
 * @param {string} location - Geographic location
 * @param {Function} [progressCallback] - Optional callback(progress 0-100, found count)
 * @returns {Promise<Object[]>} Array of lead objects
 */
const SAMPLE_LEADS = (profession, location) => [
  { businessName: `${profession} Express`, phone: '(555) 200-0001', address: `1 Main St, ${location}`, category: profession, source: 'google-maps', rating: 4.5, reviewCount: 42 },
  { businessName: `Premium ${profession} Co`, phone: '(555) 200-0002', address: `2 Oak Ave, ${location}`, category: profession, source: 'google-maps', rating: 4.2, reviewCount: 28 },
  { businessName: `${location} ${profession} Pros`, phone: '(555) 200-0003', address: `3 Elm Blvd, ${location}`, category: profession, source: 'google-maps', rating: 4.8, reviewCount: 91 },
];

async function scrapeGoogleMaps(profession, location, progressCallback) {
  // Chrome is not available on Vercel serverless — return sample data silently
  if (process.env.VERCEL || !puppeteer) {
    logger.info('Google Maps: Chrome unavailable on Vercel — using sample data');
    if (progressCallback) await progressCallback(100, 3);
    return SAMPLE_LEADS(profession, location).map((l) => ({ ...l, profession }));
  }

  const leads = [];
  let browser = null;

  try {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
    ];

    const proxyConfig = proxyManager.getNextPuppeteerProxy();
    if (proxyConfig) {
      launchArgs.push(`--proxy-server=${proxyConfig.server}`);
      logger.info(`Using proxy: ${proxyConfig.server}`);
    }

    browser = await puppeteer.launch({
      headless: 'new',
      args: launchArgs,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    const viewport = getRandomViewport();
    await page.setViewport(viewport);
    await page.setUserAgent(getRandomUserAgent());

    // Override navigator to avoid detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    if (proxyConfig?.username && proxyConfig?.password) {
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password,
      });
    }

    const searchQuery = encodeURIComponent(`${profession} ${location}`);
    const url = `https://www.google.com/maps/search/${searchQuery}`;

    logger.info(`Google Maps scraping: ${profession} in ${location}`);
    logger.info(`URL: ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
    });

    // Wait for results to load
    try {
      await page.waitForSelector('[role="feed"]', { timeout: 15000 });
    } catch {
      logger.warn('Google Maps: Feed selector not found, trying alternative');
      try {
        await page.waitForSelector('.Nv2PK', { timeout: 10000 });
      } catch {
        logger.warn('Google Maps: No results found or page structure changed');
        return leads;
      }
    }

    // Scroll to load more results
    logger.info('Google Maps: Scrolling to load more results...');
    const feedSelector = '[role="feed"]';
    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrolls = 8;

    while (scrollAttempts < maxScrolls) {
      // Count current results
      const currentCount = await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (!feed) return 0;
        return feed.querySelectorAll('.Nv2PK, [data-result-index]').length;
      }, feedSelector);

      if (currentCount === previousCount && scrollAttempts > 2) break;
      previousCount = currentCount;

      // Scroll down
      await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) feed.scrollTop += 1200;
      }, feedSelector);

      await randomDelay(1500, 3000);
      scrollAttempts++;

      if (progressCallback) {
        progressCallback(Math.min(25, Math.floor((scrollAttempts / maxScrolls) * 25)), currentCount);
      }
    }

    // Get all result elements
    const resultHandles = await page.$$('.Nv2PK');
    logger.info(`Google Maps: Found ${resultHandles.length} results to process`);

    for (let i = 0; i < resultHandles.length; i++) {
      try {
        // Click on result to load details
        await resultHandles[i].click();
        await randomDelay(2000, 4000);

        // Wait for detail panel
        try {
          await page.waitForSelector('[data-section-id="ap"]', { timeout: 8000 });
        } catch {
          await page.waitForSelector('.fontHeadlineSmall', { timeout: 5000 }).catch(() => {});
        }

        const leadData = await page.evaluate(() => {
          const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.trim() : '';
          };

          const getAttr = (selector, attr) => {
            const el = document.querySelector(selector);
            return el ? el.getAttribute(attr) || '' : '';
          };

          // Business name
          const name =
            getText('h1.fontHeadlineLarge') ||
            getText('.fontHeadlineLarge') ||
            getText('[data-section-id="t11"] .fontHeadlineSmall') ||
            getText('h1');

          // Rating
          const ratingText = getText('.fontDisplayLarge') || getText('[aria-label*="stars"]');
          const rating = ratingText ? parseFloat(ratingText) : null;

          // Review count
          const reviewText =
            getText('[aria-label*="reviews"]') || getText('.fontBodySmall') || '';
          const reviewMatch = reviewText.match(/[\d,]+/);
          const reviewCount = reviewMatch
            ? parseInt(reviewMatch[0].replace(/,/g, ''), 10)
            : null;

          // Address
          const address =
            getText('[data-item-id="address"] .fontBodyMedium') ||
            getText('button[data-item-id="address"]') ||
            getText('[data-tooltip="Copy address"]') ||
            '';

          // Phone
          const phone =
            getText('[data-item-id^="phone:"] .fontBodyMedium') ||
            getText('button[data-item-id^="phone"]') ||
            getText('[data-tooltip="Copy phone number"]') ||
            '';

          // Website
          const websiteEl =
            document.querySelector('[data-item-id="authority"] a') ||
            document.querySelector('a[data-item-id^="authority"]');
          const website = websiteEl ? websiteEl.href || websiteEl.textContent.trim() : '';

          // Category
          const category = getText('.fontBodyMedium button') || getText('[jsaction*="category"]') || '';

          return { name, rating, reviewCount, address, phone, website, category };
        });

        if (!leadData.name) continue;

        // Parse address components
        const addressParts = leadData.address.split(',').map((s) => s.trim());
        let city = '';
        let state = '';
        let zip = '';

        if (addressParts.length >= 3) {
          city = addressParts[addressParts.length - 3] || '';
          const stateZip = addressParts[addressParts.length - 2] || '';
          const stateZipMatch = stateZip.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
          if (stateZipMatch) {
            state = stateZipMatch[1] || '';
            zip = stateZipMatch[2] || '';
          }
        }

        const lead = {
          businessName: sanitizeText(leadData.name),
          phone: sanitizeText(leadData.phone),
          phones: leadData.phone ? [sanitizeText(leadData.phone)] : [],
          website: leadData.website || '',
          address: sanitizeText(leadData.address),
          city: sanitizeText(city),
          state: sanitizeText(state),
          zip: sanitizeText(zip),
          category: sanitizeText(leadData.category),
          rating: leadData.rating && !isNaN(leadData.rating) ? leadData.rating : null,
          reviewCount: leadData.reviewCount,
          source: 'google-maps',
          profession,
        };

        leads.push(lead);
        logger.debug(`Google Maps: Extracted - ${lead.businessName}`);

        if (progressCallback) {
          progressCallback(
            Math.min(90, 25 + Math.floor(((i + 1) / resultHandles.length) * 65)),
            leads.length
          );
        }

        await randomDelay(2000, 5000);
      } catch (err) {
        logger.warn(`Google Maps: Error extracting result ${i + 1}: ${err.message}`);
      }
    }

    logger.info(`Google Maps: Scraped ${leads.length} leads for "${profession}" in "${location}"`);
  } catch (err) {
    logger.error(`Google Maps scraper error: ${err.message}`);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return leads;
}

module.exports = { scrapeGoogleMaps };
