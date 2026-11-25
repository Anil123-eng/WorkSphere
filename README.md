# WorkSphere - Multi-Tenant Project Management Platform

## Overview

WorkSphere is a multi-tenant project management and workflow automation platform designed to help organizations manage projects and collaborate with team members.

The platform uses organization-based access control to ensure users can access only the data belonging to their organizations.

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
- JWT authentication
- bcrypt password hashing

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

### Backend API
- Express REST API
- API health check
- User registration and login
- JWT access-token authentication
- Refresh-token rotation
- Refresh-token reuse detection
- Logout and session revocation
- Role-based authorization
- Project CRUD operations
- Request validation
- Centralized error handling
- 404 handling
- Parameterized SQL queries

### Security and Authorization
- Passwords hashed using bcrypt
- Refresh tokens stored as SHA-256 hashes
- Access-token verification middleware
- Organization membership validation
- Role-based permission checks
- Organization-level project data isolation
- Protection against refresh-token reuse

### Database
- Organizations table
- Users table
- Organization memberships table
- Projects table
- Refresh tokens table
- Foreign key relationships
- Unique membership constraints
- Organization-level project indexing
- Refresh-token indexing

## User Roles

| Role | Permissions |
|---|---|
| Owner | Create, view, update, and delete projects |
| Project Manager | Create, view, and update projects |
| Team Member | View projects |
| Auditor | View projects |

## Project Structure

```text
worksphere-app/
|-- src/
|   |-- app/
|   |-- components/
|
|-- server/
|   |-- database/
|   |   |-- schema.sql
|   |   |-- auth-schema.sql
|   |   |-- README.md
|   |
|   |-- middleware/
|   |   |-- authMiddleware.ts
|   |   |-- roleMiddleware.ts
|   |   |-- errorHandler.ts
|   |
|   |-- routes/
|   |   |-- authRoutes.ts
|   |   |-- projectRoutes.ts
|   |
|   |-- tests/
|   |   |-- auth.test.ts
|   |   |-- project.test.ts
|   |
|   |-- utils/
|   |   |-- tokenUtils.ts
|   |
|   |-- app.ts
|   |-- db.ts
|   |-- server.ts
|
|-- .env.example
|-- jest.config.js
|-- README.md
```

## Prerequisites

- Node.js
- npm
- PostgreSQL 18 or compatible version

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/Anil123-eng/WorkSphere.git
cd WorkSphere
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root using `.env.example` as a template.

Configure the following variables with your local database credentials and a secure JWT secret:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=worksphere_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

JWT_SECRET=your_secure_jwt_secret
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
```

Never commit your actual `.env` file or share your secrets.

### 4. Create the PostgreSQL database

```sql
CREATE DATABASE worksphere_db;
```

### 5. Create database tables

Execute the core database schema:

```bash
psql -U postgres -d worksphere_db -f server/database/schema.sql
```

Execute the authentication schema:

```bash
psql -U postgres -d worksphere_db -f server/database/auth-schema.sql
```

### 6. Start the frontend

```bash
npm run dev
```

Open http://localhost:3000

### 7. Start the backend

In a separate terminal:

```bash
npm run server
```

API base URL: http://localhost:5000

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new organization and owner |
| POST | `/api/auth/login` | Authenticate a user |
| POST | `/api/auth/refresh` | Rotate refresh tokens |
| POST | `/api/auth/logout` | Revoke a refresh-token session |

### Projects

All project endpoints require a valid access token.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | Retrieve organization projects |
| GET | `/api/projects/:id` | Retrieve a project by ID |
| POST | `/api/projects` | Create a project |
| PUT | `/api/projects/:id` | Update a project |
| DELETE | `/api/projects/:id` | Delete a project |

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API health |

## Testing and Validation

Run automated tests:

```bash
npm test
```

Run tests serially:

```bash
npm test -- --runInBand
```

Run TypeScript verification:

```bash
npx tsc --noEmit
```

Run lint:

```bash
npm run lint
```

Run production build:

```bash
npm run build
```

### Current Test Results

- Authentication API: 9 tests passed.
- Project API: 9 tests passed.
- Combined test suite: 18 tests passed.

## Current Limitations and Future Work

- Task and subtask management.
- Team invitations and collaboration.
- Comments and attachments.
- Workflow automation.
- Notifications and real-time updates.
- Analytics and reporting.
- Background jobs and integrations.
- Docker and CI/CD configuration.
- Production deployment and monitoring.

These features are planned for subsequent development assessments.

## Project Status

- Assessment 01: Frontend architecture implemented.
- Assessment 02: Express API and project CRUD implemented.
- Assessment 03: PostgreSQL data model and project persistence implemented.
- Assessment 04: Authentication, authorization, refresh-token security, and organization-level project isolation implemented and tested.

WorkSphere is being developed incrementally as part of a hands-on software engineering training project.