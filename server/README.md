
# WorkSphere - Express API

## Overview

This folder contains the Express.js REST API for the WorkSphere multi-tenant project management platform.

The API uses PostgreSQL for persistent project and task storage. It also supports authenticated real-time task updates and PostgreSQL-backed background job processing.

## Technology Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- `pg` PostgreSQL driver
- CORS
- Server-Sent Events (SSE)
- Jest
- Supertest

## Database Configuration

The API uses environment variables from the root `.env` file.

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=worksphere_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
```

Do not commit the actual `.env` file.

## Start the API Server

From the project root, run:

```bash
npm run server
```

The API runs at:

http://localhost:5000

The background job worker starts automatically with the API server.

## API Endpoints

### Health and Projects

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API status |
| GET | `/api/projects` | Retrieve organization projects |
| GET | `/api/projects/:id` | Retrieve a project |
| POST | `/api/projects` | Create a project |
| PUT | `/api/projects/:id` | Update a project |
| DELETE | `/api/projects/:id` | Delete a project |

### Tasks - Assessment 07

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks` | Create a task and enqueue a real-time event |
| PATCH | `/api/tasks/:id` | Update task status and enqueue an event |
| GET | `/api/task-events/stream` | Subscribe to real-time task updates using SSE |

Task endpoints require JWT authentication and organization-level authorization.

## Create a Project

**Request:** `POST /api/projects`

```json
{
  "name": "Website Redesign",
  "description": "Redesign the company website"
}
```

A successful request returns HTTP `201 Created`.

## Update a Project

**Request:** `PUT /api/projects/:id`

```json
{
  "name": "Updated Website Project",
  "description": "Updated project description"
}
```

A successful request returns HTTP `200 OK`.

## Create a Task

**Request:** `POST /api/tasks`

```json
{
  "projectId": 5,
  "title": "Implement dashboard",
  "description": "Create the project dashboard",
  "dueDate": "2026-12-05"
}
```

A successful request returns HTTP `201 Created`.

Task creation and background job insertion happen within the same database transaction.

## Update Task Status

**Request:** `PATCH /api/tasks/:id`

```json
{
  "status": "completed"
}
```

Supported statuses:

- `todo`
- `in_progress`
- `completed`

A successful request returns HTTP `200 OK`.

## Real-Time Task Updates

The API uses Server-Sent Events (SSE) to deliver task updates to authenticated organization members.

**Request:**

`GET /api/task-events/stream`

Include the JWT access token in the Authorization header:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

After connecting, the server sends a connection confirmation and streams task events such as:

- `task.created`
- `task.updated`

Events are scoped to the authenticated user's organization.

## Background Job Processing

WorkSphere uses PostgreSQL as a persistent background job queue.

The worker:

- Polls pending jobs every three seconds.
- Claims jobs using database locking with `FOR UPDATE SKIP LOCKED`.
- Uses idempotency keys to prevent duplicate job insertion.
- Tracks processing attempts.
- Retries failed jobs using exponential backoff.
- Moves jobs that exceed the maximum attempts to the `dead` state.
- Recovers jobs left processing after a worker interruption.

Task creation and job enqueueing are performed in the same database transaction to prevent tasks from being created without their corresponding event jobs.

## Background Job Statuses

| Status | Description |
|---|---|
| `pending` | Waiting for processing |
| `processing` | Currently being processed |
| `completed` | Successfully processed |
| `dead` | Maximum retry attempts reached |

## Testing

Run the existing backend test suite from the project root:

```bash
npm test -- --runInBand
```

Check TypeScript compilation:

```bash
npx tsc --noEmit
```

Use Postman to test the authenticated task endpoints and SSE connection.

## Assessment 07 Summary

Assessment 07 implements real-time task updates and background processing using:

- Express.js REST endpoints
- Server-Sent Events
- PostgreSQL-backed job queue
- Transactional job insertion
- Idempotency keys
- Retry and failure handling
- Worker recovery
- Organization-scoped event delivery
