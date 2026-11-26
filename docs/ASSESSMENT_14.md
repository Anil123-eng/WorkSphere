# Assessment 14 - Production Deployment

## Status and deployment model

WorkSphere's repository deployment target is Render. GitHub Actions builds and checks the application, publishes images to GHCR, and triggers Git-connected Render services using the exact commit SHA. Render's edge proxy handles public ingress and TLS; no additional reverse-proxy container is required for this deployment model.

The production service set is:

| Service | Render type | Runtime / health check |
|---|---|---|
| Frontend | Web service | `Dockerfile.frontend`; public `/` |
| Node API | Web service | `Dockerfile.server`, `PORT=5000`; `/api/health` |
| Analytics | Web service | `Dockerfile.python`, `PORT=8000`; `/health` |
| Background worker | Background worker | `Dockerfile.server`, start command `node dist/server/worker.js`; verify service status and worker logs |
| PostgreSQL | Render Postgres | Managed database; private internal URL |
| Redis / Key Value | Render Key Value | Managed cache; private internal URL |

Render deploy hooks deploy all four application services in staging and production. The API and worker share database and Redis configuration. The analytics service reads only its bundled sample files. Render builds from Git; the GHCR images are retained as release artifacts and are not currently the source of Render deploys.

This repository does not contain Render credentials, DNS ownership, or a Render account. Therefore actual domains, dashboard settings, live deployment, production secrets, and a database restore drill must be configured and evidenced by the operator; they are not claimed as completed here.

## Domains, HTTPS, and reverse proxy

For each environment, configure a custom domain for the frontend, API, and analytics web service in Render's service settings. Use the DNS records shown in Render for the actual domain provider; verify each domain in the dashboard. Render issues and renews TLS certificates for verified custom domains and redirects HTTP traffic to HTTPS. The Render edge proxy terminates public TLS and forwards traffic to the services.

Set the `FRONTEND_URL`, `BACKEND_URL`, and `ANALYTICS_URL` GitHub Environment variables to the corresponding public HTTPS base URLs, without trailing slashes. The staging and production workflows reject non-HTTPS URLs and poll `/`, `/api/health`, and `/health` respectively.

Render references:

- [Custom domains and managed TLS](https://render.com/docs/custom-domains)
- [Private networking](https://render.com/docs/private-network)
- [HTTP health checks](https://render.com/docs/health-checks)

## Network and database access

Create the web services, worker, Postgres, and Key Value instance in the same Render region and workspace. Configure the API and worker with Render's internal Postgres and Key Value connection URLs. Do not put an external database URL in application service variables. Disable external database access where possible; otherwise use the database IP allow list to permit only approved operator addresses. Do not allow the public internet to connect to the production database.

The production and staging environment templates use placeholders for internal database and Redis hostnames and set `TRUST_PROXY_HOPS=1` for the Render edge proxy. Replace placeholders in the Render dashboard; do not copy template values into production. The `docker-compose.yml` setup is for local development only: host ports bind to loopback, and `DB_PASSWORD` and `JWT_SECRET` are required rather than falling back to known default secrets.

## Secrets management

- Store application secrets (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, email credentials, and S3 credentials) in Render's service settings or an appropriately scoped Render environment group.
- Store deploy-hook URLs as GitHub Environment secrets named `RENDER_FRONTEND_DEPLOY_HOOK`, `RENDER_BACKEND_DEPLOY_HOOK`, `RENDER_ANALYTICS_DEPLOY_HOOK`, and `RENDER_WORKER_DEPLOY_HOOK`.
- Store public health-check URLs as GitHub Environment variables: `FRONTEND_URL`, `BACKEND_URL`, and `ANALYTICS_URL`.
- Configure separate values for `staging` and `production`; require a reviewer for the `production` GitHub Environment.
- `.env`, `.env.staging`, and `.env.production` are ignored by Git. The committed `*.example` files contain placeholders only.
- `NEXT_PUBLIC_API_URL` is embedded in the frontend and is public configuration, not a secret. Never put credentials in `NEXT_PUBLIC_*` variables, workflow output, logs, or committed files.

## Backups and restore verification

Use a Render Postgres plan that supports point-in-time recovery. Render documents PITR windows of three days for Hobby workspaces and seven days for Pro or higher; free database instances do not provide recovery. Check the current plan and Recovery page before relying on a retention window. Create a logical export before high-risk releases and store downloaded exports encrypted outside the repository and GitHub Actions artifacts. Render documents logical-export retention of seven days, so download exports that must be retained longer.

Restore drills must restore to a **new, isolated database**, not overwrite production:

1. In the Render database's Recovery page, create a point-in-time recovery instance or restore a logical export into a separate database.
2. Keep the primary production database and its service URLs unchanged during the drill.
3. Use the restored database's private URL from a temporary staging service or a secured operator session. Check required tables and basic data integrity with read-only queries, for example:

   ```sql
   SELECT
     to_regclass('public.organizations') AS organizations,
     to_regclass('public.users') AS users,
     to_regclass('public.projects') AS projects,
     to_regclass('public.background_jobs') AS background_jobs;
   ```

4. Verify the restored service health endpoints and a synthetic login/project read using a dedicated staging account. Do not run destructive integration tests against production or the recovered primary.
5. Record the backup timestamp, recovery point, destination database, validation results, elapsed recovery time, and operator. Delete the temporary recovery database only after evidence is saved and approval is obtained.

Render references:

- [Postgres backups and point-in-time recovery](https://render.com/docs/postgresql-backups)
- [Creating and connecting to Render Postgres](https://render.com/docs/postgresql-creating-connecting)

The restore drill requires access to the Render account and is not represented as completed by local test results.

## Health checks, logs, and monitoring

Configure Render HTTP health-check paths for the frontend (`/`), API (`/api/health`), and analytics service (`/health`). GitHub Actions also polls their public HTTPS URLs after deployment and fails if a service does not return HTTP 200 within ten minutes. Render's platform health checks stop routing to unhealthy web instances and can restart persistently unhealthy instances.

Render background workers do not have HTTP health checks. The worker image includes a Docker health check based on a database-backed heartbeat file; verify that its Render worker service is running and that its logs show `WorkSphere background job worker started`. Investigate repeated `Worker heartbeat failed` messages and worker restarts.

The Node API, analytics service, and worker write operational messages to stdout/stderr, which Render exposes in the service Logs view. Use Render's live tail and filters to diagnose deploys and service failures. Enable Render notifications for failed deploys and service health events. Review service and database resource graphs, storage, and connection usage regularly; create provider alerts where the selected plan supports them. Do not log access tokens, passwords, connection strings, request bodies containing personal data, or secret environment values.

Render references:

- [Render service logs](https://render.com/docs/logging)
- [Render notifications](https://render.com/docs/notifications)

## Deployment and rollback procedure

1. Configure separate Render services and managed data services for staging and production, in the same region per environment.
2. Set each service's build/runtime settings, private connection URLs, and secret environment variables in Render. Configure the Node API's `PORT` as `5000` and analytics `PORT` as `8000`. For the worker, use `node dist/server/worker.js`.
3. Add the required GitHub `staging` and `production` environment variables and secrets listed above. Restrict production deployments to `master` and require reviewer approval.
4. Push a validated commit to `master`. The CI workflow runs checks, publishes images, deploys all Render application services to staging, and verifies the HTTPS health endpoints.
5. Test the staging application and confirm the worker is processing jobs. Record the staging commit and evidence.
6. Dispatch the production release workflow with the validated 40-character commit SHA. Approve the GitHub Environment deployment and verify health, service logs, and worker status.
7. If a release is unhealthy, roll back each affected Render service to its previous successful deploy. If data recovery is needed, recover to a new database first, validate it, and only then update service connection URLs under an approved change.

Never run deployment or restore commands against production without the required review and change approval.

## Validation evidence and remaining operator actions

Repository-level verification can confirm workflow syntax, Docker configuration, application tests, and image builds. A passing local test suite does not prove that custom DNS, TLS issuance, managed-service networking, backup retention, or recovery work in the live Render account.

| Requirement | Repository status | Live evidence still needed |
|---|---|---|
| Repeatable staging/production deploy workflow | Configured in GitHub Actions for frontend, API, analytics, and worker | Successful staging run with all required environment values |
| HTTPS, domains, and reverse proxy | Render-managed setup documented; workflows require HTTPS health URLs | Verified custom domains/certificates and successful browser checks |
| Restricted data services | Internal URLs documented; local Compose ports are loopback-only | Render private connection URLs and database external-access restrictions |
| Secrets | GitHub/Render secret names and scope documented; example files contain placeholders | Secret values configured in GitHub Environments and Render service settings |
| Backups and restore verification | Render PITR/export and isolated restore drill documented | Backup plan/retention evidence and a completed restore drill |
| Health checks, logs, monitoring | Workflow checks and Render dashboard procedures documented | Live health checks, notifications, and operator evidence |

Do not mark Assessment 14 fully deployed until these Render-side actions and the restore drill are completed and captured. See [Assessment 11](./ASSESSMENT_11.md) for CI/CD configuration and [Assessment 13](./ASSESSMENT_13.md) for API documentation and API-level behavior.

### Repository validation

| Command | Result |
|---|---|
| `python -c "import yaml; from pathlib import Path; files=[Path('.github/workflows/ci.yml'),Path('.github/workflows/release-production.yml'),Path('docker-compose.yml')]; [yaml.safe_load(p.read_text(encoding='utf-8-sig')) for p in files]"` | Passed: workflow and Compose YAML parsed |
| `docker compose config --quiet` | Passed |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npx tsc -p tsconfig.server.json --noEmit` | Passed |
| `npm test -- --runInBand --verbose` | Passed: 8 suites, 40 tests (user-provided run) |
| `python -m unittest discover -s python/analytics_service/tests -p "test_*.py" -v` | Passed: 11 tests |
| `$env:PYTHONPATH='python/worksphere_processor'; python -m unittest discover -s python/worksphere_processor/tests -p "test_*.py" -v` | Passed: 6 tests |

No live Render deploy, custom-domain verification, production backup, or restore drill was run. Local Docker image builds were not run; the CI workflow builds the three Dockerfiles.
