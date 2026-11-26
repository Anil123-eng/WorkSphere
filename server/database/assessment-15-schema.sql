-- Assessment 15: optimistic task updates and durable activity history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_id_org_unique
ON tasks(id, organization_id);

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
        CHECK (version >= 1);

CREATE TABLE IF NOT EXISTS task_activities (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL
        REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id BIGINT
        REFERENCES users(id) ON DELETE SET NULL,
    activity_type VARCHAR(30) NOT NULL
        CHECK (activity_type IN ('created', 'status_updated', 'baseline_snapshot')),
    task_version INTEGER NOT NULL CHECK (task_version >= 1),
    previous_state JSONB,
    new_state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_task_activities_task_version
        UNIQUE (task_id, task_version)
);

-- Activity rows are historical records and must outlive deleted tasks/projects.
ALTER TABLE task_activities
    DROP CONSTRAINT IF EXISTS fk_task_activities_task_org;

CREATE INDEX IF NOT EXISTS idx_task_activities_org_task_version
ON task_activities(organization_id, task_id, task_version);

INSERT INTO task_activities
    (task_id, organization_id, actor_user_id, activity_type, task_version,
     previous_state, new_state, created_at)
SELECT id, organization_id, created_by, 'baseline_snapshot', version,
       NULL, to_jsonb(tasks), CURRENT_TIMESTAMP
FROM tasks
ON CONFLICT (task_id, task_version) DO NOTHING;
