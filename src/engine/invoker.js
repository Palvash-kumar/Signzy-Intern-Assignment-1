/**
 * HTTP invoker — calls downstream vendor APIs.
 * Uses native fetch (Node 18+). Handles headers, auth, timeout.
 */
const logger = require('../utils/logger');

/**
 * Invoke a vendor API.
 * @param {object} vendorConfig - { url, method, headers, auth }
 * @param {object} body - Mapped request body
 * @param {object} options - { timeout, correlationId }
 * @returns {Promise<{ status: number, data: object, duration: number }>}
 */
async function invoke(vendorConfig, body, options = {}) {
  const { url, method = 'POST', headers = {} } = vendorConfig;
  const { timeout = 10000, correlationId } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const startTime = Date.now();
  try {
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId || '',
        ...headers
      },
      signal: controller.signal
    };

    if (method !== 'GET' && method !== 'HEAD' && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    logger.info(`Invoking vendor API: ${method} ${url}`, { correlationId });

    const response = await fetch(url, fetchOptions);
    const data = await response.json().catch(() => ({}));
    const duration = Date.now() - startTime;

    logger.info(`Vendor API responded: ${response.status} in ${duration}ms`, { correlationId, url });

    return { status: response.status, data, duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    if (err.name === 'AbortError') {
      logger.error(`Vendor API timeout after ${timeout}ms: ${url}`, { correlationId });
      throw new Error(`Vendor API timeout: ${url} after ${timeout}ms`);
    }
    logger.error(`Vendor API error: ${url} — ${err.message}`, { correlationId });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { invoke };
