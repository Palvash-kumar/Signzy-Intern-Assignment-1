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
