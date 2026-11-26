# Section 7: Controlled Failure and Recovery Drill

## Scope and evidence

This drill uses synthetic task/job data and a disposable PostgreSQL database on
loopback. Redis failure and subscriber-count responses are simulated in Jest;
this is not evidence of production behavior or live Redis delivery. No remote
database, deployment, or external service is involved.

## Reproduce the missing-subscriber failure

1. Create a disposable local PostgreSQL database and set `DATABASE_URL` to its
   loopback address. Do not point it at a shared, hosted, or production database.
2. Initialize the schema and run the focused tests:

   ```powershell
   node create-db.cjs
   npm test -- --runInBand server/tests/taskEvents.test.ts server/tests/backgroundJobs.test.ts server/tests/taskEventRoutes.test.ts
   ```

3. In `taskEvents.test.ts`, the Redis script is simulated as returning zero
   subscribers. In `backgroundJobs.test.ts`, task-event publishing fails with
   `No task-event subscribers are available`, then succeeds after recovery.
4. The regression asserts the job is first `pending`, its attempt count
   increases, `locked_at` is cleared, and `last_error` records the failure.
   The structured log identifies the `jobId`, `jobType`, attempt, and error
   class without logging task contents. After recovery the same job completes
   with the same event ID.

The database evidence during the retry window can be inspected with:

```sql
SELECT id, status, attempts, max_attempts, locked_at, last_error, updated_at
FROM background_jobs
WHERE idempotency_key = '<synthetic no-subscriber job key>';
```

`last_error` is cleared when the job completes, so inspect the row during its
scheduled retry delay. The test asserts this intermediate state directly. The
test organization is removed during cleanup.

## Root cause and fix

The previous Redis Lua script wrote the deduplication marker before publishing
and did not check the `PUBLISH` subscriber count. A publish to zero subscribers
could therefore be treated as successful, allowing the PostgreSQL job to be
marked complete even though no Redis subscriber received it.

The script now publishes atomically and writes the seven-day marker only when
Redis reports at least one subscriber. A zero-subscriber result raises a
retryable error; the durable PostgreSQL job remains pending and is retried with
its stable `background-job:<job id>` event ID. The worker logs safe job
metadata, and abandoned `processing` rows are reclaimed after the existing
five-minute stale-lock interval.

The authenticated SSE endpoint also accepts `Last-Event-ID` and replays
tenant-scoped completed or dead task-event rows from PostgreSQL in pages. This
allows a reconnecting consumer to recover events that were not observed while
disconnected, including valid event jobs that exhausted their worker retries.
Live events received during replay are buffered to avoid a replay/live race.

## Activity rollback and retention evidence

The task regression tests deliberately insert a conflicting activity version,
then attempt an update. The API returns an error, and assertions verify that
the task's status/version did not change and no matching update job was
enqueued. This exercises the transaction rollback when the activity insert
fails.

The history test deletes the task's project and then reads the task's retained,
paginated history using the owning tenant. A different tenant receives `404`.
The activity table keeps its organization foreign key, but no longer has a
cascading foreign key to the mutable task row; `task_id` remains the historical
subject identifier so project/task deletion does not erase audit evidence.

History can also be inspected through the authenticated endpoint:

```text
GET /api/tasks/<synthetic-task-id>/activities?page=1&limit=20
```

## Regression coverage

The focused automated cases cover:

- Concurrent updates: only one update with a shared expected version succeeds;
  the stale request receives `409`.
- Missing/invalid versions, activity-insert rollback, project-deletion
  retention, pagination, and cross-tenant denial.
- Redis zero-subscriber behavior, retry after recovery, stable event IDs,
  in-memory deduplication, and Redis outage handling.
- Reclaiming a stale `processing` job after a simulated worker restart.
- Replaying completed and dead outbox events by tenant and `Last-Event-ID`.

## Authenticated task demonstration

The owner and project-manager workspaces include a limited task concurrency
demo at `/organization-owner` and `/project-manager`. With a non-production
account, create or select a project, create a task, and note its ID. Load that
ID in two separate browser sessions before either session saves. Save a status
change in the first session; submitting the old version in the second should
show HTTP `409`, leave its stale snapshot unchanged, and require an explicit
reload. The activity panel then shows the before/after snapshots and versions.
The demonstration uses existing task and activity endpoints; it is not a full
task editor.

The Chromium test in `e2e/task-demo.spec.ts` uses a stateful mocked API to
exercise the visible conflict/reload/history flow, keyboard project creation,
and a 375-pixel viewport. It proves frontend behavior only, not a live API
request or database write. The backend concurrency and transaction tests use
two authenticated test users and an isolated PostgreSQL database.

In addition, a live local browser run used a generated account against the
local Compose API. One tab saved a status update with HTTP 200; the other tab's
stale update returned HTTP 409 and displayed the current version. Reloading
showed the persisted before/after activity snapshot. The test tenant was
removed afterward. Screenshots of the conflict message and history were
captured in the working conversation; they are not checked into the repository.

## Remaining delivery limitations

This is durable, retryable event processing, not exactly-once notification
delivery. Redis Pub/Sub still has no consumer acknowledgement. The SSE replay
uses the persisted job ID as its cursor and stable event ID; reconnects can
therefore deliver duplicates, which a consumer should deduplicate by event ID.
Redis deduplication markers expire after seven days, and the in-memory fallback
does not survive process restarts. Dead jobs are not automatically requeued;
their valid task events can be replayed from the outbox when a consumer
reconnects. The browser demo does not stream task notifications. Notification
delivery remains retryable/replayable rather than exactly-once.
