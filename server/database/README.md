# WorkSphere - Database Design

## Database

- **Database:** PostgreSQL
- **Database name:** `worksphere_db`
- **PostgreSQL version:** 16 (matches `docker/postgres/init` and `docker-compose.yml`)

## Core Tables

### 1. organizations

Stores organization information.

| Column | Type | Description |
|---|---|---|
| id | BIGSERIAL | Primary key |
| name | VARCHAR(150) | Organization name |
| created_at | TIMESTAMPTZ | Creation timestamp |

### 2. users

Stores user account information.

| Column | Type | Description |
|---|---|---|
| id | BIGSERIAL | Primary key |
| name | VARCHAR(150) | User name |
| email | VARCHAR(255) | Unique email |
| password_hash | TEXT | Bcrypt-hashed password |
| created_at | TIMESTAMPTZ | Creation timestamp |

### 3. organization_memberships

Connects users with organizations and defines their roles.

| Column | Type | Description |
|---|---|---|
| id | BIGSERIAL | Primary key |
| organization_id | BIGINT | Organization foreign key |
| user_id | BIGINT | User foreign key |
| role | VARCHAR(30) | Organization role |
| created_at | TIMESTAMPTZ | Creation timestamp |

Supported roles:
- owner
- project_manager
- team_member
- auditor

Each user can have one membership per organization.

### 4. projects

Stores projects belonging to organizations.

| Column | Type | Description |
|---|---|---|
| id | BIGSERIAL | Primary key |
| organization_id | BIGINT | Organization foreign key |
| name | VARCHAR(150) | Project name |
| description | TEXT | Project description |
| status | VARCHAR(30) | Project status |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

Supported statuses:
- active
- completed
- archived

### 5. refresh_tokens

Stores hashed refresh tokens used for session management.

| Column | Type | Description |
|---|---|---|
| id | BIGSERIAL | Primary key |
| user_id | BIGINT | User foreign key |
| organization_id | BIGINT | Organization foreign key |
| token_hash | TEXT | SHA-256 hash of refresh token |
| token_family_id | UUID | Identifies a refresh-token family |
| expires_at | TIMESTAMPTZ | Token expiration timestamp |
| revoked_at | TIMESTAMPTZ | Revocation timestamp |
| created_at | TIMESTAMPTZ | Creation timestamp |

Refresh tokens are stored as SHA-256 hashes rather than plaintext tokens. Token families support refresh-token rotation and reuse detection.

## Relationships

- One organization can have multiple projects.
- One organization can have multiple members.
- One user can belong to multiple organizations.
- Organization memberships connect users and organizations.
- Each project belongs to exactly one organization.
- Refresh tokens belong to a user and an organization.

## Indexes

- `idx_memberships_user_id`: Supports user membership lookups.
- `idx_projects_organization_id`: Supports organization-specific project queries.
- `idx_refresh_tokens_user_id`: Supports refresh-token lookups by user.
- `idx_refresh_tokens_family_id`: Supports refresh-token family operations.

## Setup

Create the database:

```sql
CREATE DATABASE worksphere_db;
```

Initialize all application schemas from the project root:

```powershell
node create-db.cjs
```

For an existing database, apply pending versioned migrations instead of treating
the initializer as a migration runner. `server/migrate.cjs` records applied
files in `schema_migrations` and runs each migration transactionally. Set
`WORKSPHERE_APP_PASSWORD` to at least 32 URL-safe characters before running it;
the database connection must use a role with `CREATEROLE` privileges:

```powershell
$env:WORKSPHERE_APP_PASSWORD = "a-generated-url-safe-password-of-at-least-32-chars"
node server/migrate.cjs
```

Docker Compose provisions the same non-superuser `worksphere_app` role during
first-time database initialization and connects the API and worker with that
role. Existing PostgreSQL volumes do not rerun initialization scripts; apply
the versioned migrations before switching an existing Compose database to the
application role. The bootstrap database credentials remain separate and are
used for schema setup and migrations, not normal API/worker traffic.

## Local backup and restore

`node server/backup-restore.cjs backup` creates a plain SQL backup under
`backups/`. `node server/backup-restore.cjs restore <backup-file>` drops and
recreates the database named by `DATABASE_URL` before restoring it. The helper
rejects non-local database hosts and passes command arguments without a shell;
restore is still destructive to that local database, so use only a disposable
database for validation. If it uses Docker instead of local PostgreSQL tools,
`WORKSPHERE_POSTGRES_CONTAINER` selects the local PostgreSQL container (default:
`worksphere-postgres`).

## Authentication and Authorization

- User passwords are hashed using bcrypt before storage.
- JWT access tokens contain the user ID, email, organization ID, and role.
- Refresh tokens are securely hashed before being stored.
- Refresh-token rotation invalidates the previous token.
- Reuse of revoked refresh tokens triggers token-family revocation.
- Logout revokes the associated refresh-token family.
- Middleware validates access tokens and checks current organization membership.
- Role-based middleware restricts operations according to organization roles.

## Organization-Level Data Isolation

- Every authenticated request is associated with an organization ID from the verified access token.
- Project queries are scoped to the authenticated organization.
- Users cannot retrieve or modify projects belonging to another organization.
- Owners and project managers can create and update projects.
- Only owners can delete projects.
- Team members and auditors have read-only project access.

## Implementation Notes

- Express connects to PostgreSQL through the `pg` connection pool.
- Project CRUD operations use parameterized SQL queries.
- Organization IDs are derived from authenticated user context rather than hardcoded demo IDs.
- Database foreign keys and constraints enforce referential integrity.
- Authentication, authorization, and organization-level isolation are covered by automated tests.