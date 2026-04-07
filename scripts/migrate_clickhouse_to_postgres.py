#!/usr/bin/env python3
"""
Migrate config table data from ClickHouse to Postgres.

Tables migrated:
  - experiments        (ClickHouse beaker.experiments → Postgres public.experiments)
  - user_groups        (ClickHouse beaker.user_groups  → Postgres public.user_groups)
  - feature_flags      (ClickHouse beaker.feature_flags → Postgres public.feature_flags)
  - feature_gates      (ClickHouse beaker.feature_gates → Postgres public.feature_gates)
  - cuped_configs      (ClickHouse beaker.cuped_configs → Postgres public.cuped_configs)

Not migrated (stays in ClickHouse):
  - user_assignments (analytics write-path, high volume)
  - metric_events, sessions, activity_events, replay_events, analytics_alerts

Usage:
  python3 migrate_clickhouse_to_postgres.py \\
      --clickhouse-url http://localhost:8123 \\
      --postgres-dsn "postgres://beaker:beaker@localhost:5432/beaker" \\
      [--dry-run]

Requires:
  pip install requests psycopg2-binary
"""

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone

import requests
import psycopg2
from psycopg2.extras import execute_values

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def ch_query(base_url: str, sql: str, fmt: str = "JSON") -> dict:
    """Run a ClickHouse HTTP query and return the parsed JSON response."""
    resp = requests.post(
        base_url,
        params={"database": "beaker", "default_format": fmt},
        data=sql,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def ts_to_dt(ts) -> datetime | None:
    """Convert a UNIX timestamp (int/str) to a timezone-aware datetime."""
    if ts is None:
        return None
    try:
        val = int(ts)
        if val == 0:
            return None
        return datetime.fromtimestamp(val, tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def str_or_none(val) -> str | None:
    return val if val and val != "" else None


def uuid_or_none(val) -> str | None:
    if not val or val == "":
        return None
    try:
        return str(uuid.UUID(str(val)))
    except ValueError:
        return None


def resolve_org_id(pg_cur, org_id_str: str) -> str | None:
    """Resolve a ClickHouse org_id string to a valid Postgres org UUID.
    Falls back to the first org if lookup fails."""
    cand = uuid_or_none(org_id_str)
    if cand:
        pg_cur.execute("SELECT id FROM organizations WHERE id = %s", (cand,))
        row = pg_cur.fetchone()
        if row:
            return str(row[0])
    # Fallback: first org
    pg_cur.execute("SELECT id FROM organizations ORDER BY created_at LIMIT 1")
    row = pg_cur.fetchone()
    return str(row[0]) if row else None


# ---------------------------------------------------------------------------
# per-table migration functions
# ---------------------------------------------------------------------------

def migrate_experiments(ch_url: str, pg_cur, dry_run: bool) -> int:
    print("  Fetching experiments from ClickHouse...")
    data = ch_query(ch_url, "SELECT * FROM beaker.experiments FINAL")
    rows = data.get("data", [])
    print(f"  Found {len(rows)} experiment(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            print(f"    WARN: No org found for experiment {r['id']}, skipping")
            continue

        # Parse composite hypothesis fields back into a JSON object
        hyp = None
        if r.get("hypothesis_null") or r.get("hypothesis_alternative"):
            hyp = json.dumps({
                "null_hypothesis": r.get("hypothesis_null", ""),
                "alternative_hypothesis": r.get("hypothesis_alternative", ""),
                "expected_effect_size": float(r.get("expected_effect_size", 0)),
                "metric_type": r.get("metric_type", ""),
                "significance_level": float(r.get("significance_level", 0.05)),
                "power": float(r.get("power", 0.8)),
                "minimum_sample_size": r.get("minimum_sample_size"),
            })

        values.append((
            str(uuid.UUID(r["id"])),
            org_id,
            r.get("name", ""),
            r.get("description", ""),
            r.get("status", "draft"),
            r.get("experiment_type", "a_b"),
            r.get("sampling_method", "random"),
            r.get("analysis_engine", "frequentist"),
            int(r.get("sampling_seed", 0)),
            uuid_or_none(r.get("feature_flag_id")),
            uuid_or_none(r.get("feature_gate_id")),
            r.get("health_checks", "[]"),
            hyp,
            r.get("variants", "[]"),
            r.get("user_groups", "[]"),
            r.get("primary_metric", ""),
            ts_to_dt(r.get("start_date")),
            ts_to_dt(r.get("end_date")),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(
            pg_cur,
            """
            INSERT INTO experiments
                (id, org_id, name, description, status, experiment_type,
                 sampling_method, analysis_engine, sampling_seed,
                 feature_flag_id, feature_gate_id, health_checks, hypothesis,
                 variants, user_groups, primary_metric,
                 start_date, end_date, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name            = EXCLUDED.name,
                description     = EXCLUDED.description,
                status          = EXCLUDED.status,
                experiment_type = EXCLUDED.experiment_type,
                sampling_method = EXCLUDED.sampling_method,
                analysis_engine = EXCLUDED.analysis_engine,
                sampling_seed   = EXCLUDED.sampling_seed,
                feature_flag_id = EXCLUDED.feature_flag_id,
                feature_gate_id = EXCLUDED.feature_gate_id,
                health_checks   = EXCLUDED.health_checks,
                hypothesis      = EXCLUDED.hypothesis,
                variants        = EXCLUDED.variants,
                user_groups     = EXCLUDED.user_groups,
                primary_metric  = EXCLUDED.primary_metric,
                start_date      = EXCLUDED.start_date,
                end_date        = EXCLUDED.end_date,
                updated_at      = EXCLUDED.updated_at
            """,
            values,
        )
        print(f"  Upserted {len(values)} experiment(s)")
    return len(values)


def migrate_user_groups(ch_url: str, pg_cur, dry_run: bool) -> int:
    print("  Fetching user_groups from ClickHouse...")
    data = ch_query(ch_url, "SELECT * FROM beaker.user_groups FINAL")
    rows = data.get("data", [])
    print(f"  Found {len(rows)} user_group(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            print(f"    WARN: No org found for user_group {r['id']}, skipping")
            continue
        values.append((
            str(uuid.UUID(r["id"])),
            org_id,
            r.get("name", ""),
            r.get("description", ""),
            r.get("assignment_rule", ""),
            int(r.get("size", 0)),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(
            pg_cur,
            """
            INSERT INTO user_groups
                (id, org_id, name, description, assignment_rule, size, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name            = EXCLUDED.name,
                description     = EXCLUDED.description,
                assignment_rule = EXCLUDED.assignment_rule,
                size            = EXCLUDED.size,
                updated_at      = EXCLUDED.updated_at
            """,
            values,
        )
        print(f"  Upserted {len(values)} user_group(s)")
    return len(values)


def migrate_feature_flags(ch_url: str, pg_cur, dry_run: bool) -> int:
    print("  Fetching feature_flags from ClickHouse...")
    data = ch_query(ch_url, "SELECT * FROM beaker.feature_flags FINAL")
    rows = data.get("data", [])
    print(f"  Found {len(rows)} feature_flag(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            print(f"    WARN: No org found for feature_flag {r['id']}, skipping")
            continue
        # tags and user_groups may be stored as JSON strings
        tags = r.get("tags", "[]")
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except (json.JSONDecodeError, TypeError):
                tags = []
        user_groups = r.get("user_groups", "[]")
        if isinstance(user_groups, str):
            try:
                user_groups = json.loads(user_groups)
            except (json.JSONDecodeError, TypeError):
                user_groups = []
        values.append((
            str(uuid.UUID(r["id"])),
            org_id,
            r.get("name", ""),
            r.get("description", ""),
            r.get("status", "inactive"),
            json.dumps(tags),
            r.get("environment", ""),
            r.get("owner", ""),
            json.dumps(user_groups),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(
            pg_cur,
            """
            INSERT INTO feature_flags
                (id, org_id, name, description, status, tags,
                 environment, owner, user_groups, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name        = EXCLUDED.name,
                description = EXCLUDED.description,
                status      = EXCLUDED.status,
                tags        = EXCLUDED.tags,
                environment = EXCLUDED.environment,
                owner       = EXCLUDED.owner,
                user_groups = EXCLUDED.user_groups,
                updated_at  = EXCLUDED.updated_at
            """,
            values,
        )
        print(f"  Upserted {len(values)} feature_flag(s)")
    return len(values)


def migrate_feature_gates(ch_url: str, pg_cur, dry_run: bool) -> int:
    print("  Fetching feature_gates from ClickHouse...")
    data = ch_query(ch_url, "SELECT * FROM beaker.feature_gates FINAL")
    rows = data.get("data", [])
    print(f"  Found {len(rows)} feature_gate(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            print(f"    WARN: No org found for feature_gate {r['id']}, skipping")
            continue
        values.append((
            str(uuid.UUID(r["id"])),
            org_id,
            uuid_or_none(r.get("flag_id")),
            r.get("name", ""),
            r.get("description", ""),
            r.get("status", "inactive"),
            r.get("rule", ""),
            bool(int(r.get("default_value", 0))),
            bool(int(r.get("pass_value", 1))),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(
            pg_cur,
            """
            INSERT INTO feature_gates
                (id, org_id, flag_id, name, description, status,
                 rule, default_value, pass_value, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                flag_id       = EXCLUDED.flag_id,
                name          = EXCLUDED.name,
                description   = EXCLUDED.description,
                status        = EXCLUDED.status,
                rule          = EXCLUDED.rule,
                default_value = EXCLUDED.default_value,
                pass_value    = EXCLUDED.pass_value,
                updated_at    = EXCLUDED.updated_at
            """,
            values,
        )
        print(f"  Upserted {len(values)} feature_gate(s)")
    return len(values)


def migrate_cuped_configs(ch_url: str, pg_cur, dry_run: bool) -> int:
    print("  Fetching cuped_configs from ClickHouse...")
    data = ch_query(ch_url, "SELECT * FROM beaker.cuped_configs FINAL")
    rows = data.get("data", [])
    print(f"  Found {len(rows)} cuped_config(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        exp_id = uuid_or_none(r.get("experiment_id"))
        if not exp_id:
            print(f"    WARN: invalid experiment_id in cuped_config, skipping")
            continue
        # Verify experiment exists in Postgres
        pg_cur.execute("SELECT id FROM experiments WHERE id = %s", (exp_id,))
        if not pg_cur.fetchone():
            print(f"    WARN: experiment {exp_id} not in Postgres yet, skipping cuped_config")
            continue
        values.append((
            exp_id,
            r.get("covariate_metric", ""),
            int(r.get("lookback_days", 14)),
            int(r.get("min_sample_size", 100)),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(
            pg_cur,
            """
            INSERT INTO cuped_configs
                (experiment_id, covariate_metric, lookback_days, min_sample_size,
                 created_at, updated_at)
            VALUES %s
            ON CONFLICT (experiment_id) DO UPDATE SET
                covariate_metric = EXCLUDED.covariate_metric,
                lookback_days    = EXCLUDED.lookback_days,
                min_sample_size  = EXCLUDED.min_sample_size,
                updated_at       = EXCLUDED.updated_at
            """,
            values,
        )
        print(f"  Upserted {len(values)} cuped_config(s)")
    return len(values)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Migrate config tables from ClickHouse to Postgres"
    )
    parser.add_argument(
        "--clickhouse-url",
        default="http://localhost:8123",
        help="ClickHouse HTTP endpoint (default: http://localhost:8123)",
    )
    parser.add_argument(
        "--postgres-dsn",
        default="postgres://beaker:beaker@localhost:5432/beaker",
        help="Postgres connection DSN",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch from ClickHouse but do NOT write to Postgres",
    )
    parser.add_argument(
        "--table",
        choices=["experiments", "user_groups", "feature_flags", "feature_gates", "cuped_configs", "all"],
        default="all",
        help="Which table(s) to migrate (default: all)",
    )
    args = parser.parse_args()

    if args.dry_run:
        print("DRY RUN — no data will be written to Postgres")

    print(f"Connecting to ClickHouse at {args.clickhouse_url} ...")
    # Quick connectivity check
    try:
        ch_query(args.clickhouse_url, "SELECT 1")
    except Exception as exc:
        print(f"ERROR: Cannot reach ClickHouse: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to Postgres ...")
    conn = psycopg2.connect(args.postgres_dsn)
    conn.autocommit = False
    cur = conn.cursor()

    tables = (
        ["experiments", "user_groups", "feature_flags", "feature_gates", "cuped_configs"]
        if args.table == "all"
        else [args.table]
    )

    total = 0
    try:
        for table in tables:
            print(f"\n[{table}]")
            if table == "experiments":
                n = migrate_experiments(args.clickhouse_url, cur, args.dry_run)
            elif table == "user_groups":
                n = migrate_user_groups(args.clickhouse_url, cur, args.dry_run)
            elif table == "feature_flags":
                n = migrate_feature_flags(args.clickhouse_url, cur, args.dry_run)
            elif table == "feature_gates":
                n = migrate_feature_gates(args.clickhouse_url, cur, args.dry_run)
            elif table == "cuped_configs":
                n = migrate_cuped_configs(args.clickhouse_url, cur, args.dry_run)
            else:
                n = 0
            total += n

        if not args.dry_run:
            conn.commit()
            print(f"\n✓ Migration complete — {total} row(s) upserted across {len(tables)} table(s)")
        else:
            conn.rollback()
            print(f"\n✓ Dry run complete — {total} row(s) would be migrated across {len(tables)} table(s)")

    except Exception as exc:
        conn.rollback()
        print(f"\nERROR during migration: {exc}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
