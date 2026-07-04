/**
 * Dynamic Router — registers Express routes from workflow configs.
 * Each workflow config becomes a live API endpoint. Supports hot-reload.
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validateRequest } = require('./validator');
const { execute } = require('./orchestrator');
const { fireWebhook } = require('./webhook');
const configLoader = require('./config-loader');
const logger = require('../utils/logger');
const metrics = require('../middleware/metrics');

/**
 * Create and return a router with all workflow endpoints registered.
 * Also sets up hot-reload watching.
 * @returns {express.Router}
 */
function createDynamicRouter() {
  const router = express.Router();

  // Load all workflow configs
  const workflows = configLoader.loadAll();

  // Register each workflow as a route
  for (const [id, workflow] of workflows) {
    registerRoute(router, workflow);
  }

  // Watch for config changes and re-register
  // ponytail: hot-reload recreates the router layer — fine for dev, not a perf concern
  configLoader.watch(() => {
    logger.info('Configs reloaded, routes will use updated configs on next request');
  });

  return router;
}

/**
 * Register a single workflow as an Express route.
 */
function registerRoute(router, workflow) {
  const { method, path: routePath } = workflow.endpoint;
  const httpMethod = method.toLowerCase();

  logger.info(`Registering route: ${method} ${routePath} → workflow "${workflow.id}"`);

  router[httpMethod](routePath, async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();
    const startTime = Date.now();

    logger.info(`Request received: ${method} ${routePath}`, {
      correlationId,
      workflowId: workflow.id
    });

    try {
      // Re-read config in case it was hot-reloaded
      const currentWorkflow = configLoader.get(workflow.id) || workflow;

      // 1. Validate request
      const validation = validateRequest(req.body, currentWorkflow.request?.schema);
      if (!validation.valid) {
        logger.warn('Request validation failed', { correlationId, errors: validation.errors });
        metrics.record(workflow.id, Date.now() - startTime, false);
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validation.errors,
          correlationId
        });
      }

      // 2. Execute workflow
      const result = await execute(currentWorkflow, req.body, req.headers, correlationId);

      // 3. Record metrics
      const duration = Date.now() - startTime;
      const success = result.statusCode < 400;
      metrics.record(workflow.id, duration, success);

      // 4. Fire webhooks (async, non-blocking)
      fireWebhook(
        currentWorkflow.webhook,
        success ? 'success' : 'failure',
        result.body,
        correlationId
      );

      // 5. Return standardized response
      logger.info(`Request completed in ${duration}ms`, {
        correlationId,
        statusCode: result.statusCode
      });

      return res.status(result.statusCode).json({
        success,
        data: result.body,
        meta: {
          correlationId,
          workflowId: workflow.id,
          version: currentWorkflow.version,
          duration: `${duration}ms`,
          executionLog: result.executionLog
        }
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      metrics.record(workflow.id, duration, false);
      logger.error(`Unhandled error: ${err.message}`, { correlationId, stack: err.stack });

      return res.status(500).json({
        success: false,
        error: 'Internal orchestration error',
        correlationId
      });
    }
  });
}

module.exports = { createDynamicRouter };
