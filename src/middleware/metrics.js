/**
 * Metrics collector — in-memory counters and histograms.
 * Exposes GET /metrics endpoint with per-workflow stats.
 */

const data = {
  totalRequests: 0,
  successCount: 0,
  errorCount: 0,
  workflows: {}, // { workflowId: { count, success, errors, latencies: [] } }
  startedAt: new Date().toISOString()
};

/**
 * Record a request metric.
 * @param {string} workflowId
 * @param {number} durationMs
 * @param {boolean} success
 */
function record(workflowId, durationMs, success) {
  data.totalRequests++;
  if (success) data.successCount++;
  else data.errorCount++;

  if (!data.workflows[workflowId]) {
    data.workflows[workflowId] = { count: 0, success: 0, errors: 0, latencies: [] };
  }

  const wf = data.workflows[workflowId];
  wf.count++;
  if (success) wf.success++;
  else wf.errors++;

  // Keep last 1000 latencies for percentile calc
  wf.latencies.push(durationMs);
  if (wf.latencies.length > 1000) wf.latencies.shift();
}

/**
 * Get metrics summary.
 */
function getSummary() {
  const summary = {
    uptime: data.startedAt,
    totalRequests: data.totalRequests,
    successRate: data.totalRequests ? ((data.successCount / data.totalRequests) * 100).toFixed(1) + '%' : 'N/A',
    errorRate: data.totalRequests ? ((data.errorCount / data.totalRequests) * 100).toFixed(1) + '%' : 'N/A',
    workflows: {}
  };

  for (const [id, wf] of Object.entries(data.workflows)) {
    const sorted = [...wf.latencies].sort((a, b) => a - b);
    summary.workflows[id] = {
      totalRequests: wf.count,
      successCount: wf.success,
      errorCount: wf.errors,
      latency: {
        avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99)
      }
    };
  }

  return summary;
}

function percentile(sorted, pct) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

module.exports = { record, getSummary };
