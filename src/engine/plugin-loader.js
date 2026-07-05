/**
 * Plugin Loader — extensible hook system for workflow execution.
 *
 * Scans the plugins/ directory for JS modules. Each plugin exports:
 *   { name, version, hooks: { beforeStep, afterStep, onError, beforeResponse, transformRequest, transformResponse } }
 *
 * All hooks are optional. They receive (context, stepOrResult) and can mutate or return data.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PLUGINS_DIR = path.join(__dirname, '../../plugins');

/** @type {object[]} Loaded plugin instances */
const plugins = [];

/**
 * Load all plugins from the plugins/ directory.
 * Each .js file should export { name, version, hooks }.
 */
function loadAll() {
  plugins.length = 0;

  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    logger.info('Created plugins/ directory');
    return;
  }

  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const pluginPath = path.join(PLUGINS_DIR, file);
      // Clear require cache so plugins can be hot-reloaded
      delete require.cache[require.resolve(pluginPath)];
      const plugin = require(pluginPath);

      if (!plugin.name) {
        logger.warn(`Skipping plugin without name: ${file}`);
        continue;
      }

      plugins.push(plugin);
      logger.info(`Loaded plugin: ${plugin.name} v${plugin.version || '1.0'}`);
    } catch (err) {
      logger.error(`Failed to load plugin ${file}: ${err.message}`);
    }
  }

  logger.info(`Loaded ${plugins.length} plugin(s)`);
}

/**
 * Run a specific hook across all loaded plugins.
 * @param {string} hookName - One of: beforeStep, afterStep, onError, beforeResponse, transformRequest, transformResponse
 * @param  {...any} args - Arguments to pass to the hook
 * @returns {*} The last non-undefined return value (for transform hooks)
 */
async function runHook(hookName, ...args) {
  let result;
  for (const plugin of plugins) {
    const hook = plugin.hooks?.[hookName];
    if (!hook) continue;

    try {
      const ret = await hook(...args);
      if (ret !== undefined) result = ret;
    } catch (err) {
      logger.error(`Plugin "${plugin.name}" hook "${hookName}" error: ${err.message}`);
    }
  }
  return result;
}

/**
 * Get list of loaded plugins (for /api/plugins endpoint).
 * @returns {{ name: string, version: string, hooks: string[] }[]}
 */
function list() {
  return plugins.map(p => ({
    name: p.name,
    version: p.version || '1.0',
    hooks: Object.keys(p.hooks || {})
  }));
}

module.exports = { loadAll, runHook, list };
