"""CUPED variance-reduction test data generator.

Creates an experiment, assigns users, and records correlated pre/post-experiment
metric events so the CUPED analysis engine has realistic data to work with.

Usage (Docker):
    docker compose run --rm scripts generate-cuped-data [OPTIONS]
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

import click

from beaker_scripts.client import BeakerClient, api_options


def _create_experiment(client: BeakerClient) -> dict:
    import time
    click.echo("Creating CUPED test experiment...")
    exp = client.post("/experiments", json={
        "name": f"CUPED Test {int(time.time())}",
        "description": "Experiment for testing CUPED variance reduction",
        "variants": [
            {"name": "control",   "description": "Control Group",   "allocation_percent": 50.0, "is_control": True},
            {"name": "treatment", "description": "Treatment Group", "allocation_percent": 50.0, "is_control": False},
        ],
        "primary_metric": "revenue",
        "user_groups": [],
        "hypothesis": {
            "metric_type": "continuous",
            "null_hypothesis": "No difference",
            "alternative_hypothesis": "Treatment > Control",
            "expected_effect_size": 0.05,
            "significance_level": 0.05,
            "power": 0.8,
        },
    })
    if not exp:
        raise click.ClickException("Failed to create experiment.")
    return exp


def _ensure_group(client: BeakerClient) -> dict:
    click.echo("Ensuring CUPED test group exists...")
    groups = client.get("/user-groups")
    if groups:
        for g in groups:
            if g.get("name") == "CUPED Test Group":
                return g
    group = client.post("/user-groups", json={
        "name": "CUPED Test Group",
        "description": "Group for CUPED testing",
        "assignment_rule": "random",
    })
    if not group:
        raise click.ClickException("Failed to create user group.")
    return group


def _generate_data(
    client: BeakerClient,
    exp_id: str,
    group_id: str,
    num_users: int,
    pre_mean: float,
    pre_std: float,
    correlation: float,
    lift: float,
) -> None:
    click.echo(f"Generating data for {num_users} users...")

    pre_experiment_time = datetime.now(tz=timezone.utc) - timedelta(days=15)

    for i in range(num_users):
        import time as _time
        user_id = f"user_{i}_{int(_time.time())}"

        # 1. Assign user — the API decides the variant via hash/random
        resp = client.post("/user-groups/assign", json={
            "user_id": user_id,
            "experiment_id": exp_id,
            "group_id": group_id,
        })
        if not resp or "variant" not in resp:
            click.echo(f"  Failed to assign user {user_id}, skipping.", err=True)
            continue
        variant = resp["variant"]

        # 2. Pre-experiment covariate (backdated 15 days)
        pre_spend = max(0.0, random.gauss(pre_mean, pre_std))
        client.post("/events", json={
            "experiment_id": exp_id,
            "user_id": user_id,
            "variant": variant,
            "metric_name": "pre_spend",
            "metric_value": pre_spend,
            "timestamp": pre_experiment_time.isoformat(),
        })

        # 3. Post-experiment metric (correlated with pre_spend + treatment lift)
        noise = random.gauss(0, pre_std * (1 - correlation ** 2) ** 0.5)
        revenue = pre_mean + correlation * (pre_spend - pre_mean) + noise
        if variant == "treatment":
            revenue *= 1 + lift
        client.post("/events", json={
            "experiment_id": exp_id,
            "user_id": user_id,
            "variant": variant,
            "metric_name": "revenue",
            "metric_value": max(0.0, revenue),
        })

        if i % 50 == 0 and i > 0:
            click.echo(f"  Processed {i}/{num_users} users...")

    click.echo(f"  Processed {num_users}/{num_users} users.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.command()
@click.option("--users", default=500, show_default=True, type=int,
              help="Number of simulated users.")
@click.option("--pre-mean", default=100.0, show_default=True, type=float,
              help="Mean of the pre-experiment covariate distribution.")
@click.option("--pre-std", default=30.0, show_default=True, type=float,
              help="Std-dev of the pre-experiment covariate distribution.")
@click.option("--correlation", default=0.8, show_default=True, type=float,
              help="Correlation between pre-covariate and post-metric (0–1).")
@click.option("--lift", default=0.05, show_default=True, type=float,
              help="Treatment effect as a fraction (e.g. 0.05 = 5% lift).")
@api_options
def cli(
    users: int,
    pre_mean: float,
    pre_std: float,
    correlation: float,
    lift: float,
    base_url: str,
    email: str,
    password: str,
) -> None:
    """Generate correlated pre/post metric events for CUPED analysis testing."""
    client = BeakerClient(base_url, email, password)

    exp = _create_experiment(client)
    exp_id: str = exp["id"]
    click.echo(f"Created experiment: {exp_id}")

    group = _ensure_group(client)
    group_id: str = group["id"]

    click.echo(f"Starting experiment {exp_id}...")
    client.post(f"/experiments/{exp_id}/start")

    _generate_data(client, exp_id, group_id, users, pre_mean, pre_std, correlation, lift)

    click.echo("\nData generation complete!")
    click.echo(f"Experiment ID: {exp_id}")
    click.echo("Next steps:")
    click.echo(f"  1. Open the experiment at /experiment/{exp_id}")
    click.echo("  2. Click 'Configure CUPED'")
    click.echo("  3. Set Covariate Metric to 'pre_spend' and Lookback Window to 30 days")
    click.echo("  4. Save and enable 'CUPED Variance Reduction'")
