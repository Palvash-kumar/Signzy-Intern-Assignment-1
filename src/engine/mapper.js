/**
 * Field mapper — transforms incoming request fields into vendor API format
 * using the mapping config. Supports JSONPath resolution and basic transforms.
 */
const { resolve, applyMapping } = require('../utils/resolver');

/**
 * Map incoming request fields to vendor API request body.
 * @param {object} requestMapping - { vendorField: "$.body.clientField" } from step config
 * @param {object} context - Execution context (has body, headers, steps, etc.)
 * @returns {object} Mapped request body for the vendor API
 */
function mapRequest(requestMapping, context) {
  return applyMapping(requestMapping, context);
}

/**
 * Map vendor response(s) to the final output format.
 * @param {object} responseMapping - { outputField: "$.steps.stepId.response.field" }
 * @param {object} context - Execution context with all step results
 * @returns {object} Transformed response
 */
function mapResponse(responseMapping, context) {
  return applyMapping(responseMapping, context);
}

module.exports = { mapRequest, mapResponse };
