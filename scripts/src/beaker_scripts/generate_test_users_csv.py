"""Generate a CSV file of dummy users for testing the CSV data-source feature.

Usage (Docker):
    docker compose run --rm -v $(pwd)/output:/output scripts \\
        generate-test-users-csv --count 500 --output /output/users.csv

Usage (local dev):
    generate-test-users-csv --count 100 --output ./test_users.csv
"""

from __future__ import annotations

import csv
import sys
import uuid
from pathlib import Path

import click


@click.command()
@click.option("--count", default=100, show_default=True, type=int,
              help="Number of user rows to generate.")
@click.option("--output", default="./test_users.csv", show_default=True,
              type=click.Path(dir_okay=False, writable=True),
              help="Output CSV file path.")
def cli(count: int, output: str) -> None:
    """Generate a CSV of dummy users for the CSV data-source feature."""
    if count < 1:
        click.echo("Error: --count must be at least 1.", err=True)
        sys.exit(1)

    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["user_id", "email", "name"])
        for n in range(1, count + 1):
            writer.writerow([str(uuid.uuid4()), f"user_{n}@example.com", f"Test User {n}"])

    click.echo(f"Generated {count} users → {output_path.resolve()}")
