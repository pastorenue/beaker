CREATE TABLE user_flows (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    experiment_id UUID         NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    steps         JSONB        NOT NULL DEFAULT '[]',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_flows_experiment ON user_flows(experiment_id);
CREATE INDEX idx_user_flows_account    ON user_flows(account_id);
