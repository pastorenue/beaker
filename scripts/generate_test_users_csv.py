#!/usr/bin/env python3
"""Generate a CSV file of dummy users for testing the CSV data source feature.

Usage:
    python scripts/generate_test_users_csv.py [--count 100] [--output test_users.csv]
"""

import argparse
import csv
import uuid
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Generate a test users CSV for the CSV data source feature."
    )
    parser.add_argument(
        "--count",
        type=int,
        default=100,
        help="Number of user rows to generate (default: 100)",
    )
    parser.add_argument(
        "--output",
        default="./test_users.csv",
        help="Output file path (default: ./test_users.csv)",
    )
    args = parser.parse_args()

    if args.count < 1:
        print("Error: --count must be at least 1", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["user_id", "email", "name"])
        for n in range(1, args.count + 1):
            user_id = str(uuid.uuid4())
            email = f"user_{n}@example.com"
            name = f"Test User {n}"
            writer.writerow([user_id, email, name])

    print(f"Generated {args.count} users → {output_path.resolve()}")


if __name__ == "__main__":
    main()
