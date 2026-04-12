-- Move description from telemetry_definitions to telemetry_events
ALTER TABLE telemetry_events ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE telemetry_definitions DROP COLUMN description;
