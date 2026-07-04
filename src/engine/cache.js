/**
 * In-memory LRU cache for vendor API responses.
 * Configurable TTL per step. Cache key = step ID + hashed request body.
 */
const crypto = require('crypto');
const logger = require('../utils/logger');

class Cache {
  constructor(maxSize = 1000) {
    this.store = new Map();
    this.maxSize = maxSize;
  }

  /** Generate a cache key from step ID and request body */
  _key(stepId, body) {
    const hash = crypto.createHash('md5').update(JSON.stringify(body || {})).digest('hex');
    return `${stepId}:${hash}`;
  }

  /**
   * Get a cached value if it exists and hasn't expired.
   * @param {string} stepId
   * @param {object} body - Request body (used for key hashing)
   * @returns {object|null} Cached response or null
   */
  get(stepId, body) {
    const key = this._key(stepId, body);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Move to end (LRU)
    this.store.delete(key);
    this.store.set(key, entry);
    logger.debug(`Cache HIT: ${key}`);
    return entry.data;
  }

  /**
   * Set a cache entry with TTL.
   * @param {string} stepId
   * @param {object} body - Request body
   * @param {object} data - Response data to cache
   * @param {number} ttlSeconds - Time to live in seconds
   */
  set(stepId, body, data, ttlSeconds) {
    if (!ttlSeconds) return;
    const key = this._key(stepId, body);

    // Evict oldest if full
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
    logger.debug(`Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
  }

  /** Get cache stats */
  stats() {
    return { size: this.store.size, maxSize: this.maxSize };
  }

  /** Clear all entries */
  clear() {
    this.store.clear();
  }
}

// Singleton
module.exports = new Cache();
