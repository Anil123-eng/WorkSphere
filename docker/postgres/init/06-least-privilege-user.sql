-- WorkSphere least-privilege database role.
-- Creates a dedicated, non-superuser application role that the API and worker
-- connect as. The bootstrap superuser (POSTGRES_USER) still owns the schema;
-- the application role is granted only the privileges it needs.
\getenv worksphere_app_password WORKSPHERE_APP_PASSWORD
SELECT set_config(
  'worksphere.app_password',
  :'worksphere_app_password',
  false
) AS configured_password \gset

DO $$
DECLARE
  app_password text := current_setting('worksphere.app_password', true);
BEGIN
  IF app_password IS NULL OR app_password !~ '^[A-Za-z0-9_-]{32,}$' THEN
    RAISE EXCEPTION 'WORKSPHERE_APP_PASSWORD must be at least 32 URL-safe characters';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'worksphere_app') THEN
    EXECUTE format(
      'CREATE ROLE worksphere_app LOGIN PASSWORD %L',
      app_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE worksphere_app LOGIN PASSWORD %L',
      app_password
    );
  END IF;

  EXECUTE format(
    'REVOKE ALL ON DATABASE %I FROM PUBLIC',
    current_database()
  );
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO worksphere_app',
    current_database()
  );
END $$;

-- Allow the app role to connect to the database and use the public schema.
GRANT USAGE ON SCHEMA public TO worksphere_app;

-- Table-level privileges: enough for the application to operate, nothing more.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO worksphere_app;

-- Sequence privileges (needed for BIGSERIAL primary-key inserts).
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO worksphere_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO worksphere_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO worksphere_app;

-- Keep the role out of superuser/bypassrls/createrole/createdb.
ALTER ROLE worksphere_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
