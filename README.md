# Low-Code API Orchestration Platform

![CI](https://github.com/Palvash-kumar/Signzy-Intern-Assignment-1/actions/workflows/ci.yml/badge.svg)
![CD](https://github.com/Palvash-kumar/Signzy-Intern-Assignment-1/actions/workflows/cd.yml/badge.svg)

A **configuration-driven API orchestration platform** that allows users to expose their own REST APIs without writing business logic for each integration. Define an API using JSON configuration, map request and response fields, invoke one or more downstream APIs, transform data, and return standardized responses — all without changing application code.

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────┐     ┌──────────────────┐
│   Client     │────▶│  API Orchestration Platform (Express)        │────▶│  Vendor APIs     │
│              │     │                                              │     │  (Mock/Real)     │
│  POST /verify│     │  ┌─────────────┐  ┌──────────────────────┐  │     └──────────────────┘
│  -pan        │     │  │ Auth        │  │ Rate Limiter         │  │
└─────────────┘     │  │ (JWT/API Key)│  │ (Sliding Window)     │  │
                     │  └──────┬──────┘  └──────────┬───────────┘  │
      ┌──────────┐   │         ▼                    ▼              │
      │ Visual   │   │  ┌─────────────────────────────────────┐   │
      │ Workflow │   │  │        Dynamic Router               │   │
      │ Editor   │◀──│  │  (Config-driven route registration)  │   │
      └──────────┘   │  └──────────────┬──────────────────────┘   │
                     │                 ▼                           │
      ┌──────────┐   │  ┌─────────────────────────────────────┐   │
      │ AI Agent │   │  │     Request Validator (JSON Schema)  │   │
      │ (Gemini) │──▶│  ├─────────────────────────────────────┤   │
      └──────────┘   │  │     Field Mapper (JSONPath)          │   │
                     │  ├─────────────────────────────────────┤   │
                     │  │     Orchestrator Engine              │   │
                     │  │  ┌──────────┬──────────┬──────────┐  │   │
                     │  │  │Sequential│ Parallel │Conditional│  │   │
                     │  │  └──────────┴──────────┴──────────┘  │   │
                     │  ├─────────────────────────────────────┤   │
                     │  │     Response Transformer             │   │
                     │  └─────────────────────────────────────┘   │
                     └──────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+ (uses native `fetch`)

### Installation

```bash
# Clone and install
cd AvasuPalvashKumar_1
npm install

# Configure (optional — defaults work out of the box)
cp .env.example .env  # or just use the provided .env
```

### Running

```bash
# Terminal 1: Start mock vendor APIs
npm run mock

# Terminal 2: Start the platform
npm run dev
```

The platform starts on `http://localhost:3000`:
- **Visual Editor**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api-docs
- **Metrics**: http://localhost:3000/metrics

### Docker

```bash
docker-compose up --build
```

## Sample Requests

### 1. PAN Verification (Single Vendor)

```bash
curl -X POST http://localhost:3000/verify-pan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-api-key-12345" \
  -d '{"pan_number": "ABCDE1234F"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "name": "Rajesh Kumar Sharma",
    "pan_number": "ABCDE1234F",
    "category": "Individual",
    "status": "ACTIVE"
  },
  "meta": {
    "correlationId": "a1b2c3d4-...",
    "workflowId": "verify-pan",
    "version": "1.0",
    "duration": "245ms",
    "executionLog": [
      { "stepId": "call_vendor_a", "type": "api_call", "duration": 210, "status": "success" }
    ]
  }
}
```

### 2. Aadhaar Validation with Conditional GST Fetch

```bash
curl -X POST http://localhost:3000/validate-aadhaar \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-api-key-12345" \
  -d '{"aadhaar_number": "123456789012"}'
```

This workflow:
1. Validates Aadhaar with Vendor A
2. **If successful** → fetches GST details from Vendor B
3. Merges both responses

### 3. Document Verification (Parallel Pipeline)

```bash
# Get a JWT token first
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"sub":"demo"}' | jq -r '.token')

# Call with JWT
curl -X POST http://localhost:3000/verify-document \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"document_type":"pan_card","document_data":"base64...","selfie_data":"base64..."}'
```

This workflow runs **3 APIs in parallel**:
- OCR extraction
- Fraud detection  
- Face matching

### 4. AI-Generated Workflow

```bash
curl -X POST http://localhost:3000/api/ai/generate-workflow \
  -H "Content-Type: application/json" \
  -d '{"description": "Create an API that validates a PAN using Vendor A and, if successful, fetches GST details from Vendor B."}'
```

## Configuration Format

Workflows are JSON files in the `configs/` directory:

```json
{
  "id": "verify-pan",
  "version": "1.0",
  "endpoint": { "method": "POST", "path": "/verify-pan" },
  "auth": { "type": "api_key" },
  "rateLimit": { "windowMs": 60000, "max": 50 },
  "request": {
    "schema": { "type": "object", "properties": {}, "required": [] }
  },
  "steps": [
    {
      "id": "step_id",
      "type": "api_call | conditional | parallel",
      "vendor": { "url": "{{MOCK_SERVER}}/path", "method": "POST" },
      "requestMapping": { "vendorField": "$.body.clientField" },
      "retries": 2,
      "timeout": 5000,
      "cache": { "ttl": 300 }
    }
  ],
  "response": {
    "mapping": { "outputField": "$.steps.step_id.response.field" }
  }
}
```

### Step Types

| Type | Description | Example |
|------|-------------|---------|
| `api_call` | Call a vendor API | PAN verification |
| `conditional` | If/then/else branching | Aadhaar → if valid → GST |
| `parallel` | Run steps concurrently | OCR + Fraud + Face match |

### Field Mapping (JSONPath-like)

- `$.body.field_name` — access request body fields
- `$.steps.step_id.response.field` — access previous step results
- `$.headers.field` — access request headers
- `{{MOCK_SERVER}}` — template variable (replaced from env)

## Features

### Core
- ✅ Dynamic API creation through configuration
- ✅ Request validation (JSON Schema)
- ✅ Request/response field mapping (JSONPath)
- ✅ HTTP API invocation with retries & timeout
- ✅ Multiple API orchestration (sequential, parallel, conditional)
- ✅ Conditional execution (if/then/else)
- ✅ Error handling with structured error responses
- ✅ Retry mechanism with exponential backoff
- ✅ Standardized response format (success, data, meta, correlationId)
- ✅ Execution logging (per-step timing, status)

### Bonus Features
- ✅ **Visual Workflow Editor** — drag-and-drop workflow builder at `/`
- ✅ **Authentication** — JWT and API Key per-route
- ✅ **Rate Limiting** — sliding window, per-route configurable
- ✅ **Versioned APIs** — version field in config
- ✅ **Metrics Endpoint** — `GET /metrics` with p50/p95/p99 latencies
- ✅ **Docker Support** — Dockerfile + docker-compose.yml
- ✅ **Swagger/OpenAPI** — auto-generated from configs at `/api-docs`
- ✅ **Workflow Versioning** — semver in config
- ✅ **Parallel Execution** — `Promise.all` for concurrent vendor calls
- ✅ **Webhook Support** — post-execution callbacks
- ✅ **Caching** — in-memory LRU cache with per-step TTL
- ✅ **Hot Reload** — modify config files, routes update without restart

### Agentic AI (Gemini-powered)
- ✅ **Natural Language → Workflow Config**: Describe what you want, AI generates the JSON
- ✅ **Config Validation**: AI analyzes configs for issues and assigns a quality score
- ✅ **Improvement Suggestions**: AI recommends performance/reliability improvements
- ✅ **Test Case Generation**: AI generates comprehensive test cases with curl commands
- ✅ **Auto Field Mappings**: AI suggests request/response mappings

## API Reference

### Platform Management
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Performance metrics |
| GET | `/api-docs` | OpenAPI/Swagger spec |
| GET | `/api/workflows` | List all workflows |
| GET | `/api/workflows/:id` | Get workflow config |
| POST | `/api/workflows` | Create/update workflow |
| DELETE | `/api/workflows/:id` | Delete workflow |
| POST | `/api/auth/token` | Generate JWT token |

### AI Agent
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/generate-workflow` | Natural language → config |
| POST | `/api/ai/validate` | Validate a config |
| POST | `/api/ai/suggest` | Get improvement suggestions |
| POST | `/api/ai/generate-tests` | Generate test cases |
| POST | `/api/ai/generate-mappings` | Auto field mappings |

### Dynamic Workflow Endpoints
Defined by configs in `configs/` — e.g., `POST /verify-pan`, `POST /validate-aadhaar`, etc.

## Testing

```bash
# Start mock server and platform first, then:
npm test
```

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Node.js 18+ | Async-native, native fetch |
| Framework | Express | Industry standard, minimal |
| Validation | jsonschema | JSON Schema validation |
| Auth | jsonwebtoken | JWT signing/verification |
| Logging | Winston | Structured, levels, formats |
| Config | JSON files | Zero-dependency, versionable |
| Frontend | Vanilla HTML/CSS/JS | No build step, no bloat |
| AI | Gemini / Groq / OpenAI | Multi-provider, switchable via env |
| Container | Docker + Compose | Production-ready |
| CI/CD | GitHub Actions | Lint → Test → Build → Deploy |

## Project Structure

```
├── configs/                    # Workflow configurations (JSON)
│   ├── verify-pan.json
│   ├── validate-aadhaar.json
│   └── document-verification.json
├── public/                     # Visual workflow editor (frontend)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── index.js               # Express app entry point
│   ├── engine/
│   │   ├── orchestrator.js    # Core orchestration engine
│   │   ├── config-loader.js   # Config file loader + hot-reload
│   │   ├── router.js          # Dynamic route registration
│   │   ├── validator.js       # JSON Schema validation
│   │   ├── mapper.js          # Field mapping
│   │   ├── invoker.js         # HTTP client for vendor APIs
│   │   ├── cache.js           # In-memory LRU cache
│   │   └── webhook.js         # Post-execution webhooks
│   ├── middleware/
│   │   ├── auth.js            # JWT + API Key authentication
│   │   ├── rate-limiter.js    # Sliding window rate limiter
│   │   └── metrics.js         # Request metrics collector
│   ├── ai/
│   │   └── agent.js           # Gemini AI integration
│   ├── mock/
│   │   └── mock-server.js     # Mock vendor APIs
│   ├── docs/
│   │   └── swagger.js         # OpenAPI spec generator
│   └── utils/
│       ├── logger.js          # Winston logger
│       └── resolver.js        # JSONPath-like resolver
├── test/
│   └── run.js                 # Integration tests
├── .github/workflows/
│   ├── ci.yml                 # CI: Lint → Test (Node 18/20/22) → Docker Build
│   └── cd.yml                 # CD: Publish to GHCR → Deploy staging/production
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env
```

## CI/CD Pipeline

The project includes a professional GitHub Actions CI/CD pipeline with two workflows:

### CI Pipeline (`.github/workflows/ci.yml`)

Triggers on every push to `main`/`develop` and all pull requests.

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Lint &      │────▶│  Integration Tests   │────▶│  Docker Build    │
│  Validate    │     │  (Node 18, 20, 22)   │     │  Verification    │
│  Configs     │     │  + OpenAPI + Metrics  │     │                  │
└──────────────┘     └──────────────────────┘     └──────────────────┘
```

| Stage | What it does |
|-------|-------------|
| **Lint** | Validates all JSON workflow configs are parseable, checks for debug artifacts |
| **Test** | Matrix tests across Node 18/20/22. Starts mock server + platform, runs full integration suite, verifies OpenAPI spec and metrics endpoint |
| **Docker** | Builds Docker image, spins up a container, validates health check, verifies `docker compose build` |

### CD Pipeline (`.github/workflows/cd.yml`)

Triggers on pushes to `main` (staging) and version tags `v*` (production).

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Build &     │────▶│  Deploy to Staging   │     │  Deploy to       │
│  Push to     │     │  (on main push)      │     │  Production      │
│  GHCR        │     └──────────────────────┘     │  (on v* tag)     │
└──────────────┘                                   └──────────────────┘
```

| Stage | Trigger | What it does |
|-------|---------|-------------|
| **Publish** | `main` push or `v*` tag | Builds Docker image, pushes to GitHub Container Registry with semantic version tags |
| **Staging** | `main` push | Deploys latest image to staging environment |
| **Production** | `v*` tag (e.g. `v1.0.0`) | Deploys tagged image to production environment |

### Creating a Release

```bash
# Tag a version and push
git tag v1.0.0
git push origin v1.0.0
```

This triggers: CI tests → Docker build → Push to GHCR → Production deploy.
