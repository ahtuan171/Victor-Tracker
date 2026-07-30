-- Runs once, on the first `docker compose up`, from the Postgres image's initdb hook.
--
-- workflow.md stage 5 requires pytest to run against a dedicated test database. Creating it here
-- rather than in conftest.py means the harness (T017) never needs CREATE DATABASE privileges and can
-- never point at the development database by accident.
--
-- Re-running this on an existing volume is a no-op: initdb hooks only fire on an empty data
-- directory. To recreate it, `docker compose down -v`.

SELECT 'CREATE DATABASE creatorhub_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'creatorhub_test') \gexec
