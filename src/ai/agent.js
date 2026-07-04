/**
 * Agentic AI — uses Google Gemini to generate, validate, and improve workflow configs.
 * Capabilities:
 *   1. Natural language → workflow config
 *   2. Auto-generate field mappings
 *   3. Validate configurations
 *   4. Recommend improvements
 *   5. Generate test cases
 */
const logger = require('../utils/logger');
const configLoader = require('../engine/config-loader');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini';

/**
 * Call the configured LLM API (Gemini, OpenAI, or Groq) with a prompt.
 * @param {string} prompt
 * @returns {Promise<string>} Generated text
 */
async function callGemini(prompt) {
  if (LLM_PROVIDER === 'gemini') {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured. Set it in .env file.');
    }

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096
        }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsed;
      try { parsed = JSON.parse(errText); } catch {}
      const msg = parsed?.error?.message || errText;
      
      if (response.status === 429) {
        throw new Error(
          `Gemini Quota Exceeded (429). Why: Google restricts new free-tier keys without SMS verification or billing. \n\n` +
          `FIX: Set LLM_PROVIDER=openai or LLM_PROVIDER=groq in your .env file and add your key (e.g. GROQ_API_KEY).`
        );
      }
      throw new Error(`Gemini API error (${response.status}): ${msg}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // OpenAI or Groq (OpenAI-compatible)
  const isGroq = LLM_PROVIDER === 'groq';
  const apiKey = isGroq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
  const model = isGroq 
    ? (process.env.GROQ_MODEL || 'llama-3.3-70b-specdec') 
    : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
  const url = isGroq 
    ? 'https://api.groq.com/openai/v1/chat/completions' 
    : 'https://api.openai.com/v1/chat/completions';

  if (!apiKey) {
    throw new Error(`${LLM_PROVIDER.toUpperCase()}_API_KEY not configured in .env file.`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${LLM_PROVIDER.toUpperCase()} API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Extract JSON from a Gemini response that might be wrapped in markdown code blocks.
 */
function extractJSON(text) {
  // Try to extract from ```json ... ``` blocks
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = match ? match[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}

// ═══════════════════════════════════════════════════════════════
// Capability 1: Natural Language → Workflow Config
// ═══════════════════════════════════════════════════════════════
async function generateWorkflow(description) {
  const existingWorkflows = configLoader.getAll();
  const existingIds = existingWorkflows.map(w => w.id);

  const prompt = `You are an API orchestration expert. Generate a workflow configuration JSON based on this description:

"${description}"

The workflow config must follow this exact schema:
{
  "id": "kebab-case-identifier",
  "version": "1.0",
  "endpoint": { "method": "POST", "path": "/route-path" },
  "auth": { "type": "api_key" },
  "rateLimit": { "windowMs": 60000, "max": 50 },
  "request": {
    "schema": { /* JSON Schema for request validation */ }
  },
  "steps": [
    {
      "id": "step_id",
      "type": "api_call",
      "vendor": {
        "url": "{{MOCK_SERVER}}/vendor-path",
        "method": "POST",
        "headers": {}
      },
      "requestMapping": { "targetField": "$.body.sourceField" },
      "retries": 2,
      "retryDelay": 1000,
      "timeout": 5000
    }
  ],
  "response": {
    "mapping": { "outputField": "$.steps.step_id.response.field" },
    "statusCode": 200
  }
}

Available mock vendor endpoints:
- POST {{MOCK_SERVER}}/vendor-a/pan (PAN verification, expects: {pan}, returns: {is_valid, name, pan_number, category, status})
- POST {{MOCK_SERVER}}/vendor-a/aadhaar (Aadhaar validation, expects: {aadhaar}, returns: {is_valid, name, dob, gender, address, status})
- POST {{MOCK_SERVER}}/vendor-b/gst (GST details, expects: {pan, name}, returns: {gstin, legal_name, trade_name, status, registration_date})
- POST {{MOCK_SERVER}}/vendor-c/ocr (Document OCR, expects: {document_type, document_data}, returns: {extracted_text, confidence, fields, status})
- POST {{MOCK_SERVER}}/vendor-c/fraud-detection (Fraud check, expects: {document_data}, returns: {is_authentic, fraud_score, risk_level, checks, status})
- POST {{MOCK_SERVER}}/vendor-c/face-match (Face match, expects: {selfie_data, document_photo}, returns: {is_match, confidence, liveness_check, status})

Step types available:
- "api_call" — calls a vendor API
- "conditional" — { condition: "$.steps.prev.response.field === 'value'", onTrue: {step}, onFalse: {step} }
- "parallel" — { steps: [{step1}, {step2}] } — runs concurrently

Existing workflow IDs (avoid conflicts): ${JSON.stringify(existingIds)}

Field mapping uses JSONPath-like expressions:
- $.body.fieldName — access request body fields
- $.steps.stepId.response.fieldName — access previous step results

Return ONLY the JSON, no explanation.`;

  const result = await callGemini(prompt);
  return extractJSON(result);
}

// ═══════════════════════════════════════════════════════════════
// Capability 2: Validate Configuration
// ═══════════════════════════════════════════════════════════════
async function validateConfig(config) {
  const prompt = `You are an API orchestration expert. Analyze this workflow configuration for issues:

${JSON.stringify(config, null, 2)}

Check for:
1. Missing required fields (id, endpoint, steps, response)
2. Invalid step references (steps referencing non-existent previous steps)
3. Circular dependencies
4. Missing request mappings
5. Invalid JSONPath expressions
6. Unreachable steps
7. Missing error handling / retries for critical steps
8. Security issues (missing auth, exposed secrets)
9. Performance issues (no timeouts, no caching for slow APIs)

Return a JSON object:
{
  "valid": boolean,
  "issues": [
    { "severity": "error|warning|info", "field": "path.to.field", "message": "description" }
  ],
  "score": number (0-100, overall config quality)
}

Return ONLY the JSON.`;

  const result = await callGemini(prompt);
  return extractJSON(result);
}

// ═══════════════════════════════════════════════════════════════
// Capability 3: Recommend Improvements
// ═══════════════════════════════════════════════════════════════
async function suggestImprovements(config) {
  const prompt = `You are an API orchestration expert. Suggest improvements for this workflow configuration:

${JSON.stringify(config, null, 2)}

Consider:
1. Can any sequential steps be parallelized for better performance?
2. Should caching be added to reduce vendor API calls?
3. Are retry settings appropriate?
4. Would circuit-breaker patterns help?
5. Is the response mapping complete?
6. Should rate limiting be adjusted?
7. Are timeouts reasonable?
8. Should webhooks be added for monitoring?

Return a JSON object:
{
  "suggestions": [
    {
      "priority": "high|medium|low",
      "category": "performance|reliability|security|observability",
      "description": "what to improve",
      "before": "current config snippet (if applicable)",
      "after": "improved config snippet (if applicable)"
    }
  ],
  "improvedConfig": { /* the full improved config if changes were significant */ }
}

Return ONLY the JSON.`;

  const result = await callGemini(prompt);
  return extractJSON(result);
}

// ═══════════════════════════════════════════════════════════════
// Capability 4: Generate Test Cases
// ═══════════════════════════════════════════════════════════════
async function generateTests(config) {
  const prompt = `You are an API testing expert. Generate comprehensive test cases for this API workflow:

${JSON.stringify(config, null, 2)}

Generate test cases covering:
1. Happy path (valid input, expected success)
2. Validation errors (missing fields, wrong types, invalid formats)
3. Edge cases (empty strings, very long values, special characters)
4. Error scenarios (what if a vendor API fails?)

For each test case, provide the curl command.

Return a JSON object:
{
  "testCases": [
    {
      "name": "test name",
      "description": "what this tests",
      "type": "happy_path|validation|edge_case|error",
      "request": {
        "method": "POST",
        "path": "/endpoint",
        "headers": {},
        "body": {}
      },
      "expectedStatus": 200,
      "expectedResponse": { "key": "expected value pattern" },
      "curl": "curl command string"
    }
  ]
}

Return ONLY the JSON.`;

  const result = await callGemini(prompt);
  return extractJSON(result);
}

// ═══════════════════════════════════════════════════════════════
// Capability 5: Auto-generate Field Mappings
// ═══════════════════════════════════════════════════════════════
async function generateMappings(sourceSchema, targetSchema) {
  const prompt = `You are an API integration expert. Generate field mappings between these two schemas.

Source (incoming request):
${JSON.stringify(sourceSchema, null, 2)}

Target (vendor API):
${JSON.stringify(targetSchema, null, 2)}

Generate request and response mappings using JSONPath-like expressions ($.body.fieldName, $.steps.stepId.response.fieldName).

Return a JSON object:
{
  "requestMapping": { "targetField": "$.body.sourceField" },
  "responseMapping": { "outputField": "$.steps.stepId.response.field" }
}

Return ONLY the JSON.`;

  const result = await callGemini(prompt);
  return extractJSON(result);
}

module.exports = {
  generateWorkflow,
  validateConfig,
  suggestImprovements,
  generateTests,
  generateMappings
};
