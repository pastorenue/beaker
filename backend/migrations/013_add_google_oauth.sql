-- 1. Social auth: make password_hash nullable (Google-only users have no password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Link Google identity to a user row
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- 3. Short-lived CSRF state store for OAuth redirects
CREATE TABLE IF NOT EXISTS oauth_states (
    state       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remember_me BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);
