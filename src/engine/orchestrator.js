/**
 * Orchestrator Engine — the core of the platform.
 * Executes workflow steps defined in config: sequential, parallel, conditional.
 * Each step can reference prior step outputs. Supports retries, timeouts, caching.
 */
const { mapRequest, mapResponse } = require('./mapper');
const { invoke } = require('./invoker');
const { evaluateCondition, resolve } = require('../utils/resolver');
const cache = require('./cache');
const logger = require('../utils/logger');

/**
 * Execute a complete workflow.
 * @param {object} workflow - The workflow config object
 * @param {object} requestBody - Incoming request body
 * @param {object} requestHeaders - Incoming request headers
 * @param {string} correlationId - UUID for tracing
 * @returns {Promise<{ statusCode: number, body: object, executionLog: object[] }>}
 */
async function execute(workflow, requestBody, requestHeaders, correlationId) {
  // Execution context — steps can reference each other's outputs here
  const context = {
    body: requestBody,
    headers: requestHeaders,
    steps: {},
    env: {
      MOCK_SERVER: process.env.MOCK_SERVER_URL || 'http://localhost:4000'
    }
  };

  const executionLog = [];
  const startTime = Date.now();

  try {
    // Execute each step
    for (const step of workflow.steps) {
      const stepResult = await executeStep(step, context, correlationId, executionLog);
      context.steps[step.id] = stepResult;
    }

    // Map final response
    const responseBody = mapResponse(workflow.response?.mapping, context);
    const statusCode = workflow.response?.statusCode || 200;

    executionLog.push({
      type: 'workflow_complete',
      duration: Date.now() - startTime,
      status: 'success'
    });

    return { statusCode, body: responseBody, executionLog };
  } catch (err) {
    executionLog.push({
      type: 'workflow_error',
      duration: Date.now() - startTime,
      error: err.message
    });

    return {
      statusCode: err.statusCode || 502,
      body: { success: false, error: err.message },
      executionLog
    };
  }
}

/**
 * Execute a single workflow step (recursive for parallel/conditional).
 */
async function executeStep(step, context, correlationId, executionLog) {
  const stepStart = Date.now();

  logger.info(`Executing step: ${step.id} (type: ${step.type || 'api_call'})`, { correlationId });

  try {
    let result;

    switch (step.type) {
      case 'parallel':
        result = await executeParallel(step, context, correlationId, executionLog);
        break;

      case 'conditional':
        result = await executeConditional(step, context, correlationId, executionLog);
        break;

      case 'api_call':
      default:
        result = await executeApiCall(step, context, correlationId);
        break;
    }

    const duration = Date.now() - stepStart;
    executionLog.push({
      stepId: step.id,
      type: step.type || 'api_call',
      duration,
      status: 'success'
    });

    logger.info(`Step ${step.id} completed in ${duration}ms`, { correlationId });
    return result;
  } catch (err) {
    const duration = Date.now() - stepStart;
    executionLog.push({
      stepId: step.id,
      type: step.type || 'api_call',
      duration,
      status: 'error',
      error: err.message
    });
    logger.error(`Step ${step.id} failed: ${err.message}`, { correlationId });
    throw err;
  }
}

/**
 * Execute an API call step with retry logic and caching.
 */
async function executeApiCall(step, context, correlationId) {
  const vendor = step.vendor;

  // Resolve URL template variables (e.g., {{MOCK_SERVER}})
  let url = vendor.url.replace(/\{\{(\w+)\}\}/g, (_, key) => context.env[key] || '');

  // Map request fields
  const mappedBody = mapRequest(step.requestMapping, context);

  // Check cache
  if (step.cache?.ttl) {
    const cached = cache.get(step.id, mappedBody);
    if (cached) {
      logger.info(`Cache hit for step ${step.id}`, { correlationId });
      return { response: cached, fromCache: true };
    }
  }

  // Resolve headers — some might reference context
  const headers = {};
  if (vendor.headers) {
    for (const [key, val] of Object.entries(vendor.headers)) {
      headers[key] = typeof val === 'string' && val.startsWith('$')
        ? resolve(val, context)
        : val;
    }
  }

  // Retry loop
  const maxRetries = step.retries || 0;
  const retryDelay = step.retryDelay || 1000;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.warn(`Retry ${attempt}/${maxRetries} for step ${step.id}`, { correlationId });
        await sleep(retryDelay * attempt); // exponential-ish backoff
      }

      const result = await invoke(
        { url, method: vendor.method || 'POST', headers },
        mappedBody,
        { timeout: step.timeout || 10000, correlationId }
      );

      // Check for HTTP errors
      if (result.status >= 500) {
        throw new Error(`Vendor returned ${result.status}`);
      }

      // Cache successful response
      if (step.cache?.ttl && result.status < 400) {
        cache.set(step.id, mappedBody, result.data, step.cache.ttl);
      }

      return { response: result.data, status: result.status, duration: result.duration };
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) throw err;
    }
  }

  throw lastError;
}

/**
 * Execute parallel steps — all run concurrently via Promise.all.
 */
async function executeParallel(step, context, correlationId, executionLog) {
  const subSteps = step.steps || [];
  logger.info(`Executing ${subSteps.length} parallel steps`, { correlationId });

  const results = await Promise.all(
    subSteps.map(async (subStep) => {
      const result = await executeStep(subStep, context, correlationId, executionLog);
      context.steps[subStep.id] = result; // make available to siblings (race condition is fine for reads)
      return { id: subStep.id, ...result };
    })
  );

  // Aggregate results into a single object
  const aggregated = {};
  for (const r of results) {
    aggregated[r.id] = r;
  }

  return { response: aggregated };
}

/**
 * Execute conditional step — evaluates condition, runs then/else branch.
 */
async function executeConditional(step, context, correlationId, executionLog) {
  const conditionResult = evaluateCondition(step.condition, context);

  logger.info(`Condition "${step.condition}" evaluated to ${conditionResult}`, { correlationId });

  const branch = conditionResult ? step.onTrue : step.onFalse;

  if (!branch) {
    logger.info(`No branch for condition result ${conditionResult}, skipping`, { correlationId });
    return { response: null, conditionResult, skipped: true };
  }

  // Branch can be a step object or array of steps
  if (Array.isArray(branch)) {
    for (const subStep of branch) {
      const result = await executeStep(subStep, context, correlationId, executionLog);
      context.steps[subStep.id] = result;
    }
    return { response: context.steps[branch[branch.length - 1].id]?.response, conditionResult };
  }

  const result = await executeStep(branch, context, correlationId, executionLog);
  context.steps[branch.id] = result;
  return { response: result.response, conditionResult };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { execute };
