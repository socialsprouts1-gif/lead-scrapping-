const logger = require('./logger');

/**
 * ProxyManager - manages a pool of proxies with round-robin rotation
 */
class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.loadProxies();
  }

  /**
   * Load proxies from PROXY_LIST environment variable (comma-separated)
   * Format: protocol://user:pass@host:port or protocol://host:port
   */
  loadProxies() {
    const proxyList = process.env.PROXY_LIST || '';
    if (!proxyList.trim()) {
      logger.info('No proxies configured. Running without proxy rotation.');
      return;
    }

    this.proxies = proxyList
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    logger.info(`Loaded ${this.proxies.length} proxies`);
  }

  /**
   * Get the next proxy in round-robin rotation
   * @returns {string|null} Proxy URL or null if no proxies available
   */
  getNextProxy() {
    if (this.proxies.length === 0) return null;
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  /**
   * Check if any proxies are available
   * @returns {boolean}
   */
  hasProxies() {
    return this.proxies.length > 0;
  }

  /**
   * Parse a proxy URL string into components
   * @param {string} proxyUrl - Proxy URL (e.g. http://user:pass@host:port)
   * @returns {Object} Parsed proxy object
   */
  parseProxy(proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      return {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port, 10) || 8080,
        username: url.username || null,
        password: url.password || null,
      };
    } catch (err) {
      logger.error(`Invalid proxy URL: ${proxyUrl}`, err.message);
      return null;
    }
  }

  /**
   * Format proxy for use with Puppeteer
   * @param {string} proxyUrl
   * @returns {Object} { server, username, password } or null
   */
  formatProxyForPuppeteer(proxyUrl) {
    if (!proxyUrl) return null;
    const parsed = this.parseProxy(proxyUrl);
    if (!parsed) return null;

    const server = `${parsed.protocol}://${parsed.host}:${parsed.port}`;
    return {
      server,
      username: parsed.username,
      password: parsed.password,
    };
  }

  /**
   * Format proxy for use with Axios
   * @param {string} proxyUrl
   * @returns {Object} Axios proxy config or null
   */
  formatProxyForAxios(proxyUrl) {
    if (!proxyUrl) return null;
    const parsed = this.parseProxy(proxyUrl);
    if (!parsed) return null;

    const config = {
      host: parsed.host,
      port: parsed.port,
      protocol: parsed.protocol,
    };

    if (parsed.username && parsed.password) {
      config.auth = {
        username: parsed.username,
        password: parsed.password,
      };
    }

    return config;
  }

  /**
   * Get a Puppeteer-formatted proxy config
   * @returns {Object|null}
   */
  getNextPuppeteerProxy() {
    const proxy = this.getNextProxy();
    return proxy ? this.formatProxyForPuppeteer(proxy) : null;
  }

  /**
   * Get an Axios-formatted proxy config
   * @returns {Object|null}
   */
  getNextAxiosProxy() {
    const proxy = this.getNextProxy();
    return proxy ? this.formatProxyForAxios(proxy) : null;
  }
}

// Export singleton
const proxyManager = new ProxyManager();
module.exports = proxyManager;
