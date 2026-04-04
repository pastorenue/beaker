-- Initialisation script for the postgres-test container.
-- Mounted at /docker-entrypoint-initdb.d/init.sql and run automatically on first start.

CREATE TABLE IF NOT EXISTS test_users (
    user_id    VARCHAR(255) PRIMARY KEY,
    email      VARCHAR(255),
    name       VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
