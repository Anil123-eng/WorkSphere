
-- Assessment 08: Third-party integrations

-- Ensure tasks can be referenced together with their organization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_id_org_unique
ON tasks(id, organization_id);

-- Store metadata for files uploaded to object storage.
CREATE TABLE IF NOT EXISTS attachments (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
    project_id BIGINT,
    task_id BIGINT,
    uploaded_by BIGINT
        REFERENCES users(id) ON DELETE SET NULL,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 's3',
    storage_key TEXT NOT NULL UNIQUE,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(150) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (project_id IS NOT NULL OR task_id IS NOT NULL),

    FOREIGN KEY (project_id, organization_id)
        REFERENCES projects(id, organization_id) ON DELETE CASCADE,

    FOREIGN KEY (task_id, organization_id)
        REFERENCES tasks(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_org
ON attachments(organization_id);

CREATE INDEX IF NOT EXISTS idx_attachments_task
ON attachments(task_id);

-- Store verified incoming webhook events.
CREATE TABLE IF NOT EXISTS webhook_events (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(100) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(150) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'processed', 'failed')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    last_error TEXT,

    UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status
ON webhook_events(status);
