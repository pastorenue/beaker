CREATE TABLE telemetry_definitions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    experiment_id  UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    description    TEXT NOT NULL DEFAULT '',
    event_type     TEXT NOT NULL DEFAULT 'custom',
    name           TEXT NOT NULL,
    selector       TEXT,
    url_pattern    TEXT,
    visual_guide   TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_definitions_account_id    ON telemetry_definitions(account_id);
CREATE INDEX idx_telemetry_definitions_experiment_id ON telemetry_definitions(experiment_id);
CREATE INDEX idx_telemetry_definitions_active        ON telemetry_definitions(account_id, experiment_id, is_active);
