# Assessment 13 - API Documentation

## Published documentation

| Service | Interactive docs | OpenAPI document |
|---|---|---|
| Node.js API | `http://localhost:5000/api/docs/` | `http://localhost:5000/api/openapi.json` |
| FastAPI analytics | `http://127.0.0.1:8001/docs` | `http://127.0.0.1:8001/openapi.json` |
| FastAPI ReDoc | `http://127.0.0.1:8001/redoc` | Same FastAPI OpenAPI document |

The Node contract is maintained in `server/openapi.json` and expanded at runtime to include v1 aliases and the configured rate-limit policy. FastAPI generates its contract from route definitions, Pydantic models, and response metadata. Both schemas include request/response examples, validation and failure responses, pagination, rate limits, and route-version compatibility details.

## Setup

From the repository root, install the Node dependencies and configure a local PostgreSQL database using the project setup instructions. Set `DATABASE_URL` and a development-only `JWT_SECRET` in `.env`, then start the Node API:

```powershell
npm ci
npm run server
```

Start the analytics API in another terminal:

```powershell
python -m uvicorn main:app --app-dir python/analytics_service --reload --port 8001
```

The Node API requires PostgreSQL for database-backed operations. The analytics API reads only files under `python/worksphere_processor/samples/`. Do not use production credentials or real user data for a demonstration.

## Versioning and authentication

- Node v1 endpoints are available under `/api/v1`; the matching `/api` endpoints remain as backward-compatible aliases. For example, `/api/v1/projects` and `/api/projects`.
- FastAPI endpoints are available under `/v1`; original paths such as `/health` and `/analytics/productivity` remain aliases.
- Both published OpenAPI schemas identify contract version `1.0.0`. This is distinct from the route prefixes.
- Protected Node operations use bearer JWT authentication. Register or log in with a test account to obtain an access token. The Resend webhook instead verifies the `svix-id`, `svix-timestamp`, and `svix-signature` headers against the raw request body; it does not use a user bearer token.
- The analytics service currently has no user authentication; it accepts sample-file report requests and restricts file access to its samples directory.

## Pagination

Node `GET /api/projects` (also `/api/v1/projects`) returns only projects belonging to the authenticated organization. FastAPI `POST /analytics/productivity` and `POST /analytics/overdue` (also their `/v1/` aliases) paginate users and overdue tasks respectively.

All applicable operations accept one-based `page` (default `1`) and `limit` (default `20`, maximum `100`). Values must be positive integers. Node rejects invalid values with HTTP `400`; FastAPI query validation returns HTTP `422`. A page beyond the available results succeeds with an empty result collection.

Each paginated response includes:

```json
{
  "page": 1,
  "limit": 20,
  "total": 42,
  "totalPages": 3,
  "hasNext": true,
  "hasPrevious": false
}
```

The metadata is nested under `pagination`. The Node project response uses `data` for its records; FastAPI returns the paginated report fields (`users` or `overdue_tasks`).

## Rate limiting

Both services enforce a per-client-IP fixed-window limit. Defaults are 100 requests per 900 seconds, configurable with `API_RATE_LIMIT_MAX_REQUESTS` and `API_RATE_LIMIT_WINDOW_SECONDS`. Limits and counters are in memory per process, so multiple replicas do not share quotas; use a shared gateway or store if deployment requires a cluster-wide limit.

Allowed API responses include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `RateLimit-Policy`. Requests over the limit receive HTTP `429`, a safe error body, those rate-limit headers, and `Retry-After`. Documentation endpoints are excluded. Node trusts no proxy by default (`TRUST_PROXY_HOPS=0`); set the hop count only for known trusted proxies so the client IP is derived safely. FastAPI uses the direct ASGI client address and does not interpret forwarded headers.

## Contract coverage and error behavior

The Node OpenAPI contract covers health, registration/login/token refresh/logout, organization-scoped project and task operations, task-event SSE, email integration, Resend webhook verification, and attachment upload/download URL endpoints. It documents bearer authentication where required, request constraints, successful response examples, and safe `400`, `401`, `403`, `404`, `409`, `429`, and server/integration failure responses where applicable. Node API errors use `{ "success": false, "message": "..." }`.

The FastAPI contract covers health, productivity reports, and overdue-task reports. Pydantic request/response models document inputs and output shapes. Report operations document `400` for malformed or unsafe report data, `404` for missing sample files, `422` for request validation, and `429` for rate limiting. FastAPI errors use the `{ "detail": ... }` shape.

Webhook signature verification is exercised by `server/tests/webhook.test.ts`; invalid signatures and expired timestamps are rejected. The OpenAPI schema documents the signature headers and webhook error responses. Examples use synthetic values only.

## Tests and validation evidence

Run the relevant suites from the repository root:

```powershell
$env:JWT_SECRET = "test-only-secret"
npm test -- --runInBand
python -m unittest discover -s python/analytics_service/tests -p "test_*.py" -v
```

The Node suite includes database-backed authentication, projects, Assessment 08 integrations, and background-job tests. Run it with the isolated test database configured; do not point it at a production database.

Validation performed for this implementation:

| Command | Result |
|---|---|
| `npx jest src/app/login/login.test.tsx server/tests/apiDocs.test.ts server/tests/rateLimit.test.ts server/tests/webhook.test.ts --runInBand` | Passed: 4 suites, 10 tests |
| `npm test -- --runInBand --verbose` | Passed: 8 suites, 40 tests (user-provided run, 29.471 seconds). |
| `python -m unittest discover -s python/analytics_service/tests -p "test_*.py" -v` | Passed: 11 tests |
| `python -m unittest discover -s python/worksphere_processor/tests -p "test_*.py" -v` with `PYTHONPATH=python/worksphere_processor` | Passed: 6 tests |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npx tsc -p tsconfig.server.json --noEmit` | Passed |

The Node database-backed suite must be rerun in an environment configured with the isolated PostgreSQL test database before claiming complete Node-suite validation.
