# Low-Code API Orchestration Platform — API Documentation

This document provides detailed documentation for all API endpoints exposed by the Low-Code API Orchestration Platform. 

---

## Table of Contents
1. [Global Configuration & Auth](#1-global-configuration--auth)
2. [Platform Management APIs](#2-platform-management-apis)
3. [Schedule Management APIs](#3-schedule-management-apis)
4. [Plugin Information APIs](#4-plugin-information-apis)
5. [AI Agent APIs](#5-ai-agent-apis)
6. [Dynamic Workflow APIs (Generated)](#6-dynamic-workflow-apis-generated)
7. [Error Handling & Response Meta](#7-error-handling--response-meta)

---

## 1. Global Configuration & Auth

The platform supports two types of authentication: **API Key** authentication and **JSON Web Token (JWT)** authentication. The authentication mechanism is configured per-workflow in their respective JSON config files.

### 1.1 API Key Authentication
For workflows requiring API Key authentication (`"auth": { "type": "api_key" }`), you must provide the API Key in the request header:
- Header: `X-API-Key` (e.g. `X-API-Key: test-api-key-12345`)

### 1.2 JWT Authentication
For workflows requiring JWT authentication (`"auth": { "type": "jwt" }`), you must provide a bearer token in the authorization header:
- Header: `Authorization` (e.g. `Authorization: Bearer <your_jwt_token>`)
- You can generate a mock JWT token using the `/api/auth/token` endpoint.

---

## 2. Platform Management APIs

These APIs are used to monitor, manage, and inspect the platform's registered workflows and health state.

### 2.1 Health Check
Retrieve the current status of the server and active subsystems.

* **URL**: `/health`
* **Method**: `GET`
* **Auth Required**: No
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/health
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "service": "api-orchestrator",
    "timestamp": "2026-07-05T01:28:51.579Z",
    "workflows": 3,
    "plugins": 2,
    "schedules": 0
  }
  ```

### 2.2 Metrics Endpoint
Inspect system performance metrics, including request volume, success rates, and p50/p95/p99 execution latency.

* **URL**: `/metrics`
* **Method**: `GET`
* **Auth Required**: No
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/metrics
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "totalRequests": 12,
    "successRate": "91.67%",
    "workflows": {
      "verify-pan": {
        "count": 5,
        "successCount": 4,
        "failures": 1,
        "averageLatencyMs": 234.2,
        "p50": 210,
        "p95": 280,
        "p99": 298
      },
      "validate-aadhaar": {
        "count": 4,
        "successCount": 4,
        "failures": 0,
        "averageLatencyMs": 565.0,
        "p50": 560,
        "p95": 578,
        "p99": 585
      }
    }
  }
  ```

### 2.3 OpenAPI Specification (Swagger Spec)
Fetch the auto-generated OpenAPI 3.0 specification representing all active workflows and versioned routes.

* **URL**: `/api-docs`
* **Method**: `GET`
* **Auth Required**: No
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/api-docs
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "openapi": "3.0.3",
    "info": {
      "title": "API Orchestration Platform",
      "description": "Configuration-driven API orchestration — all endpoints are generated from workflow configs. Supports versioned APIs (/v1/, /v2/).",
      "version": "1.0.0"
    },
    "servers": [
      {
        "url": "http://localhost:3000",
        "description": "Local"
      }
    ],
    "paths": {
      "/v1/verify-pan": {
        "post": {
          "summary": "verify-pan (v1.0)",
          "tags": ["verify-pan"]
        }
      }
    }
  }
  ```

### 2.4 List Workflows
Get a metadata list of all registered workflows (representing the latest version of each).

* **URL**: `/api/workflows`
* **Method**: `GET`
* **Auth Required**: No
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/api/workflows
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "verify-pan",
        "version": "1.0",
        "endpoint": {
          "method": "POST",
          "path": "/verify-pan"
        },
        "stepsCount": 1,
        "auth": "api_key"
      },
      {
        "id": "validate-aadhaar",
        "version": "1.0",
        "endpoint": {
          "method": "POST",
          "path": "/validate-aadhaar"
        },
        "stepsCount": 2,
        "auth": "api_key"
      }
    ]
  }
  ```

### 2.5 Get Workflow Config
Retrieve the full JSON configuration for a workflow. By default, this returns the latest version. Pass the optional query parameter `?version=X` to fetch a specific version.

* **URL**: `/api/workflows/:id`
* **Method**: `GET`
* **Query Parameters**:
  * `version` (optional) - e.g. `?version=1.0`
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/api/workflows/verify-pan?version=1.0
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "verify-pan",
      "version": "1.0",
      "endpoint": {
        "method": "POST",
        "path": "/verify-pan"
      },
      "auth": {
        "type": "api_key"
      },
      "steps": [
        {
          "id": "call_vendor_a",
          "type": "api_call",
          "vendor": {
            "url": "{{MOCK_SERVER}}/vendor-a/pan",
            "method": "POST"
          }
        }
      ]
    }
  }
  ```

### 2.6 List Workflow Versions
Retrieve all configured versions of a specific workflow.

* **URL**: `/api/workflows/:id/versions`
* **Method**: `GET`
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/api/workflows/verify-pan/versions
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "version": "1.0",
        "endpoint": {
          "method": "POST",
          "path": "/verify-pan"
        },
        "stepsCount": 1
      }
    ]
  }
  ```

### 2.7 Create/Update Workflow Config
Register a new workflow or create a new version of an existing workflow by uploading its JSON configuration definition.

* **URL**: `/api/workflows`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/workflows \
    -H "Content-Type: application/json" \
    -d '{
      "id": "health-check-workflow",
      "version": "1.0",
      "endpoint": {
        "method": "POST",
        "path": "/check-health"
      },
      "auth": { "type": "api_key" },
      "steps": [
        {
          "id": "ping_mock",
          "type": "api_call",
          "vendor": {
            "url": "{{MOCK_SERVER}}/health",
            "method": "GET"
          }
        }
      ],
      "response": {
        "mapping": {
          "status": "$.steps.ping_mock.response.status"
        }
      }
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "health-check-workflow",
      "version": "1.0"
    },
    "message": "Workflow saved. It will be available on next request."
  }
  ```

### 2.8 Delete Workflow Config
Delete all versions of a workflow, or target a specific version via the `?version=X` query parameter.

* **URL**: `/api/workflows/:id`
* **Method**: `DELETE`
* **Query Parameters**:
  * `version` (optional) - e.g. `?version=1.0`
* **Sample Request**:
  ```bash
  curl -X DELETE http://localhost:3000/api/workflows/health-check-workflow?version=1.0
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Workflow health-check-workflow deleted (v1.0)"
  }
  ```

### 2.9 Generate JWT Token Helper
Generate a signing JWT token for development and testing of workflows that utilize Bearer JWT authentication.

* **URL**: `/api/auth/token`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "sub": "test-user-id",
    "role": "admin"
  }
  ```
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/auth/token \
    -H "Content-Type: application/json" \
    -d '{"sub": "demo-user"}'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "1h"
  }
  ```

---

## 3. Schedule Management APIs

Manage background cron schedules that run workflow executions periodically.

### 3.1 Create/Start Schedule
Start a workflow execution cron job.

* **URL**: `/api/schedules`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  * `id` (string, required) - Unique ID for the scheduler instance.
  * `workflowId` (string, required) - The target workflow ID to run.
  * `cron` (string, required) - Standard 5-field cron statement (e.g. `*/5 * * * *` for every 5 minutes).
  * `payload` (object, optional) - Default body parameter mapping passed to the workflow during cron execution.
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/schedules \
    -H "Content-Type: application/json" \
    -d '{
      "id": "hourly-pan-monitor",
      "workflowId": "verify-pan",
      "cron": "0 * * * *",
      "payload": {
        "pan_number": "ABCDE1234F"
      }
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "hourly-pan-monitor",
      "workflowId": "verify-pan",
      "cron": "0 * * * *",
      "createdAt": "2026-07-05T01:28:52.770Z"
    },
    "message": "Schedule created"
  }
  ```

### 3.2 List Active Schedules
Inspect all active scheduled cron workflows currently running on the server.

* **URL**: `/api/schedules`
* **Method**: `GET`
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/api/schedules
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "hourly-pan-monitor",
        "workflowId": "verify-pan",
        "cron": "0 * * * *",
        "payload": {
          "pan_number": "ABCDE1234F"
        },
        "createdAt": "2026-07-05T01:28:52.770Z"
      }
    ]
  }
  ```

### 3.3 Stop Schedule
Cancel and tear down an active schedule.

* **URL**: `/api/schedules/:id`
* **Method**: `DELETE`
* **Sample Request**:
  ```bash
  curl -X DELETE http://localhost:3000/api/schedules/hourly-pan-monitor
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Schedule hourly-pan-monitor stopped"
  }
  ```

---

## 4. Plugin Information APIs

Check active execution hook plugins loaded into the pipeline.

### 4.1 List Loaded Plugins
Inspect registered hooks across plugins auto-loaded from the `plugins/` directory.

* **URL**: `/api/plugins`
* **Method**: `GET`
* **Sample Request**:
  ```bash
  curl -X GET http://localhost:3000/api/plugins
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "name": "request-logger",
        "version": "1.0",
        "hooks": ["beforeStep", "afterStep", "onError"]
      },
      {
        "name": "field-masker",
        "version": "1.0",
        "hooks": ["beforeResponse"]
      }
    ]
  }
  ```

---

## 5. AI Agent APIs

These endpoints leverage LLMs (Gemini / Groq / OpenAI) to generate configurations, maps, test cases, or inspect workflow security.

### 5.1 Generate Workflow Config
Convert a natural language prompt description of an API workflow pipeline into a structured, validated JSON workflow configuration.

* **URL**: `/api/ai/generate-workflow`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  * `description` (string, required) - Prompt describing the dynamic API steps.
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/ai/generate-workflow \
    -H "Content-Type: application/json" \
    -d '{
      "description": "Create a POST endpoint /check-identity that takes aadhaar_number. It should call Vendor A to validate aadhaar, and if status is success, call Vendor B to get GST details."
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "check-identity",
      "version": "1.0",
      "endpoint": {
        "method": "POST",
        "path": "/check-identity"
      },
      "auth": { "type": "api_key" },
      "steps": [
        {
          "id": "validate_aadhaar",
          "type": "api_call",
          "vendor": {
            "url": "{{MOCK_SERVER}}/vendor-a/aadhaar",
            "method": "POST"
          }
        }
      ]
    }
  }
  ```

### 5.2 Validate Workflow Config
Analyze a workflow config using an AI agent to assign a quality score and flag structural warnings.

* **URL**: `/api/ai/validate`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Request Body**: Workflow JSON configuration.
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/ai/validate \
    -H "Content-Type: application/json" \
    -d '{
      "id": "bad-flow",
      "version": "1.0",
      "endpoint": { "method": "GET", "path": "/bad" },
      "steps": []
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "isValid": false,
      "score": 30,
      "errors": [
        "A workflow must have at least one execution step.",
        "Missing response mapping structure."
      ],
      "warnings": [
        "No authentication defined for route."
      ]
    }
  }
  ```

### 5.3 Recommend Improvements
Generate optimization and reliability suggestions for a workflow configuration.

* **URL**: `/api/ai/suggest`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Request Body**: Workflow JSON configuration.
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/ai/suggest \
    -H "Content-Type: application/json" \
    -d '{
      "id": "verify-pan",
      "steps": [
        {
          "id": "vendor_call",
          "type": "api_call",
          "vendor": { "url": "http://example.com/api", "method": "POST" }
        }
      ]
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "suggestions": [
        {
          "type": "reliability",
          "description": "Add a retry policy to step 'vendor_call' to mitigate transient failures.",
          "priority": "HIGH"
        },
        {
          "type": "performance",
          "description": "Configure an LRU cache block with a TTL of 300s to avoid redundant vendor loads.",
          "priority": "MEDIUM"
        }
      ]
    }
  }
  ```

### 5.4 Generate Test Cases
Generate test payloads, validation scenarios, and ready-to-run curl commands for a workflow configuration.

* **URL**: `/api/ai/generate-tests`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Request Body**: Workflow JSON configuration.
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/ai/generate-tests \
    -H "Content-Type: application/json" \
    -d '{
      "id": "verify-pan",
      "request": {
        "schema": {
          "type": "object",
          "properties": {
            "pan_number": { "type": "string" }
          }
        }
      }
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "testCases": [
        {
          "name": "Successful Verification",
          "payload": {
            "pan_number": "ABCDE1234F"
          },
          "curl": "curl -X POST http://localhost:3000/verify-pan -H \"Content-Type: application/json\" -d '{\"pan_number\":\"ABCDE1234F\"}'"
        }
      ]
    }
  }
  ```

### 5.5 Auto-generate Mappings
Generate JSONPath-like mappings between a client request schema and a target vendor request schema.

* **URL**: `/api/ai/generate-mappings`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  * `sourceSchema` (object, required) - Client input schema definition.
  * `targetSchema` (object, required) - Vendor API target schema definition.
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/api/ai/generate-mappings \
    -H "Content-Type: application/json" \
    -d '{
      "sourceSchema": {
        "type": "object",
        "properties": {
          "user_pan": { "type": "string" }
        }
      },
      "targetSchema": {
        "type": "object",
        "properties": {
          "panNumber": { "type": "string" }
        }
      }
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "mappings": {
        "panNumber": "$.body.user_pan"
      }
    }
  }
  ```

---

## 6. Dynamic Workflow APIs (Generated)

These endpoints are created dynamically based on files in the `configs/` directory.

### 6.1 PAN Verification
A single-step workflow that verifies a PAN number using Vendor A.

* **URL**: `/verify-pan` or `/v1/verify-pan`
* **Method**: `POST`
* **Auth Required**: Yes (API Key: `X-API-Key`)
* **Request Body**:
  ```json
  {
    "pan_number": "ABCDE1234F"
  }
  ```
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/verify-pan \
    -H "Content-Type: application/json" \
    -H "X-API-Key: test-api-key-12345" \
    -d '{"pan_number": "ABCDE1234F"}'
  ```
* **Sample Response (200 OK)**:
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
      "correlationId": "651f4640-c75c-443b-8526-9d332616235b",
      "workflowId": "verify-pan",
      "version": "1.0",
      "duration": "12ms",
      "executionLog": [
        {
          "stepId": "call_vendor_a",
          "type": "api_call",
          "duration": 9,
          "status": "success"
        }
      ]
    }
  }
  ```

### 6.2 Aadhaar Validation (Conditional Flow)
Checks Aadhaar validity using Vendor A. If valid, fetches associated GST details from Vendor B and merges them into the final response payload.

* **URL**: `/validate-aadhaar` or `/v1/validate-aadhaar`
* **Method**: `POST`
* **Auth Required**: Yes (API Key: `X-API-Key`)
* **Request Body**:
  ```json
  {
    "aadhaar_number": "123456789012"
  }
  ```
* **Sample Request**:
  ```bash
  curl -X POST http://localhost:3000/validate-aadhaar \
    -H "Content-Type: application/json" \
    -H "X-API-Key: test-api-key-12345" \
    -d '{"aadhaar_number": "123456789012"}'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "aadhaar_valid": true,
      "aadhaar_number": "123456789012",
      "gst_details": {
        "gstin": "27AAAAA1111A1Z1",
        "trade_name": "Sharma Enterprises",
        "status": "ACTIVE"
      }
    },
    "meta": {
      "correlationId": "df944c83-2968-4fe0-9b98-554b5fbbfb67",
      "workflowId": "validate-aadhaar",
      "version": "1.0",
      "duration": "565ms",
      "executionLog": [
        {
          "stepId": "validate_with_vendor_a",
          "type": "api_call",
          "duration": 306,
          "status": "success"
        },
        {
          "stepId": "fetch_gst_conditional",
          "type": "conditional",
          "duration": 258,
          "status": "success"
        }
      ]
    }
  }
  ```

### 6.3 Document Verification (Parallel Flow)
Runs three verification APIs concurrently (OCR reading, fraud detection, and face matching) and compiles the results.

* **URL**: `/verify-document` or `/v1/verify-document`
* **Method**: `POST`
* **Auth Required**: Yes (JWT Bearer Token: `Authorization: Bearer <token>`)
* **Request Body**:
  ```json
  {
    "document_type": "pan_card",
    "document_data": "base64encodedimage...",
    "selfie_data": "base64encodedselfie..."
  }
  ```
* **Sample Request**:
  ```bash
  # 1. Fetch JWT Token
  TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"sub": "demo-user"}' | jq -r '.token')
  
  # 2. Call dynamic endpoint with JWT Bearer
  curl -X POST http://localhost:3000/verify-document \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "document_type": "pan_card",
      "document_data": "base64data",
      "selfie_data": "base64selfie"
    }'
  ```
* **Sample Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "ocr_result": {
        "pan": "ABCDE1234F",
        "name": "RAJESH SHARMA",
        "dob": "1990-01-01"
      },
      "fraud_check": {
        "risk_score": 0.05,
        "outcome": "PASSED"
      },
      "face_match": {
        "confidence": 0.98,
        "match": true
      }
    },
    "meta": {
      "correlationId": "99324829-f836-4ada-8a86-cf1bc6e8211f",
      "workflowId": "document-verification",
      "version": "1.0",
      "duration": "606ms",
      "executionLog": [
        {
          "stepId": "parallel_verification",
          "type": "parallel",
          "duration": 606,
          "status": "success"
        }
      ]
    }
  }
  ```

---

## 7. Error Handling & Response Meta

All responses (successes and errors) return a consistent structured format containing request metadata.

### 7.1 Standard Error Codes

* **400 Bad Request**: Input validation failed against the JSON Schema defined in the workflow request configuration.
  ```json
  {
    "success": false,
    "error": "Validation failed",
    "details": [
      {
        "property": "instance.pan_number",
        "message": "does not match pattern \"^[A-Z]{5}[0-9]{4}[A-Z]$\""
      }
    ],
    "correlationId": "e2d3c138-0955-46aa-a97f-df6c303f269a"
  }
  ```

* **401 Unauthorized**: Authentication credentials (API Key or Bearer JWT token) are invalid or missing.
  ```json
  {
    "success": false,
    "error": "Unauthorized: API Key is missing or invalid"
  }
  ```

* **429 Too Many Requests**: Request limit rate exceeded for the specific endpoint configuration within the sliding window interval.
  ```json
  {
    "success": false,
    "error": "Too many requests, please try again later."
  }
  ```

* **500 Internal Server Error**: Downstream external vendor failure, connection timeout, or internal orchestration logic exception.
  ```json
  {
    "success": false,
    "error": "Internal orchestration error",
    "correlationId": "dcf3a8be-fa55-430c-ab22-0cc60a9254cc"
  }
  ```

---
> Refer to [README.md](file:///Users/sunny/Clg/Signzy/AvasuPalvashKumar_1/README.md) for deployment instructions, configuration format specifications, and Docker/Kubernetes files.
