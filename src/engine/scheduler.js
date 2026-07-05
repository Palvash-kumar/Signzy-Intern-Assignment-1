/**
 * Scheduler — runs workflows on a cron-like schedule.
 * In-memory, no external dependencies. Parses basic cron expressions
 * and uses setInterval for checking.
 *
 * Supported cron format: "minute hour day-of-month month day-of-week"
 * Each field accepts: *, number, or *\/N (every N)
 */
const logger = require('../utils/logger');
const configLoader = require('./config-loader');
const { execute } = require('./orchestrator');
const { v4: uuidv4 } = require('uuid');

/** @type {Map<string, { timer: NodeJS.Timer, config: object, schedule: object }>} */
const activeSchedules = new Map();

/**
 * Parse a cron field into a matcher function.
 * Supports: "*", "5", or step patterns like every-N
 * @param {string} field - cron field value
 * @param {number} min - minimum value (0 for minute, 1 for month/day)
 * @param {number} max - maximum value
 * @returns {function(number): boolean}
 */
function _parseCronField(field, min, max) {
  if (field === '*') return () => true;

  // */N — every N
  const stepMatch = field.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1]);
    return (val) => val % step === 0;
  }

  // Exact number
  const num = parseInt(field);
  if (!isNaN(num)) return (val) => val === num;

  // Fallback: match everything
  return () => true;
}

/**
 * Parse a 5-field cron expression (e.g. every 5 minutes).
 * @param {string} expr - Cron expression with 5 space-separated fields
 * @returns {function(Date): boolean} - returns true if the date matches
 */
function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${expr}" (need 5 fields)`);

  const [minuteF, hourF, domF, monthF, dowF] = parts;
  const matchers = [
    _parseCronField(minuteF, 0, 59),
    _parseCronField(hourF, 0, 23),
    _parseCronField(domF, 1, 31),
    _parseCronField(monthF, 1, 12),
    _parseCronField(dowF, 0, 6)
  ];

  return (date) => {
    return matchers[0](date.getMinutes()) &&
           matchers[1](date.getHours()) &&
           matchers[2](date.getDate()) &&
           matchers[3](date.getMonth() + 1) &&
           matchers[4](date.getDay());
  };
}

/**
 * Start a scheduled workflow.
 * @param {string} scheduleId - Unique schedule identifier
 * @param {string} workflowId - Workflow to execute
 * @param {string} cron - Cron expression
 * @param {object} [payload={}] - Default request body
 */
function start(scheduleId, workflowId, cron, payload = {}) {
  if (activeSchedules.has(scheduleId)) {
    stop(scheduleId);
  }

  const matcher = parseCron(cron);
  let lastRun = -1;

  // Check every 30 seconds; only fire once per matching minute
  // ponytail: 30s poll is fine for minute-granularity cron, no need for sub-second precision
  const timer = setInterval(async () => {
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    if (currentMinute === lastRun) return;
    if (!matcher(now)) return;

    lastRun = currentMinute;
    const correlationId = uuidv4();

    logger.info(`Scheduler firing: ${scheduleId} → workflow ${workflowId}`, { correlationId });

    try {
      const workflow = configLoader.get(workflowId);
      if (!workflow) {
        logger.error(`Scheduled workflow not found: ${workflowId}`);
        return;
      }
      const result = await execute(workflow, payload, {}, correlationId);
      logger.info(`Scheduled execution completed: ${scheduleId}`, {
        correlationId,
        statusCode: result.statusCode
      });
    } catch (err) {
      logger.error(`Scheduled execution failed: ${scheduleId} — ${err.message}`, { correlationId });
    }
  }, 30000);

  const scheduleConfig = { timer, workflowId, cron, payload, createdAt: new Date().toISOString() };
  activeSchedules.set(scheduleId, scheduleConfig);
  logger.info(`Schedule started: ${scheduleId} (${cron}) → ${workflowId}`);

  return { id: scheduleId, workflowId, cron, createdAt: scheduleConfig.createdAt };
}

/**
 * Stop a scheduled workflow.
 * @param {string} scheduleId
 */
function stop(scheduleId) {
  const schedule = activeSchedules.get(scheduleId);
  if (!schedule) return false;
  clearInterval(schedule.timer);
  activeSchedules.delete(scheduleId);
  logger.info(`Schedule stopped: ${scheduleId}`);
  return true;
}

/**
 * List all active schedules.
 * @returns {object[]}
 */
function list() {
  return Array.from(activeSchedules.entries()).map(([id, s]) => ({
    id,
    workflowId: s.workflowId,
    cron: s.cron,
    payload: s.payload,
    createdAt: s.createdAt
  }));
}

/**
 * Auto-start schedules from workflow configs that have a `schedule` field.
 */
function autoStart() {
  const workflows = configLoader.getAll();
  let count = 0;
  for (const wf of workflows) {
    if (wf.schedule?.cron) {
      start(`auto-${wf.id}`, wf.id, wf.schedule.cron, wf.schedule.payload || {});
      count++;
    }
  }
  if (count > 0) logger.info(`Auto-started ${count} scheduled workflow(s)`);
}

module.exports = { start, stop, list, autoStart, parseCron };
