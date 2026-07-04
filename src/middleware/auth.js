/**
 * Authentication middleware — supports JWT and API Key.
 * Auth type is configurable per workflow via the config's auth.type field.
 */
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const configLoader = require('../engine/config-loader');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const API_KEY = process.env.API_KEY || 'test-api-key-12345';

/**
 * Auth middleware factory. Checks workflow config to determine auth type.
 */
function authMiddleware(req, res, next) {
  // Find the matching workflow for this route
  const workflows = configLoader.getAll();
  const workflow = workflows.find(w => {
    const { method, path: p } = w.endpoint;
    return req.method === method && req.path === p;
  });

  // No workflow found or no auth required — pass through
  const authConfig = workflow?.auth;
  if (!authConfig || authConfig.type === 'none') return next();

  switch (authConfig.type) {
    case 'jwt':
      return verifyJWT(req, res, next);
    case 'api_key':
      return verifyAPIKey(req, res, next);
    default:
      return next();
  }
}

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    logger.warn(`JWT verification failed: ${err.message}`);
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

function verifyAPIKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
  }
  next();
}

/**
 * Utility: Generate a JWT token (for testing/demo).
 */
function generateToken(payload = { sub: 'demo-user', role: 'admin' }, expiresIn = '1h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

module.exports = { authMiddleware, generateToken };
