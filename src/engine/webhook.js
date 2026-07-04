/**
 * Webhook dispatcher — fires HTTP callbacks after workflow execution.
 * Configurable per workflow: { url, events: ["success", "failure"] }
 */
const logger = require('../utils/logger');

/**
 * Fire a webhook if configured for the given event.
 * @param {object} webhookConfig - { url, events, headers }
 * @param {string} event - "success" or "failure"
 * @param {object} payload - Data to send
 * @param {string} correlationId
 */
async function fireWebhook(webhookConfig, event, payload, correlationId) {
  if (!webhookConfig || !webhookConfig.url) return;
  if (webhookConfig.events && !webhookConfig.events.includes(event)) return;

  try {
    logger.info(`Firing webhook: ${event} → ${webhookConfig.url}`, { correlationId });
    await fetch(webhookConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId || '',
        'X-Event': event,
        ...webhookConfig.headers
      },
      body: JSON.stringify({ event, correlationId, timestamp: new Date().toISOString(), data: payload }),
      signal: AbortSignal.timeout(5000) // ponytail: 5s hard timeout, webhooks shouldn't block
    });
  } catch (err) {
    // Fire-and-forget: log but don't fail the request
    logger.warn(`Webhook failed: ${webhookConfig.url} — ${err.message}`, { correlationId });
  }
}

module.exports = { fireWebhook };
