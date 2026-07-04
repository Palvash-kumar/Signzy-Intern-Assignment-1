/**
 * Auto-generates OpenAPI/Swagger spec from loaded workflow configs.
 * No manual spec writing — the configs ARE the source of truth.
 */
const configLoader = require('../engine/config-loader');

/**
 * Generate OpenAPI 3.0 spec from all workflow configs.
 * @returns {object} OpenAPI spec object
 */
function generateSpec() {
  const workflows = configLoader.getAll();

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'API Orchestration Platform',
      description: 'Configuration-driven API orchestration — all endpoints are generated from workflow configs.',
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

  for (const wf of workflows) {
    const { method, path: routePath } = wf.endpoint;
    const httpMethod = method.toLowerCase();

    if (!spec.paths[routePath]) spec.paths[routePath] = {};

    const operation = {
      summary: `${wf.id} (v${wf.version || '1.0'})`,
      description: `Workflow: ${wf.id}. Steps: ${(wf.steps || []).map(s => s.id).join(' → ')}`,
      operationId: wf.id,
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

  return spec;
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
