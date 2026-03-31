CREATE TABLE account_integrations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    config           JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON account_integrations(account_id, integration_type);
CREATE INDEX ON account_integrations(account_id, enabled);

ALTER TABLE experiments ADD COLUMN IF NOT EXISTS jira_issue_key TEXT;
