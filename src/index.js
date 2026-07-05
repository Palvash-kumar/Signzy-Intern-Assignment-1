/**
 * API Orchestration Platform — Main Entry Point
 *
 * A configuration-driven platform that lets users define API endpoints
 * via JSON configs, validate payloads, map fields to downstream vendor APIs,
 * and return standardized responses — without writing business logic.
 */
require('dotenv').config();

const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const { createDynamicRouter } = require('./engine/router');
const { authMiddleware } = require('./middleware/auth');
const { rateLimiter } = require('./middleware/rate-limiter');
const metrics = require('./middleware/metrics');
const { generateSpec } = require('./docs/swagger');
const configLoader = require('./engine/config-loader');
const ai = require('./ai/agent');
const { generateToken } = require('./middleware/auth');
const scheduler = require('./engine/scheduler');
const plugins = require('./engine/plugin-loader');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════
// Bootstrap: Load plugins
// ═══════════════════════════════════════════════════════════════
plugins.loadAll();

// ═══════════════════════════════════════════════════════════════
// Global Middleware
// ═══════════════════════════════════════════════════════════════
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Request logging
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && req.path !== '/metrics' && req.path !== '/health') {
    // Skip logging for static files and meta endpoints
    return next();
  }
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ═══════════════════════════════════════════════════════════════
// Platform API — Management Endpoints
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-orchestrator',
    timestamp: new Date().toISOString(),
    workflows: configLoader.getAll().length,
    plugins: plugins.list().length,
    schedules: scheduler.list().length
  });
});

// Metrics
app.get('/metrics', (req, res) => {
  res.json(metrics.getSummary());
});

// OpenAPI/Swagger spec
app.get('/api-docs', (req, res) => {
  res.json(generateSpec());
});

// ─── Workflow CRUD ──────────────────────────────────────────

// List all workflows
app.get('/api/workflows', (req, res) => {
  const workflows = configLoader.getAll();
  res.json({
    success: true,
    data: workflows.map(w => ({
      id: w.id,
      version: w.version,
      endpoint: w.endpoint,
      stepsCount: w.steps?.length || 0,
      auth: w.auth?.type || 'none'
    }))
  });
});

// Get a specific workflow
app.get('/api/workflows/:id', (req, res) => {
  const version = req.query.version;
  const workflow = configLoader.get(req.params.id, version);
  if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });
  res.json({ success: true, data: workflow });
});

// List all versions of a workflow
app.get('/api/workflows/:id/versions', (req, res) => {
  const versions = configLoader.getVersions(req.params.id);
  if (!versions.length) return res.status(404).json({ success: false, error: 'Workflow not found' });
  res.json({
    success: true,
    data: versions.map(v => ({
      version: v.version,
      endpoint: v.config.endpoint,
      stepsCount: v.config.steps?.length || 0
    }))
  });
});

// Create/update a workflow
app.post('/api/workflows', (req, res) => {
  try {
    const config = req.body;
    if (!config.id || !config.endpoint || !config.steps) {
      return res.status(400).json({ success: false, error: 'Missing required fields: id, endpoint, steps' });
    }
    const saved = configLoader.save(config);
    logger.info(`Workflow saved via API: ${config.id}@${config.version || '1.0'}`);
    res.json({ success: true, data: saved, message: 'Workflow saved. It will be available on next request.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete a workflow
app.delete('/api/workflows/:id', (req, res) => {
  const version = req.query.version;
  const workflow = configLoader.get(req.params.id, version);
  if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });
  configLoader.remove(req.params.id, version);
  res.json({ success: true, message: `Workflow ${req.params.id} deleted${version ? ' (v' + version + ')' : ''}` });
});

// ─── Auth Helpers ──────────────────────────────────────────

// Generate a JWT token (for testing)
app.post('/api/auth/token', (req, res) => {
  const token = generateToken(req.body || {});
  res.json({ success: true, token, expiresIn: '1h' });
});

// ─── Schedule Management ──────────────────────────────────────

// List all active schedules
app.get('/api/schedules', (req, res) => {
  res.json({ success: true, data: scheduler.list() });
});

// Create a schedule
app.post('/api/schedules', (req, res) => {
  try {
    const { id, workflowId, cron, payload } = req.body;
    if (!id || !workflowId || !cron) {
      return res.status(400).json({ success: false, error: 'Missing required fields: id, workflowId, cron' });
    }
    const workflow = configLoader.get(workflowId);
    if (!workflow) {
      return res.status(404).json({ success: false, error: `Workflow "${workflowId}" not found` });
    }
    const schedule = scheduler.start(id, workflowId, cron, payload);
    res.json({ success: true, data: schedule, message: 'Schedule created' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete a schedule
app.delete('/api/schedules/:id', (req, res) => {
  const stopped = scheduler.stop(req.params.id);
  if (!stopped) return res.status(404).json({ success: false, error: 'Schedule not found' });
  res.json({ success: true, message: `Schedule ${req.params.id} stopped` });
});

// ─── Plugin Info ──────────────────────────────────────────

// List loaded plugins
app.get('/api/plugins', (req, res) => {
  res.json({ success: true, data: plugins.list() });
});

// ─── AI Agent Endpoints ──────────────────────────────────────

// Generate workflow from natural language
app.post('/api/ai/generate-workflow', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ success: false, error: 'description is required' });

    logger.info(`AI: Generating workflow from: "${description}"`);
    const config = await ai.generateWorkflow(description);
    res.json({ success: true, data: config });
  } catch (err) {
    logger.error(`AI error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Validate a workflow config
app.post('/api/ai/validate', async (req, res) => {
  try {
    const config = req.body;
    const result = await ai.validateConfig(config);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`AI validation error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Suggest improvements
app.post('/api/ai/suggest', async (req, res) => {
  try {
    const config = req.body;
    const result = await ai.suggestImprovements(config);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`AI suggestion error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate test cases
app.post('/api/ai/generate-tests', async (req, res) => {
  try {
    const config = req.body;
    const result = await ai.generateTests(config);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`AI test gen error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auto-generate field mappings
app.post('/api/ai/generate-mappings', async (req, res) => {
  try {
    const { sourceSchema, targetSchema } = req.body;
    const result = await ai.generateMappings(sourceSchema, targetSchema);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`AI mapping error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// Dynamic Workflow Routes (auth + rate-limit applied)
// ═══════════════════════════════════════════════════════════════
app.use(authMiddleware);
app.use(rateLimiter);
app.use(createDynamicRouter());

// ═══════════════════════════════════════════════════════════════
// Error handler
// ═══════════════════════════════════════════════════════════════
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  // Auto-start scheduled workflows
  scheduler.autoStart();

  logger.info(`🚀 API Orchestration Platform running on http://localhost:${PORT}`);
  logger.info(`📋 Swagger docs: http://localhost:${PORT}/api-docs`);
  logger.info(`📊 Metrics: http://localhost:${PORT}/metrics`);
  logger.info(`🎨 Visual Editor: http://localhost:${PORT}`);
  logger.info(`🤖 AI Agent: POST http://localhost:${PORT}/api/ai/generate-workflow`);
  logger.info(`🔌 Plugins loaded: ${plugins.list().length}`);
  logger.info(`⏰ Schedules active: ${scheduler.list().length}`);
});

module.exports = app;
