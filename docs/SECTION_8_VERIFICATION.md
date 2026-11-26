# Section 8: Cross-Cutting Requirements Verification

This verification covers the existing implementation and the targeted work
completed for Section 8. No database was connected to except the existing local
Compose database and disposable test databases. The local database was not
reset: migrations 001–003 ran transactionally, user/organization/task counts
remained unchanged, and one baseline activity snapshot was added for the
existing task. No existing password or account row was changed. A generated
least-privilege app-role password is stored only in the ignored local `.env`.

During browser verification, an initial synthetic registration attempt was
made while `.env` still pointed the frontend at an off-host API. It timed out
and was cancelled, but whether that endpoint processed it is unknown. The
attempt used only generated synthetic identity data, not existing credentials.
The local API URL was then corrected to `http://localhost:5000`; subsequent
browser verification used the local API. No remote database was queried.

## Security and tenant isolation

- Node authorization remains server-authoritative; the frontend's
  `ProtectedWorkspace` checks are a navigation/UX layer only.
- Analytics report routes verify Node-issued JWTs, require the verified
  `organizationId` claim, and filter each input record to the matching integer
  `organization_id`. Unscoped records are excluded. Bundled analytics fixtures
  use synthetic organization `7`; a different organization receives empty
  reports.
- Compose passes the same required `JWT_SECRET` to the analytics service and
  the Node API.
- Existing sample-path validation, rate limiting, and generic API errors
  remain in place.
- The analytics tenant-isolation regression verifies that a token for another
  organization receives no users or overdue tasks.

## Reliability and data integrity

Task updates require the expected task version. A stale write returns `409`
without overwriting the newer status. Task mutation, before/after activity
snapshot, and idempotent background-job enqueue are transactional. Activity
rows retain their organization relation but are not cascade-deleted with
mutable task rows.

PostgreSQL jobs use stable idempotency/event identifiers and stale processing
jobs can be reclaimed. Redis Pub/Sub remains transient and has no consumer
acknowledgement; replay and deduplication do not provide exactly-once delivery.
See [Section 7 failure drill](./SECTION_7_FAILURE_DRILL.md).

A live browser run used a generated local account against the rebuilt local
frontend and API: registration and login succeeded, a task update returned
`200`, and a separate stale-tab update returned `409`. Reloading the task
displayed the persisted version-6 activity with the before/after statuses
`in_progress` and `completed`. The synthetic test tenant was removed afterward.

## Performance benchmark

The benchmark ran on Windows with CPython 3.14.7, using a temporary 11,949,216
byte JSON array of 100,000 synthetic tasks. Ten percent were tagged to another
organization; due dates and statuses exercised the actual organization filter
and overdue predicate. Page 1 was limited to 100. The baseline loaded the
complete array and materialized overdue results; the streaming path used
`stream_json_array`, `filter_by_organization`, and
`paginate_overdue_tasks`. Both returned identical page records and a count of
34,286.

| Path | Elapsed | Peak Python allocations (`tracemalloc`) |
|---|---:|---:|
| Full JSON load | 0.719 s | 48.48 MiB |
| Streaming page | 0.772 s | 0.50 MiB |

This was one local run, not a statistically repeated benchmark. Streaming
reduced the measured Python allocation peak substantially but was about 7.4%
slower in this run. `tracemalloc` is not process RSS and these numbers should
not be generalized to production workloads.

## Accessibility and responsive checks

The Chromium Playwright checks verify:

- Login and Register links are visible at a 375-pixel viewport and open their
  existing pages.
- Project creation can be completed using Tab and Enter.
- The task demonstration has no horizontal document overflow at 375 pixels.
- Task-history before/after JSON uses a dark explicit foreground on its light
  background; contrast was checked in the live Chromium page after the fix.

These are focused automated checks, not a full WCAG audit or manual assistive
technology review.

## Maintainability and observability

The focused frontend/server TypeScript checks pass. The targeted ESLint checks
for the modified navigation, task UI, E2E, and task-route files pass. The
backend integration tests emitted structured `http_request` entries with
correlation IDs; task/event logs avoid task contents and raw authentication
secrets. Full lint remains blocked only by the preserved untracked backup test
noted below.

## HTTPS and deployment scope

The checked-in Compose file maps frontend, API, and analytics ports to
loopback over HTTP and contains no local TLS terminator or certificate
configuration. HTTPS behavior was not tested in a deployed environment; no
production deployment or paid infrastructure was introduced.

The API and analytics containers were rebuilt and recreated from the current
source. Runtime inspection confirmed frontend/API/analytics bind only to
`127.0.0.1`; the worker has no published host port. PostgreSQL and Redis were
left running and were not recreated. HTTPS remains unverified and intentionally
deferred because this is a local-only stack.

## Commands and verification

The relevant successful commands for the current work were:

```powershell
npm test -- --runInBand src/app/login/login.test.tsx src/app/register/register.test.tsx src/components/ProtectedWorkspace.test.tsx src/components/WorkspaceLayout.test.tsx src/components/TaskConcurrencyDemo.test.tsx
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:5001"
npm run test:e2e -- --project=chromium e2e/navigation.spec.ts e2e/task-demo.spec.ts
npm test -- --runInBand server/tests/auth.test.ts server/tests/task.test.ts server/tests/backgroundJobs.test.ts server/tests/taskEvents.test.ts server/tests/workerResilience.test.ts
Push-Location python/analytics_service
C:/Python314/python.exe -m unittest discover -s tests -p "test_*.py"
Pop-Location
Push-Location python/worksphere_processor
C:/Python314/python.exe -m unittest discover -s tests -p "test_*.py"
Pop-Location
npx tsc --noEmit
npx tsc -p tsconfig.server.json --noEmit
npx eslint src/app/page.tsx src/app/login/page.tsx src/app/register/page.tsx src/app/register/register.test.tsx src/components/TaskConcurrencyDemo.tsx src/components/TaskConcurrencyDemo.test.tsx e2e/navigation.spec.ts e2e/task-demo.spec.ts
npm run build
docker compose config --quiet
docker compose build api worker analytics
docker compose up -d --no-deps --force-recreate api worker analytics
docker compose build analytics
docker compose up -d --no-deps --force-recreate analytics
docker compose build frontend
docker compose up -d --no-deps --force-recreate frontend
```

Observed results:

| Check | Result |
|---|---|
| Focused frontend Jest suites | Passed: 5 suites, 15 tests |
| Chromium navigation and task-demo E2E | Passed: 2 tests |
| Isolated PostgreSQL auth/task/job Jest suites | Passed: 5 suites, 29 tests |
| Analytics Python tests | Passed: 15 tests |
| Processor Python tests | Passed: 10 tests |
| Frontend and server TypeScript checks | Passed |
| Focused ESLint command | Passed |
| Next.js production build | Passed |
| Full `npm run lint` | Failed only on the preserved untracked backup test's three `no-require-imports` errors |
| Versioned local database migrations | Passed: 3 applied; rerun reported 0 applied, 3 already applied |
| App-role privilege check | Passed: `worksphere_app` connected; it is not superuser/CREATEROLE and cannot read `schema_migrations` |
| Local Compose app smoke check | Passed: frontend, API, analytics HTTP 200; API/analytics bound to loopback; worker healthy |
| Live local browser task flow | Passed: registration/login, task update HTTP 200, stale update HTTP 409, persisted before/after history |

The Node integration tests were run with `DATABASE_URL` set to a newly created
PostgreSQL 16 container bound only to `127.0.0.1:55437`; they did not use the
running Compose database. They registered and logged in with a random
synthetic account and cleaned up only that test account and organization.
The isolated container was stopped and retained. The separate live browser
flow likewise used a generated local account and removed only its own test
tenant. Existing user credentials were neither requested nor used.

The full `npm run lint` check remains blocked by three `no-require-imports`
errors in the preserved, pre-existing untracked file
`server/tmp-test-backup-restore.js`. The targeted lint command above passed.
