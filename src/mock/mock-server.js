/**
 * Mock Vendor APIs — simulates external third-party services.
 * Runs on a separate port so the orchestrator can invoke them like real APIs.
 * Each vendor has realistic mock data with configurable delay.
 */
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.MOCK_SERVER_PORT || 4000;

// ═══════════════════════════════════════════════════════════════
// Vendor A — PAN Verification
// ═══════════════════════════════════════════════════════════════
app.post('/vendor-a/pan', delay(200), (req, res) => {
  const { pan } = req.body;
  const isValid = pan && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

  res.json({
    is_valid: isValid,
    name: isValid ? 'Rajesh Kumar Sharma' : null,
    pan_number: pan,
    category: isValid ? 'Individual' : null,
    status: isValid ? 'ACTIVE' : 'INVALID',
    last_updated: '2024-01-15'
  });
});

// ═══════════════════════════════════════════════════════════════
// Vendor A — Aadhaar Validation
// ═══════════════════════════════════════════════════════════════
app.post('/vendor-a/aadhaar', delay(300), (req, res) => {
  const { aadhaar } = req.body;
  const isValid = aadhaar && /^\d{12}$/.test(aadhaar);

  res.json({
    is_valid: isValid,
    aadhaar_number: aadhaar ? aadhaar.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3') : null,
    name: isValid ? 'Priya Mehta' : null,
    dob: isValid ? '1990-05-15' : null,
    gender: isValid ? 'Female' : null,
    address: isValid ? {
      state: 'Maharashtra',
      district: 'Mumbai',
      pincode: '400001'
    } : null,
    status: isValid ? 'success' : 'failure'
  });
});

// ═══════════════════════════════════════════════════════════════
// Vendor B — GST Details
// ═══════════════════════════════════════════════════════════════
app.post('/vendor-b/gst', delay(250), (req, res) => {
  const { pan, name } = req.body;

  res.json({
    gstin: '27ABCDE1234F1Z5',
    legal_name: name || 'Rajesh Kumar Sharma',
    trade_name: 'Sharma Enterprises',
    status: 'Active',
    registration_date: '2017-07-01',
    business_type: 'Private Limited Company',
    address: {
      state: 'Maharashtra',
      city: 'Mumbai',
      pincode: '400001'
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Vendor C — OCR (Document Text Extraction)
// ═══════════════════════════════════════════════════════════════
app.post('/vendor-c/ocr', delay(500), (req, res) => {
  const { document_type } = req.body;

  res.json({
    extracted_text: 'GOVERNMENT OF INDIA\nPAN CARD\nName: Rajesh Kumar Sharma\nPAN: ABCDE1234F\nDOB: 15/05/1990',
    document_type: document_type || 'pan_card',
    confidence: 0.95,
    fields: {
      name: 'Rajesh Kumar Sharma',
      document_number: 'ABCDE1234F',
      dob: '1990-05-15'
    },
    status: 'success'
  });
});

// ═══════════════════════════════════════════════════════════════
// Vendor C — Fraud Detection
// ═══════════════════════════════════════════════════════════════
app.post('/vendor-c/fraud-detection', delay(400), (req, res) => {
  const { document_data } = req.body;

  res.json({
    is_authentic: true,
    fraud_score: 0.05,
    risk_level: 'LOW',
    checks: {
      tamper_detection: 'PASS',
      font_consistency: 'PASS',
      format_validation: 'PASS',
      digital_signature: 'NOT_APPLICABLE'
    },
    status: 'success'
  });
});

// ═══════════════════════════════════════════════════════════════
// Vendor C — Face Match
// ═══════════════════════════════════════════════════════════════
app.post('/vendor-c/face-match', delay(600), (req, res) => {
  const { selfie_data, document_photo } = req.body;

  res.json({
    is_match: true,
    confidence: 0.92,
    liveness_check: 'PASS',
    face_quality: 'GOOD',
    status: 'success'
  });
});

// ═══════════════════════════════════════════════════════════════
// Health check
// ═══════════════════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-vendor-server', timestamp: new Date().toISOString() });
});

/**
 * Middleware to add configurable delay (simulates network latency).
 */
function delay(ms) {
  return (req, res, next) => setTimeout(next, ms);
}

// Only start if run directly (not imported)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🔧 Mock Vendor Server running on http://localhost:${PORT}`);
    console.log('   Endpoints:');
    console.log('   POST /vendor-a/pan          — PAN verification');
    console.log('   POST /vendor-a/aadhaar      — Aadhaar validation');
    console.log('   POST /vendor-b/gst          — GST details');
    console.log('   POST /vendor-c/ocr          — Document OCR');
    console.log('   POST /vendor-c/fraud-detection — Fraud check');
    console.log('   POST /vendor-c/face-match   — Face matching');
  });
}

module.exports = app;
