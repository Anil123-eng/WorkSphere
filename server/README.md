# WorkSphere - Express API

## Overview

This folder contains the Express.js REST API for the WorkSphere multi-tenant project management platform.

The API uses PostgreSQL for persistent project storage.

## Technology Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- `pg` PostgreSQL driver
- CORS
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

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API status |
| GET | `/api/projects` | Retrieve organization projects |
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

A successful request returns HTTP `200