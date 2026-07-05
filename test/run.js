/**
 * Integration test runner — validates the core engine works end-to-end.
 * No test framework needed, just assert and native fetch.
 */
const assert = require('assert');

const PLATFORM = process.env.PLATFORM_URL || 'http://localhost:3000';
const API_KEY = 'test-api-key-12345';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log('\n🧪 Running Integration Tests\n');

  // ── Health ──────────────────────────────────────────
  console.log('Health & Meta:');

  await test('GET /health returns ok', async () => {
    const res = await fetch(`${PLATFORM}/health`);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.ok(data.plugins !== undefined, 'health should report plugin count');
    assert.ok(data.schedules !== undefined, 'health should report schedule count');
  });

  await test('GET /metrics returns stats', async () => {
    const res = await fetch(`${PLATFORM}/metrics`);
    const data = await res.json();
    assert.ok(data.totalRequests !== undefined);
  });

  await test('GET /api-docs returns OpenAPI spec', async () => {
    const res = await fetch(`${PLATFORM}/api-docs`);
    const data = await res.json();
    assert.strictEqual(data.openapi, '3.0.3');
    assert.ok(Object.keys(data.paths).length > 0);
  });

  await test('GET /api/workflows lists workflows', async () => {
    const res = await fetch(`${PLATFORM}/api/workflows`);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.data.length >= 3);
  });

  // ── PAN Verification ──────────────────────────────────
  console.log('\nWorkflow: verify-pan:');

  await test('Valid PAN returns verified', async () => {
    const res = await fetch(`${PLATFORM}/verify-pan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ pan_number: 'ABCDE1234F' })
    });
    const data = await res.json();
    assert.ok(data.success);
    assert.strictEqual(data.data.verified, true);
    assert.ok(data.data.name);
    assert.ok(data.meta.correlationId);
  });

  await test('Invalid PAN format returns validation error', async () => {
    const res = await fetch(`${PLATFORM}/verify-pan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ pan_number: '12345' })
    });
    assert.strictEqual(res.status, 400);
  });

  await test('Missing API key returns 401', async () => {
    const res = await fetch(`${PLATFORM}/verify-pan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pan_number: 'ABCDE1234F' })
    });
    assert.strictEqual(res.status, 401);
  });

  // ── Versioned API ─────────────────────────────────────
  console.log('\nVersioned APIs:');

  await test('Versioned route /v1/verify-pan works', async () => {
    const res = await fetch(`${PLATFORM}/v1/verify-pan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ pan_number: 'ABCDE1234F' })
    });
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.meta.version);
  });

  await test('GET /api/workflows/:id/versions returns versions', async () => {
    const res = await fetch(`${PLATFORM}/api/workflows/verify-pan/versions`);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.data.length >= 1);
    assert.ok(data.data[0].version);
  });

  await test('OpenAPI spec includes versioned paths', async () => {
    const res = await fetch(`${PLATFORM}/api-docs`);
    const data = await res.json();
    const paths = Object.keys(data.paths);
    const hasVersioned = paths.some(p => p.startsWith('/v1/'));
    assert.ok(hasVersioned, 'Should have versioned paths like /v1/...');
  });

  // ── Aadhaar Validation ────────────────────────────────
  console.log('\nWorkflow: validate-aadhaar:');

  await test('Valid Aadhaar returns data with GST', async () => {
    const res = await fetch(`${PLATFORM}/validate-aadhaar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ aadhaar_number: '123456789012' })
    });
    const data = await res.json();
    assert.ok(data.success);
    assert.strictEqual(data.data.aadhaar_valid, true);
    assert.ok(data.data.gst_details); // conditional step should execute
  });

  // ── Document Verification ─────────────────────────────
  console.log('\nWorkflow: document-verification:');

  await test('Document verification needs JWT', async () => {
    const res = await fetch(`${PLATFORM}/verify-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type: 'pan_card', document_data: 'base64...' })
    });
    assert.strictEqual(res.status, 401);
  });

  await test('Document verification with JWT works', async () => {
    // Get a token first
    const tokenRes = await fetch(`${PLATFORM}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub: 'test-user' })
    });
    const { token } = await tokenRes.json();

    const res = await fetch(`${PLATFORM}/verify-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ document_type: 'pan_card', document_data: 'base64data', selfie_data: 'base64selfie' })
    });
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.data.ocr_result);
    assert.ok(data.data.fraud_check);
    assert.ok(data.data.face_match);
  });

  // ── Workflow CRUD ─────────────────────────────────────
  console.log('\nWorkflow CRUD:');

  await test('Create a new workflow via API', async () => {
    const res = await fetch(`${PLATFORM}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-workflow',
        version: '1.0',
        endpoint: { method: 'POST', path: '/test-endpoint' },
        steps: [{ id: 'step1', type: 'api_call', vendor: { url: '{{MOCK_SERVER}}/health', method: 'GET' } }],
        response: { mapping: {} }
      })
    });
    const data = await res.json();
    assert.ok(data.success);
  });

  await test('Delete the test workflow', async () => {
    const res = await fetch(`${PLATFORM}/api/workflows/test-workflow`, { method: 'DELETE' });
    const data = await res.json();
    assert.ok(data.success);
  });

  // ── Schedules ─────────────────────────────────────────
  console.log('\nScheduled Execution:');

  await test('GET /api/schedules returns list', async () => {
    const res = await fetch(`${PLATFORM}/api/schedules`);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(Array.isArray(data.data));
  });

  await test('POST /api/schedules creates a schedule', async () => {
    const res = await fetch(`${PLATFORM}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test-schedule',
        workflowId: 'verify-pan',
        cron: '*/5 * * * *',
        payload: { pan_number: 'ABCDE1234F' }
      })
    });
    const data = await res.json();
    assert.ok(data.success);
    assert.strictEqual(data.data.id, 'test-schedule');
  });

  await test('DELETE /api/schedules/:id stops a schedule', async () => {
    const res = await fetch(`${PLATFORM}/api/schedules/test-schedule`, { method: 'DELETE' });
    const data = await res.json();
    assert.ok(data.success);
  });

  await test('POST /api/schedules rejects invalid cron', async () => {
    const res = await fetch(`${PLATFORM}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'bad-schedule',
        workflowId: 'verify-pan',
        cron: 'not a cron'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  // ── Plugins ───────────────────────────────────────────
  console.log('\nPlugin Architecture:');

  await test('GET /api/plugins returns loaded plugins', async () => {
    const res = await fetch(`${PLATFORM}/api/plugins`);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 2, 'Should have at least request-logger and field-masker plugins');
  });

  await test('Plugins have name, version, and hooks', async () => {
    const res = await fetch(`${PLATFORM}/api/plugins`);
    const data = await res.json();
    const logger = data.data.find(p => p.name === 'request-logger');
    assert.ok(logger, 'request-logger plugin should be loaded');
    assert.ok(logger.hooks.length > 0, 'Should have hooks registered');

    const masker = data.data.find(p => p.name === 'field-masker');
    assert.ok(masker, 'field-masker plugin should be loaded');
  });

  // ── Summary ───────────────────────────────────────────
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
