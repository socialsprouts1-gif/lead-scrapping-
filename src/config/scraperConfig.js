// Scraper-specific settings: selectors, headers, limits per source
module.exports = {
  googleMaps: {
    baseUrl: 'https://www.google.com/maps/search/',
    maxResults: 60,
    scrollAttempts: 10,
    scrollDelay: 1500,
  },
  yellowPages: {
    baseUrl: 'https://www.yellowpages.com/search',
    maxPages: 5,
    resultsSelector: '.result',
    nameSelector: '.business-name',
    phoneSelector: '.phones',
    addressSelector: '.adr',
    categorySelector: '.categories',
    ratingSelector: '.rating',
  },
  yelp: {
    baseUrl: 'https://www.yelp.com/search',
    maxPages: 5,
  },
  bbb: {
    baseUrl: 'https://www.bbb.org/search',
    maxPages: 3,
  },
  businessDirectory: {
    sources: [
      'https://www.chamberofcommerce.com/search',
      'https://www.manta.com/search',
      'https://www.hotfrog.com/search',
    ],
    maxPages: 3,
  },
  linkedin: {
    baseUrl: 'https://www.linkedin.com/search/results/companies/',
    maxResults: 20,
  },
  // Common headers for Axios-based scrapers
  defaultHeaders: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  },
  // Puppeteer launch options (server-safe)
  puppeteerArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
  ],
};
