/**
 * Field Masker Plugin — masks sensitive fields (PAN, Aadhaar) in API responses.
 * Applies after step execution to prevent PII leakage in logs/webhooks.
 */
const MASK_PATTERNS = {
  pan_number: (v) => typeof v === 'string' && v.length >= 4 ? '****' + v.slice(-4) : '****',
  aadhaar_number: (v) => typeof v === 'string' && v.length >= 4 ? '****-****-' + v.slice(-4) : '****',
  aadhaar: (v) => typeof v === 'string' && v.length >= 4 ? '****-****-' + v.slice(-4) : '****'
};

function maskFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const masked = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const [key, val] of Object.entries(masked)) {
    if (MASK_PATTERNS[key] && typeof val === 'string') {
      masked[key] = MASK_PATTERNS[key](val);
    } else if (typeof val === 'object' && val !== null) {
      masked[key] = maskFields(val);
    }
  }
  return masked;
}

module.exports = {
  name: 'field-masker',
  version: '1.0',
  hooks: {
    beforeResponse(result, context, correlationId) {
      if (result?.body) {
        result.body = maskFields(result.body);
      }
      return result;
    }
  }
};
