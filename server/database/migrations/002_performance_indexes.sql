-- 002_performance_indexes.sql
-- Indexes supporting measured query patterns in the WorkSphere API.
-- Safe to re-run: every statement uses IF NOT EXISTS.

-- Project listing is filtered by organization and paginated.
CREATE INDEX IF NOT EXISTS idx_projects_organization_id_status
ON projects(organization_id, status);

-- Task lookups and status filtering are scoped to the authenticated tenant.
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id_status
ON tasks(organization_id, status);

-- Task activity history is paginated by tenant, task, and version.
CREATE INDEX IF NOT EXISTS idx_task_activities_org_created_at
ON task_activities(organization_id, created_at DESC);

-- Background job polling selects pending jobs by run time.
-- The existing idx_background_jobs_pending(status, run_at) covers the
-- worker's claim query; this index supports per-tenant job inspection.
CREATE INDEX IF NOT EXISTS idx_background_jobs_org_status
ON background_jobs(organization_id, status);

-- Attachment lookups by task within an organization.
CREATE INDEX IF NOT EXISTS idx_attachments_org_task
ON attachments(organization_id, task_id);
