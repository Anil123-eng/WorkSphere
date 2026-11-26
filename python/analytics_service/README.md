

\# WorkSphere Analytics Service



\## Overview

A FastAPI-based analytics service for the WorkSphere project management platform. It reuses the Python processing package from Assessment 05.



\## Features

\- Health check endpoint

\- Productivity analytics based on task activity records

\- Overdue task identification

\- JSON request validation using Pydantic

\- Secure sample-file access restricted to the samples directory

\- Automatic API documentation through Swagger UI

\- Automated API tests



\## Technology

\- Python 3

\- FastAPI

\- Uvicorn

\- Pydantic

\- unittest

\- FastAPI TestClient



\## Run the Service



From the project root:



```bash

python -m uvicorn main:app --app-dir python/analytics\_service --reload --port 8001

```



Open Swagger documentation:



http://127.0.0.1:8001/docs



\## API Endpoints



\### GET /health

Checks service availability.



\### POST /analytics/productivity

Calculates activity totals and completed tasks for each user.



Example request:



```json

{

&#x20; "activities\_file": "activities.jsonl"

}

```



\### POST /analytics/overdue

Returns incomplete tasks whose due dates have passed.



Example request:



```json

{

&#x20; "tasks\_file": "tasks.json",

&#x20; "current\_date": "2026-11-25"

}

```



\## Run Tests



From the project root:



```bash

python -m unittest discover -s python/analytics\_service/tests -v

```



## Security

- **Authentication:** All analytics report endpoints (`POST /analytics/productivity`, `POST /analytics/overdue`) require a valid Bearer JWT access token issued by the Node API (`Authorization: Bearer <token>`). Tokens are verified with the shared `JWT_SECRET` using HS256. Missing or invalid tokens receive HTTP 401.
- **Report data scope:** Analytics records must have an integer `organization_id` equal to the verified Node JWT organization claim; unscoped and cross-organization records are excluded. Bundled records are synthetic and assigned to demo organization `7`, so other organizations receive empty reports unless their own explicitly scoped sample records are supplied. The `/health` endpoint remains unauthenticated for load-balancer health checks.
- **Path safety:** The API only allows filenames from the configured samples directory. Absolute paths and directory traversal attempts are rejected.



\## Related Package

The service uses the reusable processing package located at `python/worksphere\_processor/`.

## Assessment 13 - Versioning, pagination, and rate limits

Routes are available under `/v1` and at their original unversioned paths for backward compatibility. For example, the service health check is available at `/v1/health` and `/health`. OpenAPI is available at `/openapi.json`; interactive documentation is available at `/docs` and `/redoc`.

The productivity and overdue-task report operations accept one-based `page` and `limit` query parameters. Defaults are `page=1` and `limit=20`; `limit` is capped at 100. Their responses include pagination metadata: `page`, `limit`, `total`, `totalPages`, `hasNext`, and `hasPrevious`. Invalid query values return FastAPI's HTTP 422 validation response. Requests beyond the last page return an empty result.

The API enforces a per-client-IP fixed-window limit, configurable with `API_RATE_LIMIT_MAX_REQUESTS` and `API_RATE_LIMIT_WINDOW_SECONDS` (defaults: 100 requests per 900 seconds). Allowed API responses include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `RateLimit-Policy`; over-limit responses return HTTP 429 and `Retry-After`. Limits are held in memory per process and are not shared across replicas. Documentation routes are excluded. The service uses the direct ASGI client address and does not interpret forwarded headers.

The analytics API authenticates all report requests with a JWT and scopes them to the caller's organization. It accepts report requests only for files under the configured samples directory and rejects unsafe paths. See `docs/ASSESSMENT_13.md` for the setup, complete contract details, and validation evidence.



