#!/usr/bin/env python3
"""Seed the postgres-test container with dummy user rows.

Connects via `docker compose exec` — no extra Python packages required.

Usage:
    python scripts/seed_test_postgres.py [--count 1000] [--truncate]
"""

import argparse
import subprocess
import sys
import uuid


CONTAINER = "postgres-test"
PSQL_USER = "testuser"
PSQL_DB = "testdb"
BATCH_SIZE = 500


def run_sql(sql: str) -> subprocess.CompletedProcess:
    """Pipe SQL to psql inside the postgres-test container."""
    cmd = [
        "docker", "compose", "exec", "-T", CONTAINER,
        "psql", "-U", PSQL_USER, "-d", PSQL_DB,
    ]
    result = subprocess.run(
        cmd,
        input=sql,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"psql error:\n{result.stderr}", file=sys.stderr)
        sys.exit(result.returncode)
    return result


def build_insert(rows: list[tuple[str, str, str]]) -> str:
    values = ", ".join(
        f"('{uid}', '{email}', '{name}')"
        for uid, email, name in rows
    )
    return (
        f"INSERT INTO test_users (user_id, email, name) VALUES {values} "
        f"ON CONFLICT DO NOTHING;"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Seed the postgres-test container with dummy users."
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1000,
        help="Number of user rows to insert (default: 1000)",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Truncate the table before seeding",
    )
    args = parser.parse_args()

    if args.count < 1:
        print("Error: --count must be at least 1", file=sys.stderr)
        sys.exit(1)

    if args.truncate:
        print("Truncating test_users table...")
        run_sql("TRUNCATE TABLE test_users;")

    print(f"Inserting {args.count} rows in batches of {BATCH_SIZE}...")
    rows_generated = 0
    batch: list[tuple[str, str, str]] = []

    for n in range(1, args.count + 1):
        batch.append((str(uuid.uuid4()), f"user_{n}@example.com", f"Test User {n}"))
        if len(batch) == BATCH_SIZE:
            run_sql(build_insert(batch))
            rows_generated += len(batch)
            batch = []

    if batch:
        run_sql(build_insert(batch))
        rows_generated += len(batch)

    # Verify
    result = run_sql("SELECT COUNT(*) FROM test_users;")
    # psql output looks like: " count \n-------\n  1000\n(1 row)\n"
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    count_line = next((l for l in lines if l.isdigit()), None)
    count_str = count_line if count_line else result.stdout.strip()
    print(f"Done. Rows in test_users: {count_str}")


if __name__ == "__main__":
    main()
