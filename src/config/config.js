require('dotenv').config();

module.exports = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  db: {
    uri: process.env.MONGO_URI || 'mongodb+srv://leadscrapper:lead%401234@cluster0.jueqlaf.mongodb.net/leads?retryWrites=true&w=majority&appName=Cluster0',
  },
  scraping: {
    delayMin: parseInt(process.env.SCRAPE_DELAY_MIN, 10) || 2000,
    delayMax: parseInt(process.env.SCRAPE_DELAY_MAX, 10) || 8000,
    maxWorkers: parseInt(process.env.MAX_WORKERS, 10) || 3,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
    maxRequestsPerDomain: parseInt(process.env.MAX_REQUESTS_PER_DOMAIN, 10) || 50,
  },
  apis: {
    hunterApiKey: process.env.HUNTER_API_KEY || '',
    rocketreachApiKey: process.env.ROCKETREACH_API_KEY || '',
  },
  proxies: {
    list: process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',').map((p) => p.trim()).filter(Boolean) : [],
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
