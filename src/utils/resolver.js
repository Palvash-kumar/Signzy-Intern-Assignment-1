/**
 * JSONPath-like field resolver.
 * Resolves expressions like "$.body.pan_number" or "$.steps.step1.response.name"
 * against a context object. No external dependency needed — simple recursive descent.
 */

/**
 * Resolve a dot-path expression against a context object.
 * Supports: $.field, $.nested.field, $.array[0].field
 * @param {string} expr - JSONPath-like expression (e.g., "$.body.pan_number")
 * @param {object} context - The data object to resolve against
 * @returns {*} The resolved value, or undefined if path doesn't exist
 */
function resolve(expr, context) {
  if (typeof expr !== 'string') return expr;
  if (!expr.startsWith('$')) return expr; // literal value

  const path = expr.slice(2); // strip "$."
  if (!path) return context;

  return path.split('.').reduce((obj, key) => {
    if (obj == null) return undefined;
    // Handle array index: field[0]
    const match = key.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      const arr = obj[match[1]];
      return Array.isArray(arr) ? arr[parseInt(match[2])] : undefined;
    }
    return obj[key];
  }, context);
}

/**
 * Apply a mapping object: { targetField: "$.sourceExpr" } against context.
 * Returns a new object with resolved values.
 * @param {object} mapping - { outputKey: "$.path.to.value" }
 * @param {object} context - The full execution context
 * @returns {object} Mapped result
 */
function applyMapping(mapping, context) {
  if (!mapping) return {};
  const result = {};
  for (const [key, expr] of Object.entries(mapping)) {
    result[key] = resolve(expr, context);
  }
  return result;
}

/**
 * Evaluate a simple condition expression against context.
 * Supports: ===, !==, >, <, >=, <=, ==
 * Example: "$.steps.step1.response.status === 'success'"
 * @param {string} condition - Condition expression
 * @param {object} context - Execution context
 * @returns {boolean}
 */
function evaluateCondition(condition, context) {
  if (!condition) return true;

  // Find operator
  const operators = ['===', '!==', '>=', '<=', '>', '<', '=='];
  let op, parts;
  for (const o of operators) {
    if (condition.includes(o)) {
      op = o;
      parts = condition.split(o).map(s => s.trim());
      break;
    }
  }

  if (!op || parts.length !== 2) {
    // Truthy check — resolve the expression and check truthiness
    return !!resolve(condition.trim(), context);
  }

  let left = resolve(parts[0], context);
  let right = parts[1];

  // Strip quotes from string literals
  if ((right.startsWith("'") && right.endsWith("'")) ||
      (right.startsWith('"') && right.endsWith('"'))) {
    right = right.slice(1, -1);
  } else if (right === 'true') {
    right = true;
  } else if (right === 'false') {
    right = false;
  } else if (right === 'null') {
    right = null;
  } else if (!isNaN(right)) {
    right = Number(right);
  } else {
    right = resolve(right, context);
  }

  switch (op) {
    case '===': return left === right;
    case '!==': return left !== right;
    case '==':  return left == right;
    case '>':   return left > right;
    case '<':   return left < right;
    case '>=':  return left >= right;
    case '<=':  return left <= right;
    default:    return false;
  }
}

module.exports = { resolve, applyMapping, evaluateCondition };
