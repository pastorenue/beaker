ALTER TABLE user_groups
    ADD COLUMN IF NOT EXISTS data_source_type TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS data_source_config JSONB NOT NULL DEFAULT '{}';

ALTER TABLE experiments
    ADD COLUMN IF NOT EXISTS requires_existing_users BOOLEAN NOT NULL DEFAULT FALSE;
