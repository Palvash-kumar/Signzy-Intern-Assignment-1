/**
 * Visual Workflow Editor — Frontend Logic
 * Manages workflow CRUD, step editing, AI integration, testing.
 */

// ═══════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════
let workflows = [];
let currentWorkflow = null;

// ═══════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return res.json();
}

// ═══════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadWorkflows();
  loadStats();
  bindEvents();
});

async function loadWorkflows() {
  const res = await api('/api/workflows');
  workflows = res.data || [];
  renderWorkflowList();
}

async function loadStats() {
  const res = await api('/metrics');
  const el = document.getElementById('quick-stats');
  el.innerHTML = `
    <div class="stat-item"><div class="stat-value">${workflows.length}</div><div class="stat-label">Workflows</div></div>
    <div class="stat-item"><div class="stat-value">${res.totalRequests || 0}</div><div class="stat-label">Total Requests</div></div>
    <div class="stat-item"><div class="stat-value">${res.successRate || 'N/A'}</div><div class="stat-label">Success Rate</div></div>
  `;
}

// ═══════════════════════════════════════════════════════════
// Workflow List (Sidebar)
// ═══════════════════════════════════════════════════════════
function renderWorkflowList() {
  const list = document.getElementById('workflow-list');
  if (!workflows.length) {
    list.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.8rem;">No workflows yet. Create one to get started.</div>';
    return;
  }

  const icons = { POST: '📨', GET: '📥', PUT: '📝', DELETE: '🗑️' };
  const colors = { POST: '#6366f1', GET: '#22c55e', PUT: '#f59e0b', DELETE: '#ef4444' };

  list.innerHTML = workflows.map(wf => `
    <div class="workflow-item ${currentWorkflow?.id === wf.id ? 'active' : ''}" data-id="${wf.id}">
      <div class="wf-icon" style="background:${colors[wf.endpoint.method] || '#6366f1'}20;color:${colors[wf.endpoint.method] || '#6366f1'}">
        ${icons[wf.endpoint.method] || '📨'}
      </div>
      <div class="wf-info">
        <div class="wf-name">${wf.id}</div>
        <div class="wf-endpoint">${wf.endpoint.method} ${wf.endpoint.path}</div>
      </div>
      <button class="btn btn-ghost btn-xs wf-delete" data-delete="${wf.id}" title="Delete">🗑️</button>
    </div>
  `).join('');

  // Click handlers
  list.querySelectorAll('.workflow-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete]')) return;
      selectWorkflow(item.dataset.id);
    });
  });

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete workflow "${btn.dataset.delete}"?`)) return;
      await api(`/api/workflows/${btn.dataset.delete}`, { method: 'DELETE' });
      toast('Workflow deleted', 'success');
      if (currentWorkflow?.id === btn.dataset.delete) {
        currentWorkflow = null;
        showWelcome();
      }
      await loadWorkflows();
    });
  });
}

async function selectWorkflow(id) {
  const res = await api(`/api/workflows/${id}`);
  currentWorkflow = res.data;
  renderWorkflowList();
  showCanvas();
  renderWorkflow();
}

// ═══════════════════════════════════════════════════════════
// Canvas: Render Workflow
// ═══════════════════════════════════════════════════════════
function showWelcome() {
  document.getElementById('welcome-state').classList.remove('hidden');
  document.getElementById('workflow-canvas').classList.add('hidden');
}

function showCanvas() {
  document.getElementById('welcome-state').classList.add('hidden');
  document.getElementById('workflow-canvas').classList.remove('hidden');
}

function renderWorkflow() {
  if (!currentWorkflow) return;

  const wf = currentWorkflow;
  document.getElementById('workflow-title').value = wf.id;
  document.getElementById('workflow-version').textContent = `v${wf.version || '1.0'}`;
  document.getElementById('workflow-endpoint').textContent = `${wf.endpoint.method} ${wf.endpoint.path}`;

  document.getElementById('endpoint-method').value = wf.endpoint.method;
  document.getElementById('endpoint-path').value = wf.endpoint.path;
  document.getElementById('auth-type').value = wf.auth?.type || 'none';

  document.getElementById('request-schema').value = wf.request?.schema
    ? JSON.stringify(wf.request.schema, null, 2) : '';

  document.getElementById('response-mapping').value = wf.response?.mapping
    ? JSON.stringify(wf.response.mapping, null, 2) : '';

  renderSteps(wf.steps);
}

function renderSteps(steps, container) {
  const el = container || document.getElementById('steps-container');
  el.innerHTML = '';

  if (!steps || !steps.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">No steps yet. Click "+ Add Step" to begin.</div>';
    return;
  }

  steps.forEach((step, idx) => {
    if (idx > 0) {
      el.insertAdjacentHTML('beforeend', '<div class="step-connector">↓</div>');
    }
    el.appendChild(createStepNode(step, idx));
  });
}

function createStepNode(step, index) {
  const div = document.createElement('div');
  div.className = 'step-node';
  div.dataset.index = index;

  const typeIcon = { api_call: '🔗', conditional: '🔀', parallel: '⚡' };
  const type = step.type || 'api_call';

  let bodyHTML = '';

  if (type === 'api_call') {
    bodyHTML = `
      <div class="step-field">
        <label>Vendor URL</label>
        <input type="text" value="${step.vendor?.url || ''}" data-field="vendor.url">
      </div>
      <div class="step-field">
        <label>Method</label>
        <select data-field="vendor.method">
          <option value="POST" ${step.vendor?.method === 'POST' ? 'selected' : ''}>POST</option>
          <option value="GET" ${step.vendor?.method === 'GET' ? 'selected' : ''}>GET</option>
          <option value="PUT" ${step.vendor?.method === 'PUT' ? 'selected' : ''}>PUT</option>
        </select>
      </div>
      <div class="step-field">
        <label>Request Mapping</label>
        <textarea data-field="requestMapping">${step.requestMapping ? JSON.stringify(step.requestMapping, null, 2) : ''}</textarea>
      </div>
      <div class="step-field" style="display:flex;gap:8px;">
        <div style="flex:1"><label>Retries</label><input type="number" value="${step.retries || 0}" data-field="retries" min="0" max="5"></div>
        <div style="flex:1"><label>Timeout (ms)</label><input type="number" value="${step.timeout || 5000}" data-field="timeout"></div>
        <div style="flex:1"><label>Cache TTL (s)</label><input type="number" value="${step.cache?.ttl || 0}" data-field="cache.ttl" min="0"></div>
      </div>
    `;
  } else if (type === 'conditional') {
    bodyHTML = `
      <div class="step-field">
        <label>Condition</label>
        <input type="text" value="${step.condition || ''}" data-field="condition" placeholder="$.steps.prev.response.status === 'success'">
      </div>
      <div class="step-field">
        <label>On True (Step JSON)</label>
        <textarea data-field="onTrue" rows="4">${step.onTrue ? JSON.stringify(step.onTrue, null, 2) : ''}</textarea>
      </div>
      <div class="step-field">
        <label>On False (Step JSON)</label>
        <textarea data-field="onFalse" rows="3">${step.onFalse ? JSON.stringify(step.onFalse, null, 2) : 'null'}</textarea>
      </div>
    `;
  } else if (type === 'parallel') {
    bodyHTML = `
      <div class="parallel-container">
        <div class="parallel-label">⚡ Parallel Steps (${step.steps?.length || 0} concurrent)</div>
        <div class="step-field">
          <label>Steps (JSON Array)</label>
          <textarea data-field="steps" rows="8">${step.steps ? JSON.stringify(step.steps, null, 2) : '[]'}</textarea>
        </div>
      </div>
    `;
  }

  div.innerHTML = `
    <div class="step-header">
      <div class="step-header-left">
        <span>${typeIcon[type] || '🔗'}</span>
        <span class="step-type-badge ${type}">${type}</span>
        <input type="text" class="step-id-input" value="${step.id}" data-field="id">
      </div>
      <div class="step-actions">
        <button class="btn btn-ghost btn-xs" data-move-up="${index}" title="Move Up">⬆</button>
        <button class="btn btn-ghost btn-xs" data-move-down="${index}" title="Move Down">⬇</button>
        <button class="btn btn-danger btn-xs" data-remove="${index}" title="Remove">✕</button>
      </div>
    </div>
    <div class="step-body">${bodyHTML}</div>
  `;

  // Event: field changes
  div.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('change', () => updateStepField(index, input.dataset.field, input.value));
  });

  // Event: move/remove
  div.querySelector(`[data-move-up="${index}"]`)?.addEventListener('click', () => moveStep(index, -1));
  div.querySelector(`[data-move-down="${index}"]`)?.addEventListener('click', () => moveStep(index, 1));
  div.querySelector(`[data-remove="${index}"]`)?.addEventListener('click', () => removeStep(index));

  return div;
}

// ═══════════════════════════════════════════════════════════
// Step Operations
// ═══════════════════════════════════════════════════════════
function updateStepField(index, field, value) {
  if (!currentWorkflow?.steps[index]) return;
  const step = currentWorkflow.steps[index];

  // Handle nested fields (e.g., "vendor.url")
  const parts = field.split('.');
  if (parts.length === 2) {
    if (!step[parts[0]]) step[parts[0]] = {};
    step[parts[0]][parts[1]] = tryParseJSON(value) ?? value;
  } else {
    step[field] = tryParseJSON(value) ?? value;
  }
}

function tryParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function addStep(type = 'api_call') {
  if (!currentWorkflow) return;
  if (!currentWorkflow.steps) currentWorkflow.steps = [];

  const id = `step_${currentWorkflow.steps.length + 1}`;
  const step = { id, type };

  if (type === 'api_call') {
    step.vendor = { url: '{{MOCK_SERVER}}/', method: 'POST' };
    step.requestMapping = {};
    step.retries = 1;
    step.timeout = 5000;
  } else if (type === 'conditional') {
    step.condition = '';
    step.onTrue = null;
    step.onFalse = null;
  } else if (type === 'parallel') {
    step.steps = [];
  }

  currentWorkflow.steps.push(step);
  renderSteps(currentWorkflow.steps);
}

function removeStep(index) {
  if (!currentWorkflow?.steps) return;
  currentWorkflow.steps.splice(index, 1);
  renderSteps(currentWorkflow.steps);
}

function moveStep(index, direction) {
  if (!currentWorkflow?.steps) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= currentWorkflow.steps.length) return;
  const steps = currentWorkflow.steps;
  [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
  renderSteps(steps);
}

// ═══════════════════════════════════════════════════════════
// Save & Build Config
// ═══════════════════════════════════════════════════════════
function buildConfig() {
  const config = {
    id: document.getElementById('workflow-title').value || 'untitled',
    version: (currentWorkflow?.version || '1.0'),
    endpoint: {
      method: document.getElementById('endpoint-method').value,
      path: document.getElementById('endpoint-path').value || '/untitled'
    },
    auth: { type: document.getElementById('auth-type').value },
    request: {},
    steps: currentWorkflow?.steps || [],
    response: {}
  };

  const schemaStr = document.getElementById('request-schema').value.trim();
  if (schemaStr) {
    try { config.request.schema = JSON.parse(schemaStr); } catch { /* skip */ }
  }

  const responseStr = document.getElementById('response-mapping').value.trim();
  if (responseStr) {
    try { config.response.mapping = JSON.parse(responseStr); } catch { /* skip */ }
  }

  if (config.auth.type === 'none') delete config.auth;

  return config;
}

async function saveWorkflow() {
  const config = buildConfig();
  const res = await api('/api/workflows', { method: 'POST', body: config });

  if (res.success) {
    toast('Workflow saved & deployed! ✨', 'success');
    currentWorkflow = config;
    await loadWorkflows();
    renderWorkflowList();
  } else {
    toast(`Save failed: ${res.error}`, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// New Workflow
// ═══════════════════════════════════════════════════════════
function newWorkflow() {
  currentWorkflow = {
    id: 'new-workflow',
    version: '1.0',
    endpoint: { method: 'POST', path: '/new-endpoint' },
    auth: { type: 'api_key' },
    request: { schema: { type: 'object', properties: {}, required: [] } },
    steps: [],
    response: { mapping: {} }
  };

  renderWorkflowList();
  showCanvas();
  renderWorkflow();
}

// ═══════════════════════════════════════════════════════════
// Modals
// ═══════════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showJSONModal() {
  const config = currentWorkflow ? buildConfig() : {};
  document.getElementById('json-viewer').textContent = JSON.stringify(config, null, 2);
  openModal('json-modal');
}

function showTestModal() {
  if (!currentWorkflow) return;
  const wf = currentWorkflow;

  // Pre-fill headers based on auth type
  const headers = {};
  if (wf.auth?.type === 'api_key') headers['X-API-Key'] = 'test-api-key-12345';
  if (wf.auth?.type === 'jwt') headers['Authorization'] = 'Bearer <token>';
  document.getElementById('test-headers').value = JSON.stringify(headers, null, 2);

  // Pre-fill body from schema
  const body = {};
  if (wf.request?.schema?.properties) {
    for (const [key, prop] of Object.entries(wf.request.schema.properties)) {
      if (prop.type === 'string') body[key] = prop.enum?.[0] || 'test-value';
      else if (prop.type === 'number') body[key] = 0;
      else if (prop.type === 'boolean') body[key] = true;
    }
  }
  document.getElementById('test-body').value = JSON.stringify(body, null, 2);
  document.getElementById('test-response').textContent = 'Click "Send Request" to test';

  openModal('test-modal');
}

async function runTest() {
  const wf = buildConfig();
  let headers, body;

  try {
    headers = JSON.parse(document.getElementById('test-headers').value);
  } catch { headers = {}; }

  try {
    body = JSON.parse(document.getElementById('test-body').value);
  } catch (e) {
    toast('Invalid JSON in request body', 'error');
    return;
  }

  const responseEl = document.getElementById('test-response');
  responseEl.textContent = '⏳ Sending request...';

  try {
    const res = await fetch(wf.endpoint.path, {
      method: wf.endpoint.method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    responseEl.textContent = `HTTP ${res.status}\n\n${JSON.stringify(data, null, 2)}`;
  } catch (err) {
    responseEl.textContent = `Error: ${err.message}`;
  }
}

// ═══════════════════════════════════════════════════════════
// AI Integration
// ═══════════════════════════════════════════════════════════
async function aiGenerateWorkflow() {
  const input = document.getElementById('ai-input').value.trim();
  if (!input) return;

  const chat = document.getElementById('ai-chat');

  // Show user message
  chat.insertAdjacentHTML('beforeend', `<div class="ai-message ai-user"><p>${escapeHtml(input)}</p></div>`);

  // Show loading
  chat.insertAdjacentHTML('beforeend', '<div class="ai-message ai-loading" id="ai-loading"><p>Generating workflow config</p></div>');
  chat.scrollTop = chat.scrollHeight;

  document.getElementById('ai-input').value = '';

  try {
    const res = await api('/api/ai/generate-workflow', { method: 'POST', body: { description: input } });
    document.getElementById('ai-loading')?.remove();

    if (res.success && res.data) {
      const config = res.data;
      chat.insertAdjacentHTML('beforeend', `
        <div class="ai-message ai-bot">
          <p>✅ Workflow generated: <strong>${config.id}</strong></p>
          <p>${config.endpoint.method} ${config.endpoint.path} — ${config.steps?.length || 0} step(s)</p>
          <button class="btn btn-primary btn-sm" id="btn-ai-use">Use This Workflow</button>
          <button class="btn btn-secondary btn-sm" id="btn-ai-deploy">Save & Deploy</button>
        </div>
      `);

      document.getElementById('btn-ai-use').addEventListener('click', () => {
        currentWorkflow = config;
        closeModal('ai-modal');
        showCanvas();
        renderWorkflow();
        renderWorkflowList();
        toast('Workflow loaded into editor', 'info');
      });

      document.getElementById('btn-ai-deploy').addEventListener('click', async () => {
        currentWorkflow = config;
        await saveWorkflow();
        closeModal('ai-modal');
        showCanvas();
        renderWorkflow();
      });
    } else {
      chat.insertAdjacentHTML('beforeend', `<div class="ai-message ai-bot"><p>❌ ${res.error || 'Failed to generate workflow'}</p></div>`);
    }
  } catch (err) {
    document.getElementById('ai-loading')?.remove();
    chat.insertAdjacentHTML('beforeend', `<div class="ai-message ai-bot"><p>❌ Error: ${err.message}</p></div>`);
  }

  chat.scrollTop = chat.scrollHeight;
}

async function aiValidate() {
  if (!currentWorkflow) return;
  const config = buildConfig();

  toast('🤖 Validating with AI...', 'info');
  try {
    const res = await api('/api/ai/validate', { method: 'POST', body: config });
    if (res.success) {
      showPanel('Validation Results', `<pre>${JSON.stringify(res.data, null, 2)}</pre>`);
    } else {
      toast(`Validation error: ${res.error}`, 'error');
    }
  } catch (err) {
    toast(`AI error: ${err.message}`, 'error');
  }
}

async function aiImprove() {
  if (!currentWorkflow) return;
  const config = buildConfig();

  toast('💡 Getting improvement suggestions...', 'info');
  try {
    const res = await api('/api/ai/suggest', { method: 'POST', body: config });
    if (res.success) {
      showPanel('Improvement Suggestions', `<pre>${JSON.stringify(res.data, null, 2)}</pre>`);
    } else {
      toast(`Suggestion error: ${res.error}`, 'error');
    }
  } catch (err) {
    toast(`AI error: ${err.message}`, 'error');
  }
}

async function aiGenerateTests() {
  if (!currentWorkflow) return;
  const config = buildConfig();

  toast('🧪 Generating test cases...', 'info');
  try {
    const res = await api('/api/ai/generate-tests', { method: 'POST', body: config });
    if (res.success) {
      showPanel('Generated Test Cases', `<pre>${JSON.stringify(res.data, null, 2)}</pre>`);
    } else {
      toast(`Test gen error: ${res.error}`, 'error');
    }
  } catch (err) {
    toast(`AI error: ${err.message}`, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// Right Panel
// ═══════════════════════════════════════════════════════════
function showPanel(title, html) {
  document.getElementById('panel-title').textContent = title;
  document.getElementById('panel-content').innerHTML = html;
  document.getElementById('right-panel').classList.remove('hidden');
}

function hidePanel() {
  document.getElementById('right-panel').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
// Toast Notifications
// ═══════════════════════════════════════════════════════════
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ═══════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// Event Bindings
// ═══════════════════════════════════════════════════════════
function bindEvents() {
  // Navbar
  document.getElementById('btn-new-workflow').addEventListener('click', newWorkflow);
  document.getElementById('btn-metrics').addEventListener('click', async () => {
    const res = await api('/metrics');
    showPanel('Metrics', `<pre>${JSON.stringify(res, null, 2)}</pre>`);
  });
  document.getElementById('btn-docs').addEventListener('click', async () => {
    const res = await api('/api-docs');
    showPanel('OpenAPI Spec', `<pre>${JSON.stringify(res, null, 2)}</pre>`);
  });

  // Welcome
  document.getElementById('btn-welcome-new').addEventListener('click', newWorkflow);
  document.getElementById('btn-welcome-ai').addEventListener('click', () => openModal('ai-modal'));

  // Sidebar
  document.getElementById('btn-refresh').addEventListener('click', loadWorkflows);
  document.getElementById('ai-chat-trigger').addEventListener('click', () => openModal('ai-modal'));

  // Canvas toolbar
  document.getElementById('btn-save').addEventListener('click', saveWorkflow);
  document.getElementById('btn-view-json').addEventListener('click', showJSONModal);
  document.getElementById('btn-test').addEventListener('click', showTestModal);
  document.getElementById('btn-ai-validate').addEventListener('click', aiValidate);
  document.getElementById('btn-ai-improve').addEventListener('click', aiImprove);
  document.getElementById('btn-ai-tests').addEventListener('click', aiGenerateTests);

  // Add step button with type selector
  document.getElementById('btn-add-step').addEventListener('click', () => {
    const type = prompt('Step type: api_call, conditional, or parallel', 'api_call');
    if (type && ['api_call', 'conditional', 'parallel'].includes(type)) {
      addStep(type);
    }
  });

  // Modals
  document.getElementById('ai-modal-close').addEventListener('click', () => closeModal('ai-modal'));
  document.getElementById('json-modal-close').addEventListener('click', () => closeModal('json-modal'));
  document.getElementById('test-modal-close').addEventListener('click', () => closeModal('test-modal'));
  document.getElementById('btn-close-panel').addEventListener('click', hidePanel);

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // AI
  document.getElementById('btn-ai-generate').addEventListener('click', aiGenerateWorkflow);
  document.getElementById('ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiGenerateWorkflow(); }
  });

  // Test
  document.getElementById('btn-run-test').addEventListener('click', runTest);

  // JSON copy
  document.getElementById('btn-copy-json').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('json-viewer').textContent);
    toast('Copied to clipboard!', 'success');
  });
}
