# Assessment 12 - Testing Strategy

## Test layers

| Layer | Location | Command | Coverage |
|---|---|---|---|
| Frontend components | `src/**/*.test.tsx` | `npm test -- --runInBand` | Login success, token storage, navigation, invalid credentials |
| Node API | `server/tests/**/*.test.ts` | `npm test -- --runInBand` | Authentication, refresh rotation, project CRUD, tenant isolation, concurrent updates, background-job retry/dead-letter transitions |
| Python API | `python/analytics_service/tests` | `python -m unittest discover -s python/analytics_service/tests -p "test_*.py"` | Health, analytics success, missing files, unsafe paths |
| Python processor | `python/worksphere_processor/tests` | `$env:PYTHONPATH = "python/worksphere_processor"; python -m unittest discover -s python/worksphere_processor/tests -p "test_*.py"` | Streaming, invalid JSON, productivity, overdue tasks, exports |
| Database integration | `server/tests` | `npm test -- --runInBand` with PostgreSQL | Real schema queries and cross-organization isolation |
| Browser E2E | `e2e/*.spec.ts` | `npm run test:e2e` | Public navigation and browser validation |

## Reproducible database setup

The Node and database integration tests require an isolated PostgreSQL database. A disposable database is used in CI.

```powershell
$env:DATABASE_URL="postgresql://worksphere:worksphere@127.0.0.1:5432/worksphere_test"
$env:JWT_SECRET="ci-only-secret-not-used-outside-tests"
node create-db.cjs
npm test -- --runInBand
```

Use Docker or the GitHub Actions PostgreSQL service to provide the database. Do not point test suites at the Render or production database.

## Browser setup

```powershell
npm run test:e2e
npx playwright install chromium
```

Run the E2E tests against the local Next.js server. The Playwright configuration starts `npm run dev` automatically when port 3000 is not already serving.

## Important scenarios

- Cross-tenant project reads return 404 rather than exposing the project.
- Concurrent project updates complete successfully and persist only valid organization-owned data.
- Refresh-token reuse is rejected.
- Missing and invalid API inputs return safe validation errors.
- External email and storage services are mocked in integration tests.
- Background-job publish failures are retried with recorded errors and become dead-lettered at the configured attempt limit.
- Python file operations reject missing files and unsafe paths.

## Validation evidence

The full run below was completed before the background-job retry tests were added. Rerun the suite afterward to verify the new tests.

| Command | Result |
|---|---|
| `npm test -- --runInBand --verbose` | Passed: 5 suites, 32 tests (before background-job retry tests) |
| `npm run test:e2e` | Passed: 2 browser tests |
| `python -m unittest discover -s python/analytics_service/tests -p "test_*.py"` | Passed: 6 tests |
| `$env:PYTHONPATH = "python/worksphere_processor"; python -m unittest discover -s python/worksphere_processor/tests -p "test_*.py"` | Passed: 6 tests |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npx tsc -p tsconfig.server.json --noEmit` | Passed |

The PostgreSQL run reported a non-fatal `pg-connection-string` SSL-mode compatibility warning.
