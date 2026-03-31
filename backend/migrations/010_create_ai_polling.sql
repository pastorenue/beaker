CREATE TABLE ai_polling_insights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    experiment_id   UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    polled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    severity        TEXT NOT NULL,
    insight_type    TEXT NOT NULL,
    headline        TEXT NOT NULL,
    detail          TEXT NOT NULL DEFAULT '',
    ai_narrative    TEXT,
    p_value         DOUBLE PRECISION,
    effect_size     DOUBLE PRECISION,
    sample_size     BIGINT,
    auto_actioned   BOOLEAN NOT NULL DEFAULT FALSE,
    dismissed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON ai_polling_insights(experiment_id, polled_at DESC);
CREATE INDEX ON ai_polling_insights(account_id, severity, created_at DESC);
