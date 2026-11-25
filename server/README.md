# WorkSphere - Express API

## Overview

This folder contains the Express.js REST API for the WorkSphere multi-tenant project management platform.

The API uses PostgreSQL for persistent project and task storage. It also supports authenticated real-time task updates, PostgreSQL-backed background job processing, third-party email delivery, webhook verification, and S3-compatible object storage.

## Technology Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- `pg` PostgreSQL driver
- CORS
- Server-Sent Events (SSE)
- Resend Email API
- AWS SDK for JavaScript (S3)
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

Apply the assessment database schemas before using the corresponding features.

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

### Email Integration - Assessment 08

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/integrations/email` | Send an email through Resend |

The email endpoint requires JWT authentication and one of these organization roles:

- `owner`
- `project_manager`

Example request:

```http
POST /api/integrations/email
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

```json
{
  "to": "recipient@example.com",
  "subject": "WorkSphere Notification",
  "html": "<h1>Welcome to WorkSphere</h1><p>You have received a notification.</p>"
}
```

The endpoint validates the recipient email address, subject, and HTML content before sending.

### Webhook Integration - Assessment 08

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/webhooks/resend` | Receive Resend webhook events |

The webhook endpoint:

- Verifies incoming requests using the Svix signature format.
- Validates the webhook timestamp to reduce replay attacks.
- Uses the raw request body for signature verification.
- Stores verified events in PostgreSQL.
- Uses the Svix message ID to prevent duplicate event processing.
- Returns an appropriate response for invalid signatures and duplicate events.

Resend supplies these signature headers:

- `svix-id`
- `svix-timestamp`
- `svix-signature`

Configure the webhook endpoint in the Resend dashboard.

### Attachment Storage - Assessment 08

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/attachments/upload-url` | Generate a presigned upload URL |
| GET | `/api/attachments/:id/download-url` | Generate a presigned download URL |

Both endpoints require JWT authentication.

Example upload URL request:

```http
POST /api/attachments/upload-url
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

```json
{
  "fileName": "project-document.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 102400,
  "projectId": 5
}
```

Provide exactly one valid `projectId` or `taskId`.

The API validates:

- File name
- Supported content type
- Maximum file size of 10 MB
- Organization ownership of the associated project or task

Supported file types:

- `application/pdf`
- `image/jpeg`
- `image/png`
- `text/plain`

The API returns a presigned upload URL valid for five minutes.

The client uploads the file directly to the returned URL using an HTTP PUT request and the matching Content-Type header.

For downloading, request the attachment's download URL using its attachment ID. The generated URL is valid for five minutes.

Attachment metadata is stored in PostgreSQL, while file content is stored in S3-compatible object storage.

## Email and Storage Configuration

Add the following environment variables to the root `.env` file.

### Resend Email

```env
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=WorkSphere <onboarding@resend.dev>
RESEND_WEBHOOK_SECRET=your_resend_webhook_secret
```

Use a valid Resend API key and an authorized sender address.

Configure the webhook secret from the Resend webhook settings.

### S3-Compatible Object Storage

```env
AWS_REGION=your_aws_region
S3_BUCKET=your_bucket_name
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_ENDPOINT=
```

For AWS S3, configure the appropriate region and bucket.

For S3-compatible providers, configure the provider endpoint using `S3_ENDPOINT`.

Never commit real credentials or secrets to GitHub.

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

Run the backend test suite from the project root:

```bash
npm test -- --runInBand
```

Check TypeScript compilation:

```bash
npx tsc --noEmit
```

Use Postman to test authenticated endpoints, webhook requests, email delivery, attachment upload URL generation, and SSE connections.

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

## Assessment 08 Summary

Assessment 08 adds third-party integrations using:

- Resend email delivery service
- Svix webhook signature verification
- Timestamp validation and replay protection
- Duplicate webhook event prevention
- PostgreSQL webhook event storage
- AWS S3-compatible object storage
- Presigned upload and download URLs
- Organization-scoped attachment access
- File type and size validation
- Environment-based integration credentials

Payment integration was not included because the current WorkSphere project does not implement subscription or billing plans.
