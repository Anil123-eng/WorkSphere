# WorkSphere - Express API

## Overview

This folder contains the Express.js REST API for the WorkSphere project management platform.

## Technology Stack

- Node.js
- Express.js
- TypeScript
- CORS
- Jest
- Supertest

## Start the API Server

From the project root, run:

```bash
npm run server
```

The API runs at:

`http://localhost:5000`

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API status |
| GET | `/api/projects` | Retrieve all projects |
| GET | `/api/projects/:id` | Retrieve a project |
| POST | `/api/projects` | Create a project |
| PUT | `/api/projects/:id` | Update a project |
| DELETE | `/api/projects/:id` | Delete a project |

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

## Validation and Error Handling

- Project names are required.
- Empty or invalid project IDs return HTTP `400`.
- Projects that do not exist return HTTP `404`.
- Unknown API endpoints return HTTP `404`.
- Unexpected server errors are handled by centralized error middleware.

## Run Automated Tests

From the project root, run:

```bash
npm test
```

The API tests use Jest and Supertest.

## Current Implementation Limitations

- Project data is currently stored in memory.
- Data is lost when the server restarts.
- PostgreSQL persistence will be implemented in a later assessment.
- Authentication, role-based access control, and tenant-level data isolation are not implemented yet.
