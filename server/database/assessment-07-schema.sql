
-- WorkSphere Assessment 07
-- Tasks and persistent background job queue

-- Ensure projects can be referenced together with their organization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_id_org_unique
ON projects(id, organization_id);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'completed')),
    due_date DATE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tasks_project_org
        FOREIGN KEY (project_id, organization_id)
        REFERENCES projects(id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_project
ON tasks(organization_id, project_id);

-- Persistent background job queue
CREATE TABLE IF NOT EXISTS background_jobs (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
    job_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'dead')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_pending
ON background_jobs(status, run_at);
