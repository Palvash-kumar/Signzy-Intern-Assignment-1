/**
 * Config Loader — reads workflow configs from the configs/ directory.
 * Supports hot-reload via fs.watch.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_DIR = path.join(__dirname, '../../configs');

/** @type {Map<string, object>} */
const workflows = new Map();

/**
 * Load all workflow configs from the configs/ directory.
 * @returns {Map<string, object>} Map of workflow ID → config
 */
function loadAll() {
  workflows.clear();

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    logger.warn('No configs directory found, created empty one');
    return workflows;
  }

  const files = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(CONFIG_DIR, file), 'utf-8');
      const config = JSON.parse(raw);
      if (!config.id || !config.endpoint) {
        logger.warn(`Skipping invalid config (missing id/endpoint): ${file}`);
        continue;
      }
      workflows.set(config.id, config);
      logger.info(`Loaded workflow: ${config.id} → ${config.endpoint.method} ${config.endpoint.path}`);
    } catch (err) {
      logger.error(`Failed to load config ${file}: ${err.message}`);
    }
  }

  logger.info(`Loaded ${workflows.size} workflow(s)`);
  return workflows;
}

/**
 * Get a specific workflow by ID.
 * @param {string} id
 * @returns {object|undefined}
 */
function get(id) {
  return workflows.get(id);
}

/**
 * Get all workflows as an array.
 * @returns {object[]}
 */
function getAll() {
  return Array.from(workflows.values());
}

/**
 * Save a workflow config to disk and reload.
 * @param {object} config - Workflow config object
 */
function save(config) {
  if (!config.id) throw new Error('Workflow config must have an id');
  const filePath = path.join(CONFIG_DIR, `${config.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  workflows.set(config.id, config);
  logger.info(`Saved workflow: ${config.id}`);
  return config;
}

/**
 * Delete a workflow config.
 * @param {string} id
 */
function remove(id) {
  const filePath = path.join(CONFIG_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  workflows.delete(id);
  logger.info(`Deleted workflow: ${id}`);
}

/**
 * Watch the configs directory for changes and hot-reload.
 * @param {function} onReload - Callback when configs are reloaded
 */
function watch(onReload) {
  if (!fs.existsSync(CONFIG_DIR)) return;

  // ponytail: debounce file system events, they fire in bursts
  let reloadTimer;
  fs.watch(CONFIG_DIR, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      logger.info('Config change detected, reloading...');
      loadAll();
      if (onReload) onReload(workflows);
    }, 500);
  });
}

module.exports = { loadAll, get, getAll, save, remove, watch, CONFIG_DIR };
