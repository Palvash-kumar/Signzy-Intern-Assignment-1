/**
 * Visual Workflow Editor — Frontend Logic
 * SVG icon helper uses sprite refs. Zero emojis.
 */

let workflows = [];
let currentWorkflow = null;

// ── Helpers ────────────────────────────────────────────────
function ic(id, cls = '') { return `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`; }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  return res.json();
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function tryJSON(s) { try { return JSON.parse(s); } catch { return null; } }

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadWorkflows();
  loadStats();
  bindEvents();
});

async function loadWorkflows() {
  const r = await api('/api/workflows');
  workflows = r.data || [];
  renderList();
}

async function loadStats() {
  const r = await api('/metrics');
  document.getElementById('quick-stats').innerHTML =
    `<div class="stat"><div class="stat-val">${workflows.length}</div><div class="stat-lbl">Workflows</div></div>` +
    `<div class="stat"><div class="stat-val">${r.totalRequests || 0}</div><div class="stat-lbl">Requests</div></div>` +
    `<div class="stat"><div class="stat-val">${r.successRate || '—'}</div><div class="stat-lbl">Success</div></div>`;
}

// ── Sidebar ────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('workflow-list');
  if (!workflows.length) { el.innerHTML = '<div style="padding:14px;color:var(--text-tertiary);font-size:12px">No workflows yet.</div>'; return; }
  const mc = { POST: 'post', GET: 'get', PUT: 'put', DELETE: 'del' };
  el.innerHTML = workflows.map(wf => {
    const m = wf.endpoint?.method || 'POST';
    return `<div class="wf-item ${currentWorkflow?.id === wf.id ? 'active' : ''}" data-id="${wf.id}">
      <div class="wf-method wf-method--${mc[m] || 'post'}">${m.slice(0, 3)}</div>
      <div class="wf-meta"><div class="wf-name">${esc(wf.id)}</div><div class="wf-path">${m} ${wf.endpoint?.path || ''}</div></div>
      <button class="ic-btn wf-del" data-del="${wf.id}" title="Delete" aria-label="Delete">${ic('ic-trash')}</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.wf-item').forEach(i => i.addEventListener('click', e => {
    if (e.target.closest('[data-del]')) return;
    selectWF(i.dataset.id);
  }));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${b.dataset.del}"?`)) return;
    await api(`/api/workflows/${b.dataset.del}`, { method: 'DELETE' });
    toast('Deleted', 'success');
    if (currentWorkflow?.id === b.dataset.del) { currentWorkflow = null; showWelcome(); }
    await loadWorkflows();
  }));
}

async function selectWF(id) {
  const r = await api(`/api/workflows/${id}`);
  currentWorkflow = r.data;
  renderList(); showEditor(); renderWF();
}

// ── Views ──────────────────────────────────────────────────
function showWelcome()  { document.getElementById('welcome-state').classList.remove('hidden'); document.getElementById('workflow-canvas').classList.add('hidden'); }
function showEditor()   { document.getElementById('welcome-state').classList.add('hidden'); document.getElementById('workflow-canvas').classList.remove('hidden'); }

function renderWF() {
  if (!currentWorkflow) return;
  const wf = currentWorkflow;
  document.getElementById('workflow-title').value = wf.id;
  document.getElementById('workflow-version').textContent = `v${wf.version || '1.0'}`;
  document.getElementById('workflow-endpoint').textContent = `${wf.endpoint.method} ${wf.endpoint.path}`;
  document.getElementById('endpoint-method').value = wf.endpoint.method;
  document.getElementById('endpoint-path').value = wf.endpoint.path;
  document.getElementById('auth-type').value = wf.auth?.type || 'none';
  document.getElementById('request-schema').value = wf.request?.schema ? JSON.stringify(wf.request.schema, null, 2) : '';
  document.getElementById('response-mapping').value = wf.response?.mapping ? JSON.stringify(wf.response.mapping, null, 2) : '';
  renderSteps(wf.steps);
}

// ── Steps ──────────────────────────────────────────────────
function renderSteps(steps, el) {
  const c = el || document.getElementById('steps-container');
  c.innerHTML = '';
  if (!steps?.length) { c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No steps. Click "Add Step".</div>'; return; }
  steps.forEach((s, i) => {
    if (i > 0) c.insertAdjacentHTML('beforeend', `<div class="step-wire"><span class="wire-line" style="height:6px"></span>${ic('ic-down','wire-chevron')}</div>`);
    c.appendChild(makeStep(s, i));
  });
}

function makeStep(step, idx) {
  const d = document.createElement('div');
  d.className = 'step-node'; d.dataset.index = idx;
  const t = step.type || 'api_call';
  const icons = { api_call: 'ic-link', conditional: 'ic-branch', parallel: 'ic-zap' };
  const tags  = { api_call: 'step-tag--api', conditional: 'step-tag--cond', parallel: 'step-tag--par' };

  let body = '';
  if (t === 'api_call') {
    body = `
      <div class="field-group"><label>Vendor URL</label><input value="${step.vendor?.url || ''}" data-f="vendor.url"></div>
      <div class="field-group"><label>Method</label><select data-f="vendor.method"><option value="POST" ${step.vendor?.method === 'POST' ? 'selected' : ''}>POST</option><option value="GET" ${step.vendor?.method === 'GET' ? 'selected' : ''}>GET</option><option value="PUT" ${step.vendor?.method === 'PUT' ? 'selected' : ''}>PUT</option></select></div>
      <div class="field-group"><label>Request Mapping</label><textarea data-f="requestMapping">${step.requestMapping ? JSON.stringify(step.requestMapping, null, 2) : ''}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div class="field-group"><label>Retries</label><input type="number" value="${step.retries || 0}" data-f="retries" min="0" max="5"></div>
        <div class="field-group"><label>Timeout</label><input type="number" value="${step.timeout || 5000}" data-f="timeout"></div>
        <div class="field-group"><label>Cache TTL</label><input type="number" value="${step.cache?.ttl || 0}" data-f="cache.ttl" min="0"></div>
      </div>`;
  } else if (t === 'conditional') {
    body = `
      <div class="field-group"><label>Condition</label><input value="${step.condition || ''}" data-f="condition" placeholder="$.steps.prev.response.status === 'success'"></div>
      <div class="field-group"><label>On True</label><textarea data-f="onTrue" rows="3">${step.onTrue ? JSON.stringify(step.onTrue, null, 2) : ''}</textarea></div>
      <div class="field-group"><label>On False</label><textarea data-f="onFalse" rows="2">${step.onFalse ? JSON.stringify(step.onFalse, null, 2) : 'null'}</textarea></div>`;
  } else if (t === 'parallel') {
    body = `<div class="par-box">
      <div class="par-label">${ic('ic-zap','ic--xs')} Parallel (${step.steps?.length || 0} concurrent)</div>
      <div class="field-group"><label>Steps (JSON)</label><textarea data-f="steps" rows="8">${step.steps ? JSON.stringify(step.steps, null, 2) : '[]'}</textarea></div>
    </div>`;
  }

  d.innerHTML = `
    <div class="step-head">
      <div class="step-head-l">
        ${ic(icons[t] || 'ic-link', 'ic--sm')}
        <span class="step-tag ${tags[t] || 'step-tag--api'}">${t.replace('_', ' ')}</span>
        <input class="step-id" value="${step.id}" data-f="id" aria-label="Step ID">
      </div>
      <div class="step-acts">
        <button class="ic-btn" data-up="${idx}" title="Up">${ic('ic-up')}</button>
        <button class="ic-btn" data-dn="${idx}" title="Down">${ic('ic-down')}</button>
        <button class="ic-btn" data-rm="${idx}" title="Remove" style="color:var(--red)">${ic('ic-x')}</button>
      </div>
    </div>
    <div class="step-body">${body}</div>`;

  d.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => setField(idx, inp.dataset.f, inp.value)));
  d.querySelector(`[data-up="${idx}"]`)?.addEventListener('click', () => moveStep(idx, -1));
  d.querySelector(`[data-dn="${idx}"]`)?.addEventListener('click', () => moveStep(idx, 1));
  d.querySelector(`[data-rm="${idx}"]`)?.addEventListener('click', () => rmStep(idx));
  return d;
}

function setField(i, f, v) {
  if (!currentWorkflow?.steps[i]) return;
  const s = currentWorkflow.steps[i], p = f.split('.');
  if (p.length === 2) { if (!s[p[0]]) s[p[0]] = {}; s[p[0]][p[1]] = tryJSON(v) ?? v; }
  else s[f] = tryJSON(v) ?? v;
}

function addStep(type = 'api_call') {
  if (!currentWorkflow) return;
  if (!currentWorkflow.steps) currentWorkflow.steps = [];
  const id = `step_${currentWorkflow.steps.length + 1}`;
  const s = { id, type };
  if (type === 'api_call') { s.vendor = { url: '{{MOCK_SERVER}}/', method: 'POST' }; s.requestMapping = {}; s.retries = 1; s.timeout = 5000; }
  else if (type === 'conditional') { s.condition = ''; s.onTrue = null; s.onFalse = null; }
  else if (type === 'parallel') { s.steps = []; }
  currentWorkflow.steps.push(s);
  renderSteps(currentWorkflow.steps);
}
function rmStep(i)   { if (!currentWorkflow?.steps) return; currentWorkflow.steps.splice(i, 1); renderSteps(currentWorkflow.steps); }
function moveStep(i, d) {
  if (!currentWorkflow?.steps) return;
  const n = i + d; if (n < 0 || n >= currentWorkflow.steps.length) return;
  const a = currentWorkflow.steps; [a[i], a[n]] = [a[n], a[i]]; renderSteps(a);
}

// ── Build / Save ───────────────────────────────────────────
function build() {
  const c = {
    id: document.getElementById('workflow-title').value || 'untitled',
    version: currentWorkflow?.version || '1.0',
    endpoint: { method: document.getElementById('endpoint-method').value, path: document.getElementById('endpoint-path').value || '/untitled' },
    auth: { type: document.getElementById('auth-type').value },
    request: {}, steps: currentWorkflow?.steps || [], response: {}
  };
  const s = document.getElementById('request-schema').value.trim();
  if (s) try { c.request.schema = JSON.parse(s); } catch { /* skip */ }
  const r = document.getElementById('response-mapping').value.trim();
  if (r) try { c.response.mapping = JSON.parse(r); } catch { /* skip */ }
  if (c.auth.type === 'none') delete c.auth;
  return c;
}

async function save() {
  const cfg = build();
  const r = await api('/api/workflows', { method: 'POST', body: cfg });
  if (r.success) { toast('Deployed', 'success'); currentWorkflow = cfg; await loadWorkflows(); renderList(); }
  else toast(`Failed: ${r.error}`, 'error');
}

function newWF() {
  currentWorkflow = {
    id: 'new-workflow', version: '1.0',
    endpoint: { method: 'POST', path: '/new-endpoint' },
    auth: { type: 'api_key' },
    request: { schema: { type: 'object', properties: {}, required: [] } },
    steps: [], response: { mapping: {} }
  };
  renderList(); showEditor(); renderWF();
}

// ── Modals ─────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showJSON() { document.getElementById('json-viewer').textContent = JSON.stringify(currentWorkflow ? build() : {}, null, 2); openModal('json-modal'); }

function showTest() {
  if (!currentWorkflow) return;
  const wf = currentWorkflow, h = {};
  if (wf.auth?.type === 'api_key') h['X-API-Key'] = 'test-api-key-12345';
  if (wf.auth?.type === 'jwt') h['Authorization'] = 'Bearer <token>';
  document.getElementById('test-headers').value = JSON.stringify(h, null, 2);
  const b = {};
  if (wf.request?.schema?.properties) for (const [k, p] of Object.entries(wf.request.schema.properties)) {
    if (p.type === 'string') b[k] = p.enum?.[0] || 'test';
    else if (p.type === 'number') b[k] = 0;
    else if (p.type === 'boolean') b[k] = true;
  }
  document.getElementById('test-body').value = JSON.stringify(b, null, 2);
  document.getElementById('test-response').textContent = 'Click "Send Request" to test';
  openModal('test-modal');
}

async function runTest() {
  const wf = build();
  let headers, body;
  try { headers = JSON.parse(document.getElementById('test-headers').value); } catch { headers = {}; }
  try { body = JSON.parse(document.getElementById('test-body').value); } catch { toast('Invalid JSON body', 'error'); return; }
  const el = document.getElementById('test-response');
  el.textContent = 'Sending…';
  try {
    const res = await fetch(wf.endpoint.path, { method: wf.endpoint.method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const data = await res.json();
    el.textContent = `HTTP ${res.status}\n\n${JSON.stringify(data, null, 2)}`;
  } catch (err) { el.textContent = `Error: ${err.message}`; }
}

// ── AI ─────────────────────────────────────────────────────
async function aiGen() {
  const input = document.getElementById('ai-input').value.trim();
  if (!input) return;
  const chat = document.getElementById('ai-chat');
  chat.insertAdjacentHTML('beforeend', `<div class="chat-msg chat-user"><p>${esc(input)}</p></div>`);
  chat.insertAdjacentHTML('beforeend', '<div class="chat-msg chat-loading" id="ai-ld"><p>Generating</p></div>');
  chat.scrollTop = chat.scrollHeight;
  document.getElementById('ai-input').value = '';
  try {
    const r = await api('/api/ai/generate-workflow', { method: 'POST', body: { description: input } });
    document.getElementById('ai-ld')?.remove();
    if (r.success && r.data) {
      const cfg = r.data;
      chat.insertAdjacentHTML('beforeend', `<div class="chat-msg chat-bot"><p><strong>${esc(cfg.id)}</strong> — ${cfg.endpoint.method} ${cfg.endpoint.path} (${cfg.steps?.length || 0} steps)</p>
        <div style="display:flex;gap:8px;margin-top:8px"><button class="btn-pill btn-pill--sm" id="ai-use">Use</button><button class="btn-pill-ghost btn-pill--sm" style="padding:5px 14px;font-size:12px" id="ai-dep">Deploy</button></div></div>`);
      document.getElementById('ai-use').onclick = () => { currentWorkflow = cfg; closeModal('ai-modal'); showEditor(); renderWF(); renderList(); toast('Loaded', 'info'); };
      document.getElementById('ai-dep').onclick = async () => { currentWorkflow = cfg; await save(); closeModal('ai-modal'); showEditor(); renderWF(); };
    } else chat.insertAdjacentHTML('beforeend', `<div class="chat-msg chat-bot"><p>${r.error || 'Failed'}</p></div>`);
  } catch (err) { document.getElementById('ai-ld')?.remove(); chat.insertAdjacentHTML('beforeend', `<div class="chat-msg chat-bot"><p>Error: ${esc(err.message)}</p></div>`); }
  chat.scrollTop = chat.scrollHeight;
}

async function aiAction(endpoint, label) {
  if (!currentWorkflow) return;
  toast(`${label}…`, 'info');
  try {
    const r = await api(`/api/ai/${endpoint}`, { method: 'POST', body: build() });
    if (r.success) showPanel(label, `<pre>${JSON.stringify(r.data, null, 2)}</pre>`);
    else toast(`Error: ${r.error}`, 'error');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Panel ──────────────────────────────────────────────────
function showPanel(title, html) {
  document.getElementById('panel-title').textContent = title;
  document.getElementById('panel-content').innerHTML = html;
  document.getElementById('right-panel').classList.remove('hidden');
}

// ── Toast ──────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Events ─────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-new-workflow').addEventListener('click', newWF);
  document.getElementById('btn-metrics').addEventListener('click', async () => { const r = await api('/metrics'); showPanel('Metrics', `<pre>${JSON.stringify(r, null, 2)}</pre>`); });
  document.getElementById('btn-docs').addEventListener('click', async () => { const r = await api('/api-docs'); showPanel('API Docs', `<pre>${JSON.stringify(r, null, 2)}</pre>`); });

  document.getElementById('btn-welcome-new').addEventListener('click', newWF);
  document.getElementById('btn-welcome-ai').addEventListener('click', () => openModal('ai-modal'));
  document.getElementById('btn-refresh').addEventListener('click', loadWorkflows);
  document.getElementById('ai-chat-trigger').addEventListener('click', () => openModal('ai-modal'));

  document.getElementById('btn-save').addEventListener('click', save);
  document.getElementById('btn-view-json').addEventListener('click', showJSON);
  document.getElementById('btn-test').addEventListener('click', showTest);
  document.getElementById('btn-ai-validate').addEventListener('click', () => aiAction('validate', 'Validation'));
  document.getElementById('btn-ai-improve').addEventListener('click', () => aiAction('suggest', 'Suggestions'));
  document.getElementById('btn-ai-tests').addEventListener('click', () => aiAction('generate-tests', 'Tests'));

  document.getElementById('btn-add-step').addEventListener('click', () => {
    const t = prompt('Step type: api_call, conditional, or parallel', 'api_call');
    if (t && ['api_call', 'conditional', 'parallel'].includes(t)) addStep(t);
  });

  document.getElementById('ai-modal-close').addEventListener('click', () => closeModal('ai-modal'));
  document.getElementById('json-modal-close').addEventListener('click', () => closeModal('json-modal'));
  document.getElementById('test-modal-close').addEventListener('click', () => closeModal('test-modal'));
  document.getElementById('btn-close-panel').addEventListener('click', () => document.getElementById('right-panel').classList.add('hidden'));

  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.add('hidden'); }));

  document.getElementById('btn-ai-generate').addEventListener('click', aiGen);
  document.getElementById('ai-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiGen(); } });
  document.getElementById('btn-run-test').addEventListener('click', runTest);
  document.getElementById('btn-copy-json').addEventListener('click', () => { navigator.clipboard.writeText(document.getElementById('json-viewer').textContent); toast('Copied', 'success'); });
}
