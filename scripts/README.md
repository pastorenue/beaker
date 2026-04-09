# Beaker Scripts

CLI tooling for the Beaker experiment platform. Packaged as a Python library using [uv](https://docs.astral.sh/uv/) and exposed as first-class CLI commands via [Click](https://click.palletsprojects.com/).

## Package layout

```
scripts/
├── Dockerfile                        # python:3.12-slim image with uv
├── pyproject.toml                    # package manifest and entry points
├── src/beaker_scripts/
│   ├── client.py                     # shared httpx BeakerClient + auth
│   ├── generate_live_data.py
│   ├── generate_cuped_data.py
│   ├── generate_test_users_csv.py
│   └── migrate_clickhouse_to_postgres.py
├── seed_test_postgres.py             # standalone helper (see below)
└── test_postgres_init.sql            # init schema for postgres-test container
```

## Running commands

### Via Make (recommended)

Make targets are defined in the root [Makefile](../Makefile) and wrap `docker compose run --rm scripts` for each command. All targets accept an `ARGS` variable for passing extra flags.

```bash
# Build the image (first time or after dependency/source changes)
make scripts-build

# Run with defaults
make generate-live-data
make generate-cuped-data
make generate-test-users-csv
make migrate-clickhouse-to-postgres

# Pass extra flags via ARGS
make generate-live-data          ARGS="02bf6c74-4220-45cb-92ad-3fb79275f683 --interval 1.0"
make generate-cuped-data         ARGS="--users 1000 --lift 0.10"
make generate-test-users-csv     ARGS="--count 500 --output /tmp/users.csv"
make migrate-clickhouse-to-postgres ARGS="--dry-run"
```

### Via Docker Compose directly

```bash
# Build the image
docker compose build scripts

# Run any command
docker compose run --rm scripts <command> [OPTIONS]

# Show help for any command
docker compose run --rm scripts generate-live-data --help
```

The `scripts` service connects to the same Docker network as `backend`, `clickhouse`, and `postgres`, so all service hostnames resolve automatically.

### Available commands

| Make target | CLI command | Description |
|---|---|---|
| `make generate-live-data` | `generate-live-data` | Continuously simulate real user sessions and A/B conversions |
| `make generate-cuped-data` | `generate-cuped-data` | Generate correlated pre/post metric events for CUPED analysis |
| `make generate-test-users-csv` | `generate-test-users-csv` | Write a dummy-user CSV for the CSV data-source feature |
| `make migrate-clickhouse-to-postgres` | `migrate-clickhouse-to-postgres` | One-time migration of config tables from ClickHouse to Postgres |

---

## Command reference

### `generate-live-data`

Runs a continuous loop that simulates real users visiting an experiment. Each user:
1. Is assigned to a variant via `/user-groups/assign`
2. Completes a full browsing session (one session, 60–80 activity events drawn from a metric-specific event pool)
3. Optionally fires a conversion metric event based on per-variant conversion rates

```bash
# Stream live data for a specific experiment
make generate-live-data ARGS="02bf6c74-4220-45cb-92ad-3fb79275f683"

# Use the most recent experiment; slow down the loop
make generate-live-data ARGS="--interval 2.0"

# Override minimum events per session
make generate-live-data ARGS="--min-events 80"
```

| Option | Default | Env var | Description |
|---|---|---|---|
| `EXPERIMENT_ID` | latest | — | Experiment UUID to target |
| `--interval` | `0.5` | — | Seconds to sleep between users |
| `--min-events` | `60` | — | Minimum activity events per session |
| `--base-url` | `http://localhost:8080` | `BEAKER_BASE_URL` | API base URL |
| `--email` | `admin@beaker.local` | `BEAKER_EMAIL` | Auth email |
| `--password` | `admin` | `BEAKER_PASSWORD` | Auth password |

**Activity event pools** are selected automatically from the experiment's `primary_metric`. The following metric name fragments are recognised: `activation`, `conversion`, `retention`, `engagement`, `revenue`. Any unrecognised metric falls back to a generic pool.

> **Rate limiting:** The Docker Compose override sets `RATE_LIMIT_TRACKING=6000` (requests/min) on the backend service so the burst of session events is not throttled during local simulation.

---

### `generate-cuped-data`

Creates a fresh experiment and generates synthetic users with a correlated pre/post metric, allowing you to validate CUPED variance reduction in the analysis engine.

```bash
# Default: 500 users, 5% lift, 0.8 correlation
make generate-cuped-data

# Custom parameters
make generate-cuped-data ARGS="--users 1000 --lift 0.10 --correlation 0.6"
```

| Option | Default | Description |
|---|---|---|
| `--users` | `500` | Number of simulated users |
| `--pre-mean` | `100.0` | Mean of the pre-experiment covariate |
| `--pre-std` | `30.0` | Std-dev of the pre-experiment covariate |
| `--correlation` | `0.8` | Correlation between covariate and outcome (0–1) |
| `--lift` | `0.05` | Treatment effect fraction (e.g. `0.05` = 5 % lift) |

After running, follow the printed instructions to enable CUPED in the UI for the generated experiment.

---

### `generate-test-users-csv`

Writes a CSV of dummy users (`user_id`, `email`, `name`) for testing the CSV data-source import feature.

```bash
# Default: 100 rows written to ./test_users.csv inside the container
make generate-test-users-csv

# Custom count and path (mount a volume to retrieve the file on the host)
docker compose run --rm -v $(pwd)/output:/output scripts \
    generate-test-users-csv --count 500 --output /output/users.csv
```

| Option | Default | Description |
|---|---|---|
| `--count` | `100` | Number of rows |
| `--output` | `./test_users.csv` | Output file path |

---

### `migrate-clickhouse-to-postgres`

One-shot migration of config tables from the legacy ClickHouse store to Postgres. Uses `ON CONFLICT … DO UPDATE` so it is safe to re-run.

Tables migrated: `experiments`, `user_groups`, `feature_flags`, `feature_gates`, `cuped_configs`

```bash
# Migrate everything (uses Docker service URLs by default)
make migrate-clickhouse-to-postgres

# Preview what would be migrated without writing anything
make migrate-clickhouse-to-postgres ARGS="--dry-run"

# Migrate a single table
make migrate-clickhouse-to-postgres ARGS="--table experiments"
```

| Option | Default | Env var | Description |
|---|---|---|---|
| `--clickhouse-url` | `http://clickhouse:8123` | `CLICKHOUSE_URL` | ClickHouse HTTP endpoint |
| `--postgres-dsn` | `postgres://beaker:beaker@postgres:5432/beaker` | `DATABASE_URL` | Postgres DSN |
| `--table` | `all` | — | `all` or one of the table names above |
| `--dry-run` | off | — | Fetch from ClickHouse but skip Postgres writes |

---

## Running outside Docker (local dev)

Install the package with uv into a local virtual environment:

```bash
cd scripts
uv venv
uv pip install -e .
```

Then set the API URL to point at your local backend:

```bash
export BEAKER_BASE_URL=http://localhost:8080

generate-live-data --help
generate-cuped-data --help
```

---

## Standalone scripts (not part of the package)

These scripts are not included in the uv package because they operate on the Docker daemon or raw database connections rather than the Beaker HTTP API.

| Script | Description |
|---|---|
| `seed_test_postgres.py` | Seeds the `postgres-test` container with dummy rows via `docker compose exec`. Run with `python scripts/seed_test_postgres.py [--count 1000] [--truncate]`. |
| `test_postgres_init.sql` | Init schema mounted into the `postgres-test` container on first start. |
| `verify.sh` | Shell smoke-test to check that all services are reachable. |
