"""Migrate config tables from ClickHouse to Postgres.

Tables migrated:
  experiments, user_groups, feature_flags, feature_gates, cuped_configs

Not migrated (analytics write-path, stays in ClickHouse):
  user_assignments, metric_events, sessions, activity_events, replay_events

Usage (Docker):
    docker compose run --rm scripts migrate-clickhouse-to-postgres
    docker compose run --rm scripts migrate-clickhouse-to-postgres --dry-run
    docker compose run --rm scripts migrate-clickhouse-to-postgres --table experiments
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone

import click
import httpx
import psycopg2
from psycopg2.extras import execute_values


# ---------------------------------------------------------------------------
# ClickHouse helper
# ---------------------------------------------------------------------------

def ch_query(base_url: str, sql: str) -> dict:
    resp = httpx.post(
        base_url,
        params={"database": "beaker", "default_format": "JSON"},
        content=sql,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Type-coercion helpers
# ---------------------------------------------------------------------------

def ts_to_dt(ts) -> datetime | None:
    if ts is None:
        return None
    try:
        val = int(ts)
        return datetime.fromtimestamp(val, tz=timezone.utc) if val else None
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
    cand = uuid_or_none(org_id_str)
    if cand:
        pg_cur.execute("SELECT id FROM organizations WHERE id = %s", (cand,))
        if row := pg_cur.fetchone():
            return str(row[0])
    pg_cur.execute("SELECT id FROM organizations ORDER BY created_at LIMIT 1")
    row = pg_cur.fetchone()
    return str(row[0]) if row else None


# ---------------------------------------------------------------------------
# Per-table migration functions
# ---------------------------------------------------------------------------

def migrate_experiments(ch_url: str, pg_cur, dry_run: bool) -> int:
    click.echo("  Fetching experiments from ClickHouse...")
    rows = ch_query(ch_url, "SELECT * FROM beaker.experiments FINAL").get("data", [])
    click.echo(f"  Found {len(rows)} experiment(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            click.echo(f"    WARN: No org for experiment {r['id']}, skipping", err=True)
            continue
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
            str(uuid.UUID(r["id"])), org_id,
            r.get("name", ""), r.get("description", ""), r.get("status", "draft"),
            r.get("experiment_type", "a_b"), r.get("sampling_method", "random"),
            r.get("analysis_engine", "frequentist"), int(r.get("sampling_seed", 0)),
            uuid_or_none(r.get("feature_flag_id")), uuid_or_none(r.get("feature_gate_id")),
            r.get("health_checks", "[]"), hyp,
            r.get("variants", "[]"), r.get("user_groups", "[]"), r.get("primary_metric", ""),
            ts_to_dt(r.get("start_date")), ts_to_dt(r.get("end_date")),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(pg_cur, """
            INSERT INTO experiments
                (id, org_id, name, description, status, experiment_type,
                 sampling_method, analysis_engine, sampling_seed,
                 feature_flag_id, feature_gate_id, health_checks, hypothesis,
                 variants, user_groups, primary_metric,
                 start_date, end_date, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name=EXCLUDED.name, description=EXCLUDED.description,
                status=EXCLUDED.status, experiment_type=EXCLUDED.experiment_type,
                sampling_method=EXCLUDED.sampling_method, analysis_engine=EXCLUDED.analysis_engine,
                sampling_seed=EXCLUDED.sampling_seed, feature_flag_id=EXCLUDED.feature_flag_id,
                feature_gate_id=EXCLUDED.feature_gate_id, health_checks=EXCLUDED.health_checks,
                hypothesis=EXCLUDED.hypothesis, variants=EXCLUDED.variants,
                user_groups=EXCLUDED.user_groups, primary_metric=EXCLUDED.primary_metric,
                start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
                updated_at=EXCLUDED.updated_at
        """, values)
        click.echo(f"  Upserted {len(values)} experiment(s)")
    return len(values)


def migrate_user_groups(ch_url: str, pg_cur, dry_run: bool) -> int:
    click.echo("  Fetching user_groups from ClickHouse...")
    rows = ch_query(ch_url, "SELECT * FROM beaker.user_groups FINAL").get("data", [])
    click.echo(f"  Found {len(rows)} user_group(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            click.echo(f"    WARN: No org for user_group {r['id']}, skipping", err=True)
            continue
        values.append((
            str(uuid.UUID(r["id"])), org_id,
            r.get("name", ""), r.get("description", ""), r.get("assignment_rule", ""),
            int(r.get("size", 0)),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(pg_cur, """
            INSERT INTO user_groups
                (id, org_id, name, description, assignment_rule, size, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name=EXCLUDED.name, description=EXCLUDED.description,
                assignment_rule=EXCLUDED.assignment_rule, size=EXCLUDED.size,
                updated_at=EXCLUDED.updated_at
        """, values)
        click.echo(f"  Upserted {len(values)} user_group(s)")
    return len(values)


def migrate_feature_flags(ch_url: str, pg_cur, dry_run: bool) -> int:
    click.echo("  Fetching feature_flags from ClickHouse...")
    rows = ch_query(ch_url, "SELECT * FROM beaker.feature_flags FINAL").get("data", [])
    click.echo(f"  Found {len(rows)} feature_flag(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            click.echo(f"    WARN: No org for feature_flag {r['id']}, skipping", err=True)
            continue
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
            str(uuid.UUID(r["id"])), org_id,
            r.get("name", ""), r.get("description", ""), r.get("status", "inactive"),
            json.dumps(tags), r.get("environment", ""), r.get("owner", ""),
            json.dumps(user_groups),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(pg_cur, """
            INSERT INTO feature_flags
                (id, org_id, name, description, status, tags,
                 environment, owner, user_groups, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name=EXCLUDED.name, description=EXCLUDED.description,
                status=EXCLUDED.status, tags=EXCLUDED.tags,
                environment=EXCLUDED.environment, owner=EXCLUDED.owner,
                user_groups=EXCLUDED.user_groups, updated_at=EXCLUDED.updated_at
        """, values)
        click.echo(f"  Upserted {len(values)} feature_flag(s)")
    return len(values)


def migrate_feature_gates(ch_url: str, pg_cur, dry_run: bool) -> int:
    click.echo("  Fetching feature_gates from ClickHouse...")
    rows = ch_query(ch_url, "SELECT * FROM beaker.feature_gates FINAL").get("data", [])
    click.echo(f"  Found {len(rows)} feature_gate(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        org_id = resolve_org_id(pg_cur, r.get("org_id", ""))
        if not org_id:
            click.echo(f"    WARN: No org for feature_gate {r['id']}, skipping", err=True)
            continue
        values.append((
            str(uuid.UUID(r["id"])), org_id, uuid_or_none(r.get("flag_id")),
            r.get("name", ""), r.get("description", ""), r.get("status", "inactive"),
            r.get("rule", ""), bool(int(r.get("default_value", 0))), bool(int(r.get("pass_value", 1))),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(pg_cur, """
            INSERT INTO feature_gates
                (id, org_id, flag_id, name, description, status,
                 rule, default_value, pass_value, created_at, updated_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                flag_id=EXCLUDED.flag_id, name=EXCLUDED.name,
                description=EXCLUDED.description, status=EXCLUDED.status,
                rule=EXCLUDED.rule, default_value=EXCLUDED.default_value,
                pass_value=EXCLUDED.pass_value, updated_at=EXCLUDED.updated_at
        """, values)
        click.echo(f"  Upserted {len(values)} feature_gate(s)")
    return len(values)


def migrate_cuped_configs(ch_url: str, pg_cur, dry_run: bool) -> int:
    click.echo("  Fetching cuped_configs from ClickHouse...")
    rows = ch_query(ch_url, "SELECT * FROM beaker.cuped_configs FINAL").get("data", [])
    click.echo(f"  Found {len(rows)} cuped_config(s)")
    if not rows or dry_run:
        return len(rows)

    values = []
    for r in rows:
        exp_id = uuid_or_none(r.get("experiment_id"))
        if not exp_id:
            click.echo("    WARN: invalid experiment_id in cuped_config, skipping", err=True)
            continue
        pg_cur.execute("SELECT id FROM experiments WHERE id = %s", (exp_id,))
        if not pg_cur.fetchone():
            click.echo(f"    WARN: experiment {exp_id} not in Postgres, skipping cuped_config", err=True)
            continue
        values.append((
            exp_id, r.get("covariate_metric", ""),
            int(r.get("lookback_days", 14)), int(r.get("min_sample_size", 100)),
            ts_to_dt(r.get("created_at")) or datetime.now(tz=timezone.utc),
            ts_to_dt(r.get("updated_at")) or datetime.now(tz=timezone.utc),
        ))

    if values:
        execute_values(pg_cur, """
            INSERT INTO cuped_configs
                (experiment_id, covariate_metric, lookback_days, min_sample_size,
                 created_at, updated_at)
            VALUES %s
            ON CONFLICT (experiment_id) DO UPDATE SET
                covariate_metric=EXCLUDED.covariate_metric,
                lookback_days=EXCLUDED.lookback_days,
                min_sample_size=EXCLUDED.min_sample_size,
                updated_at=EXCLUDED.updated_at
        """, values)
        click.echo(f"  Upserted {len(values)} cuped_config(s)")
    return len(values)


TABLE_FUNCS = {
    "experiments":   migrate_experiments,
    "user_groups":   migrate_user_groups,
    "feature_flags": migrate_feature_flags,
    "feature_gates": migrate_feature_gates,
    "cuped_configs": migrate_cuped_configs,
}

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.command()
@click.option("--clickhouse-url", default="http://clickhouse:8123", show_default=True,
              envvar="CLICKHOUSE_URL", help="ClickHouse HTTP endpoint.")
@click.option("--postgres-dsn",
              default="postgres://beaker:beaker@postgres:5432/beaker",
              show_default=True, envvar="DATABASE_URL", help="Postgres connection DSN.")
@click.option("--table",
              type=click.Choice([*TABLE_FUNCS, "all"], case_sensitive=False),
              default="all", show_default=True, help="Table(s) to migrate.")
@click.option("--dry-run", is_flag=True, help="Fetch from ClickHouse but skip Postgres writes.")
def cli(clickhouse_url: str, postgres_dsn: str, table: str, dry_run: bool) -> None:
    """Migrate config tables from ClickHouse to Postgres."""
    if dry_run:
        click.echo("DRY RUN — no data will be written to Postgres")

    click.echo(f"Checking ClickHouse connectivity at {clickhouse_url} ...")
    try:
        ch_query(clickhouse_url, "SELECT 1")
    except Exception as exc:
        raise click.ClickException(f"Cannot reach ClickHouse: {exc}")

    click.echo("Connecting to Postgres...")
    try:
        conn = psycopg2.connect(postgres_dsn)
    except Exception as exc:
        raise click.ClickException(f"Cannot connect to Postgres: {exc}")

    conn.autocommit = False
    cur = conn.cursor()

    tables = list(TABLE_FUNCS) if table == "all" else [table]
    total = 0

    try:
        for tbl in tables:
            click.echo(f"\n[{tbl}]")
            total += TABLE_FUNCS[tbl](clickhouse_url, cur, dry_run)

        if dry_run:
            conn.rollback()
            click.echo(f"\nDry run complete — {total} row(s) would be migrated across {len(tables)} table(s)")
        else:
            conn.commit()
            click.echo(f"\nMigration complete — {total} row(s) upserted across {len(tables)} table(s)")

    except Exception as exc:
        conn.rollback()
        click.echo(f"\nERROR during migration: {exc}", err=True)
        sys.exit(1)
    finally:
        cur.close()
        conn.close()
