-- Remove event-specific columns from the parent table
ALTER TABLE telemetry_definitions
    DROP COLUMN name,
    DROP COLUMN event_type,
    DROP COLUMN selector,
    DROP COLUMN url_pattern,
    DROP COLUMN visual_guide;

-- Child table: one row per event spec
CREATE TABLE telemetry_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID NOT NULL REFERENCES telemetry_definitions(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    event_type    TEXT NOT NULL DEFAULT 'custom',
    selector      TEXT,
    url_pattern   TEXT,
    visual_guide  TEXT
);

CREATE INDEX idx_telemetry_events_definition_id ON telemetry_events(definition_id);
