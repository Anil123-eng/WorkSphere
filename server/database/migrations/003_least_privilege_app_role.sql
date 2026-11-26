-- Provision the runtime role using the password supplied to server/migrate.cjs.
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

GRANT USAGE ON SCHEMA public TO worksphere_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO worksphere_app;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO worksphere_app;
REVOKE ALL ON TABLE schema_migrations FROM worksphere_app;
REVOKE ALL ON SEQUENCE schema_migrations_id_seq FROM worksphere_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO worksphere_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO worksphere_app;

ALTER ROLE worksphere_app
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
