/**
 * In-memory sliding window rate limiter.
 * No Redis needed. Configurable per-route from workflow config.
 */
const logger = require('../utils/logger');
const configLoader = require('../engine/config-loader');

// Store: { routePath: { timestamps: number[], windowMs, max } }
const buckets = new Map();

/**
 * Rate limiting middleware. Reads limits from workflow config.
 * Default: 100 requests per 60 seconds if not configured.
 */
function rateLimiter(req, res, next) {
  const workflows = configLoader.getAll();
  const workflow = workflows.find(w => {
    const { method, path: p } = w.endpoint;
    return req.method === method && req.path === p;
  });

  const config = workflow?.rateLimit;
  if (!config) return next(); // no rate limit configured

  const windowMs = config.windowMs || 60000;
  const max = config.max || 100;
  const key = `${req.ip}:${req.path}`;

  if (!buckets.has(key)) {
    buckets.set(key, []);
  }

  const timestamps = buckets.get(key);
  const now = Date.now();
  const windowStart = now - windowMs;

  // Remove expired timestamps
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= max) {
    logger.warn(`Rate limit exceeded: ${key}`, { ip: req.ip, path: req.path });
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((timestamps[0] + windowMs - now) / 1000)
    });
  }

  timestamps.push(now);
  res.setHeader('X-RateLimit-Limit', max);
  res.setHeader('X-RateLimit-Remaining', max - timestamps.length);
  next();
}

module.exports = { rateLimiter };
