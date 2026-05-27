/**
 * Delay utilities for rate-limiting scraping requests
 */

/**
 * Returns a Promise that resolves after a random delay between min and max milliseconds.
 * Uses SCRAPE_DELAY_MIN and SCRAPE_DELAY_MAX from environment if not provided.
 * @param {number} [min] - Minimum delay in ms
 * @param {number} [max] - Maximum delay in ms
 * @returns {Promise<void>}
 */
function randomDelay(min, max) {
  const minDelay = (min != null ? min : parseInt(process.env.SCRAPE_DELAY_MIN, 10) || 2000);
  const maxDelay = (max != null ? max : parseInt(process.env.SCRAPE_DELAY_MAX, 10) || 8000);
  const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Fixed delay
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff delay
 * @param {number} attempt - Attempt number (0-indexed)
 * @param {number} [baseDelay=1000] - Base delay in ms
 * @param {number} [maxDelay=30000] - Maximum delay in ms
 * @returns {Promise<void>}
 */
function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

module.exports = { randomDelay, sleep, exponentialBackoff };
