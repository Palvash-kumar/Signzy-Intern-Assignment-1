/**
 * Request validator using JSON Schema.
 * Validates incoming request body against the schema defined in workflow config.
 */
const { Validator } = require('jsonschema');

const validator = new Validator();

/**
 * Validate a request body against a JSON Schema.
 * @param {object} body - The request body
 * @param {object} schema - JSON Schema object from workflow config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRequest(body, schema) {
  if (!schema) return { valid: true, errors: [] };

  const result = validator.validate(body, schema);
  return {
    valid: result.valid,
    errors: result.errors.map(e => `${e.property}: ${e.message}`)
  };
}

module.exports = { validateRequest };
