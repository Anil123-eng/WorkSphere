# Assessment 11 - CI/CD Pipeline

## Overview

WorkSphere uses GitHub Actions to validate pull requests, build and publish versioned container images, deploy successful `master` commits to Render staging, and release a selected `master` commit to production after GitHub Environment approval.

Render remains Git-connected for deployments so its existing service configuration and environment variables are preserved. GHCR images are published as release artifacts; the Render deploy hooks deploy the exact Git commit SHA.

## Workflows

### `.github/workflows/ci.yml`

Runs on pushes to `master` and `feature/**`, and on pull requests targeting `master`.

The workflow:

- Runs ESLint, TypeScript checking, Jest integration tests, and the Next.js production build.
- Starts an isolated PostgreSQL 16 service for Jest and initializes all four application schemas.
- Runs Python analytics and processor unit tests.
- Runs `npm audit --audit-level=high` and `pip-audit`.
- Builds all three Docker images without publishing on pull requests.
- On `master`, publishes frontend, backend, and analytics images to GHCR after all checks pass, triggers both Render staging deploy hooks for the exact commit, and polls the staging frontend/API health endpoints.

The staging frontend image is built with the staging `NEXT_PUBLIC_API_URL`. Render Git-connected deployments use the environment configured on each Render service.

### `.github/workflows/release-production.yml`

Run this workflow manually from GitHub Actions and enter a full 40-character commit SHA. It verifies the commit is reachable from `master`, waits at the `production` GitHub Environment approval gate, deploys that exact commit to Render, and checks frontend/API health.

## Required GitHub configuration

Create GitHub Environments named `staging` and `production`.

Configure these **variables** in the `staging` environment:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL used when building the staging frontend image |
| `FRONTEND_URL` | Public frontend URL used for deployment health checks |
| `BACKEND_URL` | Public backend base URL; the workflow checks `/api/health` |

Configure `FRONTEND_URL` and `BACKEND_URL` in the `production` environment for its health checks. Set `NEXT_PUBLIC_API_URL` in the Render frontend service's environment for its production source build.
Use API base URLs without a trailing slash.

Configure these **secrets** in each environment:

| Secret | Value |
|---|---|
| `RENDER_FRONTEND_DEPLOY_HOOK` | Deploy hook URL for that environment's Render frontend service |
| `RENDER_BACKEND_DEPLOY_HOOK` | Deploy hook URL for that environment's Render backend service |

Do not commit deploy-hook URLs or other credentials. Use the same variable/secret names in both environments, with environment-specific values.

In the Render Dashboard, keep the frontend and backend services connected to this repository, turn off automatic deploys, and create a deploy hook for each service. The workflow sends the selected commit SHA as the hook's `ref` parameter.

Set the `production` environment to require approval from at least one reviewer and restrict its deployment branches to `master`. Configure `staging` without required reviewers so successful master builds can deploy automatically.

GHCR publishing uses the workflow's `GITHUB_TOKEN` with `packages: write`. Published images use names based on the repository:

- `ghcr.io/anil123-eng/worksphere-frontend`
- `ghcr.io/anil123-eng/worksphere-backend`
- `ghcr.io/anil123-eng/worksphere-analytics`

Render currently deploys from Git, not from these images. If switching Render services to image-backed services later, configure Render registry credentials or make the GHCR packages public and update the deploy strategy accordingly.

## Branch protection

Require these CI checks before merging pull requests to `master`:

- `quality`
- `python-tests`
- `security`
- all `docker-build` matrix checks (one for each Dockerfile)

The publishing and staging-deployment jobs are intentionally skipped for pull requests and feature branches.

## Local validation

Use Node.js 22, Python 3.12, PostgreSQL, and Docker. Set local values in `.env` using `.env.example`; do not use production credentials for tests.
URL-encode special characters in PostgreSQL usernames or passwords when placing them in `DATABASE_URL`.

```powershell
npm ci
node create-db.cjs
npm run lint
npm test -- --runInBand
npm run build
npx tsc --noEmit
npx tsc -p tsconfig.server.json --noEmit
python -m pip install -r python/analytics_service/requirements.txt
python -m unittest discover -s python/analytics_service/tests -p "test_*.py"
$env:PYTHONPATH = "python/worksphere_processor"
python -m unittest discover -s python/worksphere_processor/tests -p "test_*.py"
docker compose build
```

For CI, PostgreSQL is provisioned as an ephemeral GitHub Actions service. The schema initializer uses the same `DATABASE_URL` configuration as the backend.

## Production rollback

Production deployment is approval-gated and the Render workflow waits for both health checks. If a release is unhealthy, use the service's **Deploys** page in Render to roll back each affected service to its previous successful deploy. Render keeps the last successful deploy running if a new deploy fails. Record the rolled-back commit and investigate before dispatching another production release.

## Evidence

GitHub Actions retains the workflow run logs and check results as the CI evidence for this assessment. After the first successful run, use the Actions run URL and its test/security/build results in the assessment submission.

Local validation for this implementation:

| Command | Result |
|---|---|
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npx tsc -p tsconfig.server.json --noEmit` | Passed |
| `python -m unittest discover -s python/analytics_service/tests -p "test_*.py"` | Passed: 6 tests |
| `python -m unittest discover -s python/worksphere_processor/tests -p "test_*.py"` | Passed: 6 tests |
| `npm run build` with `NEXT_PUBLIC_API_URL=https://api.example.invalid` | Passed |
| `npm audit --audit-level=high` | Passed; 18 moderate advisories reported |
| `pip-audit -r python/analytics_service/requirements.txt` | Passed; no known vulnerabilities |
| `docker compose config --quiet` | Passed |

The Jest integration suite was not run locally because the available `.env` database target was not verified as an isolated test database. CI provisions a disposable PostgreSQL service for it. Docker image builds were not run locally because the Docker daemon was unavailable; CI builds all three images.
