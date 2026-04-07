-- Fix duplicate sdk_tokens rows caused by ensure_tokens being called with the
-- shared env-var default key for multiple accounts. Give each account that shares
-- a key with another account its own unique generated key.
DO $$
DECLARE
    dup RECORD;
BEGIN
    -- Find every (tracking_api_key, account_id) pair where the same tracking key
    -- appears more than once across different accounts, keeping the first-inserted
    -- row intact and regenerating keys for the rest.
    FOR dup IN
        SELECT id, account_id
        FROM sdk_tokens
        WHERE tracking_api_key IN (
            SELECT tracking_api_key
            FROM sdk_tokens
            GROUP BY tracking_api_key
            HAVING COUNT(DISTINCT account_id) > 1
        )
        ORDER BY created_at ASC
        OFFSET 1  -- skip the first (oldest) row — it keeps the original key
    LOOP
        UPDATE sdk_tokens
        SET
            tracking_api_key    = 'track_' || gen_random_uuid()::text,
            feature_flags_api_key = 'flags_' || gen_random_uuid()::text,
            updated_at          = NOW()
        WHERE id = dup.id;
    END LOOP;
END;
$$;

-- Prevent this from happening again: enforce uniqueness on the key columns.
ALTER TABLE sdk_tokens
    ADD CONSTRAINT sdk_tokens_tracking_key_unique UNIQUE (tracking_api_key),
    ADD CONSTRAINT sdk_tokens_feature_flags_key_unique UNIQUE (feature_flags_api_key);
