# WorkSphere – Multi-Tenant Project Management Platform

## Overview

WorkSphere is a multi-tenant project management and workflow automation platform designed to help organizations manage projects and collaborate with team members.

## Technology Stack

### Frontend
- Next.js App Router
- React
- TypeScript
- Tailwind CSS

### Backend
- Node.js
- Express.js
- TypeScript
- PostgreSQL
- `pg` PostgreSQL driver

### Testing
- Jest
- Supertest

## Implemented Features

### Frontend
- Responsive homepage
- Platform Administrator page
- Organization Owner page
- Project Manager page
- Team Member page
- Shared workspace layout
- Reusable workspace form

### Backend
- Express REST API
- API health check
- Project CRUD operations
- Request validation
- Centralized error handling
- 404 handling
- PostgreSQL database integration
- Parameterized SQL queries

### Database
- Organizations table
- Users table
- Organization memberships table
- Projects table
- Foreign key relationships
- Organization-level project indexing

## Project Structure

```text
worksphere-app/
├── src/
│   ├── app/
│   └── components/
├── server/
│   ├── database/
│   │   ├── schema.sql
│   │   └── README.md
│   ├── middleware/
│   ├── routes/
│   ├── tests/
│   ├── app.ts
│   ├── db.ts
│   └── server.ts
├── .env.example
├── jest.config.js
└── README.md
```

## Prerequisites

- Node.js
- npm
- PostgreSQL 18 or compatible version

## Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root using `.env.example` as a template.

Configure your PostgreSQL connection:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=worksphere_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
```

Never commit your actual `.env` file.

### 3. Create the PostgreSQL database

```sql
CREATE DATABASE worksphere_db;
```

### 4. Create database tables

```bash
psql -U postgres -d worksphere_db -f server/database/schema.sql
```

### 5. Start the frontend

```bash
npm run dev
```

Open http://localhost:3000

### 6. Start the backend

In a separate terminal:

```bash
npm run server
```

API base URL: http://localhost:5000

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | API health check |
| GET | `/api/projects` | Retrieve projects |
| GET | `/api/projects/:id` | Retrieve project by ID |
| POST | `/api/projects` | Create project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |

## Testing and Validation

Run automated tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Run production build:

```bash
npm run build
```

## Current Limitations

- Authentication and authorization are not yet implemented.
- Project API currently uses a temporary demo organization ID.
- Organization membership-based tenant isolation is not yet enforced.
- Additional modules such as tasks, notifications, workflows, and analytics are planned for subsequent assessments.

## Project Status

- Assessment 01: Frontend architecture implemented; further assessment evidence and validation remain.
- Assessment 02: Express API implemented with automated tests and documentation.
- Assessment 03: Initial PostgreSQL schema and project CRUD integration implemented; further data-model validation remains.
