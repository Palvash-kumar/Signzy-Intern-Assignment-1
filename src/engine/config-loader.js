/**
 * Config Loader — reads workflow configs from the configs/ directory.
 * Supports hot-reload via fs.watch and workflow versioning.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_DIR = path.join(__dirname, '../../configs');

/** @type {Map<string, object>} id@version → config */
const workflows = new Map();

/** @type {Map<string, string[]>} id → [version1, version2, ...] sorted ascending */
const versionIndex = new Map();

/**
 * Load all workflow configs from the configs/ directory.
 * @returns {Map<string, object>} Map of versioned key → config
 */
function loadAll() {
  workflows.clear();
  versionIndex.clear();

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
      _index(config);
      logger.info(`Loaded workflow: ${config.id}@${config.version || '1.0'} → ${config.endpoint.method} ${config.endpoint.path}`);
    } catch (err) {
      logger.error(`Failed to load config ${file}: ${err.message}`);
    }
  }

  logger.info(`Loaded ${workflows.size} workflow(s)`);
  return workflows;
}

/** Add a config to the in-memory stores */
function _index(config) {
  const ver = config.version || '1.0';
  const key = `${config.id}@${ver}`;
  workflows.set(key, config);

  const versions = versionIndex.get(config.id) || [];
  if (!versions.includes(ver)) {
    versions.push(ver);
    versions.sort(_compareVersions);
  }
  versionIndex.set(config.id, versions);
}

/**
 * Get a specific workflow by ID.
 * Without a version, returns the latest version.
 * @param {string} id
 * @param {string} [version]
 * @returns {object|undefined}
 */
function get(id, version) {
  if (version) return workflows.get(`${id}@${version}`);
  // Latest version
  const versions = versionIndex.get(id);
  if (!versions || !versions.length) return undefined;
  return workflows.get(`${id}@${versions[versions.length - 1]}`);
}

/**
 * Get all workflows (latest version of each).
 * @returns {object[]}
 */
function getAll() {
  const latest = [];
  for (const [id, versions] of versionIndex) {
    const config = workflows.get(`${id}@${versions[versions.length - 1]}`);
    if (config) latest.push(config);
  }
  return latest;
}

/**
 * Get all versions of a specific workflow.
 * @param {string} id
 * @returns {{ version: string, config: object }[]}
 */
function getVersions(id) {
  const versions = versionIndex.get(id);
  if (!versions) return [];
  return versions.map(v => ({ version: v, config: workflows.get(`${id}@${v}`) }));
}

/**
 * Get all configs including all versions (for router registration).
 * @returns {object[]}
 */
function getAllVersioned() {
  return Array.from(workflows.values());
}

/**
 * Save a workflow config to disk and reload.
 * @param {object} config - Workflow config object
 */
function save(config) {
  if (!config.id) throw new Error('Workflow config must have an id');
  const ver = config.version || '1.0';
  const filePath = path.join(CONFIG_DIR, `${config.id}-v${ver}.json`);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  _index(config);
  logger.info(`Saved workflow: ${config.id}@${ver}`);
  return config;
}

/**
 * Delete a workflow config (specific version or all versions).
 * @param {string} id
 * @param {string} [version] - If omitted, deletes all versions
 */
function remove(id, version) {
  if (version) {
    const filePath = path.join(CONFIG_DIR, `${id}-v${version}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    workflows.delete(`${id}@${version}`);
    const versions = versionIndex.get(id);
    if (versions) {
      const idx = versions.indexOf(version);
      if (idx !== -1) versions.splice(idx, 1);
      if (!versions.length) versionIndex.delete(id);
    }
  } else {
    // Delete all versions
    const versions = versionIndex.get(id) || [];
    for (const v of versions) {
      workflows.delete(`${id}@${v}`);
      // Try both naming conventions
      for (const name of [`${id}-v${v}.json`, `${id}.json`]) {
        const fp = path.join(CONFIG_DIR, name);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    versionIndex.delete(id);
  }
  logger.info(`Deleted workflow: ${id}${version ? '@' + version : ' (all versions)'}`);
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

/** Compare semver-like version strings: "1.0" < "1.1" < "2.0" */
function _compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

module.exports = { loadAll, get, getAll, getVersions, getAllVersioned, save, remove, watch, CONFIG_DIR };
