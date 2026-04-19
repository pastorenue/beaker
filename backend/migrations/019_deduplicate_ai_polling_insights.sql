-- Deduplicate existing active non-guardrail rows (keep newest polled_at)
DELETE FROM ai_polling_insights
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY experiment_id, insight_type
                   ORDER BY polled_at DESC
               ) AS rn
        FROM ai_polling_insights
        WHERE dismissed_at IS NULL AND insight_type <> 'guardrail'
    ) ranked
    WHERE rn > 1
);

-- Deduplicate existing active guardrail rows (keep newest polled_at)
DELETE FROM ai_polling_insights
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY experiment_id, insight_type
                   ORDER BY polled_at DESC
               ) AS rn
        FROM ai_polling_insights
        WHERE dismissed_at IS NULL AND insight_type = 'guardrail'
    ) ranked
    WHERE rn > 1
);

-- Add metric_name column for per-metric guardrail deduplication
ALTER TABLE ai_polling_insights ADD COLUMN IF NOT EXISTS metric_name TEXT;

-- Unique index for non-guardrail types: one active insight per (experiment, type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_insights_active_non_guardrail
    ON ai_polling_insights (experiment_id, insight_type)
    WHERE dismissed_at IS NULL AND insight_type <> 'guardrail';

-- Unique index for guardrail type: one active insight per (experiment, type, metric)
CREATE UNIQUE INDEX IF NOT EXISTS uq_insights_active_guardrail
    ON ai_polling_insights (experiment_id, insight_type, metric_name)
    WHERE dismissed_at IS NULL AND insight_type = 'guardrail';
