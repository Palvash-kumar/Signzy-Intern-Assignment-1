/**
 * Request Logger Plugin — logs every step execution with timing.
 * Demonstrates the plugin hook system.
 */
module.exports = {
  name: 'request-logger',
  version: '1.0',
  hooks: {
    beforeStep(step, context, correlationId) {
      console.log(`[request-logger] ▶ Step "${step.id}" starting (type: ${step.type || 'api_call'})`, correlationId ? `[${correlationId}]` : '');
    },

    afterStep(step, result, context, correlationId) {
      const status = result?.status || 'ok';
      const cached = result?.fromCache ? ' (cached)' : '';
      console.log(`[request-logger] ✓ Step "${step.id}" completed${cached} — status: ${status}`, correlationId ? `[${correlationId}]` : '');
    },

    onError(step, error, context, correlationId) {
      console.error(`[request-logger] ✗ Step "${step.id}" FAILED: ${error.message}`, correlationId ? `[${correlationId}]` : '');
    }
  }
};
