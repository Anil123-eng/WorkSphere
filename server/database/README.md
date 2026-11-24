
# WorkSphere - Database Design

## Database

- Database: PostgreSQL
- Database name: worksphere_db
- PostgreSQL version: 18.7

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
| password_hash | TEXT | Hashed password |
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

## Relationships

- One organization can have multiple projects.
- One organization can have multiple members.
- One user can belong to multiple organizations.
- Organization memberships connect users and organizations.
- Each project belongs to exactly one organization.

## Indexes

- `idx_memberships_user_id`: Supports user membership lookups.
- `idx_projects_organization_id`: Supports organization-specific project queries.

## Setup

Create the database:

```sql
CREATE DATABASE worksphere_db;
```

Execute the schema:

```powershell
psql -U postgres -d worksphere_db -f server/database/schema.sql
```

## Current Implementation Notes

- Express connects to PostgreSQL through the `pg` connection pool.
- Project CRUD operations use parameterized SQL queries.
- Project records are associated with demo organization ID 1.
- Organization ID 1 is temporary and will be replaced with authenticated organization membership.
- Authentication-based tenant isolation is not yet implemented.
