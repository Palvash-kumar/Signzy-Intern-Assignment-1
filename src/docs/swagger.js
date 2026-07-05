/**
 * Auto-generates OpenAPI/Swagger spec from loaded workflow configs.
 * No manual spec writing — the configs ARE the source of truth.
 * Includes versioned paths (/v1/path, /v2/path).
 */
const configLoader = require('../engine/config-loader');

/**
 * Generate OpenAPI 3.0 spec from all workflow configs.
 * @returns {object} OpenAPI spec object
 */
function generateSpec() {
  const allConfigs = configLoader.getAllVersioned();
  const latestConfigs = configLoader.getAll();

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'API Orchestration Platform',
      description: 'Configuration-driven API orchestration — all endpoints are generated from workflow configs. Supports versioned APIs (/v1/, /v2/).',
      version: '1.0.0'
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 3000}`, description: 'Local' }
    ],
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
      }
    }
  };

  // Register versioned paths for all configs
  for (const wf of allConfigs) {
    const ver = wf.version || '1.0';
    const majorVer = ver.split('.')[0];
    const versionedPath = `/v${majorVer}${wf.endpoint.path}`;
    _addPath(spec, wf, versionedPath, `v${ver}`);
  }

  // Register unversioned paths (latest)
  for (const wf of latestConfigs) {
    _addPath(spec, wf, wf.endpoint.path, 'latest');
  }

  return spec;
}

function _addPath(spec, wf, routePath, versionLabel) {
  const httpMethod = wf.endpoint.method.toLowerCase();

  if (!spec.paths[routePath]) spec.paths[routePath] = {};

  const operation = {
    summary: `${wf.id} (${versionLabel})`,
    description: `Workflow: ${wf.id}. Steps: ${(wf.steps || []).map(s => s.id).join(' → ')}`,
    operationId: `${wf.id}_${versionLabel}`.replace(/\./g, '_'),
    tags: [wf.id],
    responses: {
      200: {
        description: 'Successful orchestration',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: buildResponseSchema(wf.response?.mapping),
                meta: {
                  type: 'object',
                  properties: {
                    correlationId: { type: 'string' },
                    workflowId: { type: 'string' },
                    version: { type: 'string' },
                    duration: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      400: { description: 'Validation error' },
      401: { description: 'Unauthorized' },
      429: { description: 'Rate limit exceeded' },
      502: { description: 'Vendor API error' }
    }
  };

  // Add request body schema if defined
  if (wf.request?.schema) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: wf.request.schema
        }
      }
    };
  }

  // Add security if auth is configured
  if (wf.auth?.type === 'jwt') {
    operation.security = [{ bearerAuth: [] }];
  } else if (wf.auth?.type === 'api_key') {
    operation.security = [{ apiKey: [] }];
  }

  spec.paths[routePath][httpMethod] = operation;
}

function buildResponseSchema(mapping) {
  if (!mapping) return { type: 'object' };
  const properties = {};
  for (const key of Object.keys(mapping)) {
    properties[key] = { type: 'string' }; // ponytail: generic type, can't infer from JSONPath
  }
  return { type: 'object', properties };
}

module.exports = { generateSpec };
