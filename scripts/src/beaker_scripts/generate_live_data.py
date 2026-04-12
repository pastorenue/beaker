"""Live A/B experiment data simulator.

Runs a continuous loop that simulates real users: each user is assigned to an
experiment variant, browses through a full session of 60-80 activity events,
then optionally fires a metric conversion event.

Usage (Docker):
    docker compose run --rm scripts generate-live-data [EXPERIMENT_ID]

Usage (local dev):
    BEAKER_BASE_URL=http://localhost:8080 generate-live-data [EXPERIMENT_ID]
"""

from __future__ import annotations

import random
import time
import uuid

import click

from beaker_scripts.client import BeakerClient, api_options

# ---------------------------------------------------------------------------
# Conversion rates per variant (case-insensitive lookup)
# ---------------------------------------------------------------------------

DEFAULT_CONVERSION_RATES: dict[str, float] = {
    "control": 0.10,    # 10%
    "treatment": 0.12,  # 12% (20% lift)
}

# ---------------------------------------------------------------------------
# Activity event pools keyed by primary metric name fragment
# ---------------------------------------------------------------------------

METRIC_EVENT_POOLS: dict[str, list[tuple[str, str]]] = {
    "activation": [
        ("page_view",   "landing_page_view"),
        ("page_view",   "signup_page_view"),
        ("page_view",   "onboarding_page_view"),
        ("page_view",   "dashboard_view"),
        ("click",       "get_started_click"),
        ("click",       "signup_cta_click"),
        ("click",       "feature_explore_click"),
        ("click",       "nav_link_click"),
        ("scroll",      "page_scroll"),
        ("input_focus", "email_input_focus"),
        ("input_focus", "password_input_focus"),
        ("form_submit", "signup_form_submit"),
        ("custom",      "onboarding_step_complete"),
        ("custom",      "feature_activated"),
        ("custom",      "profile_setup_complete"),
        ("custom",      "first_action_taken"),
    ],
    "conversion": [
        ("page_view",   "product_page_view"),
        ("page_view",   "cart_page_view"),
        ("page_view",   "checkout_page_view"),
        ("click",       "add_to_cart_click"),
        ("click",       "checkout_cta_click"),
        ("click",       "product_image_click"),
        ("click",       "quantity_change_click"),
        ("scroll",      "page_scroll"),
        ("input_focus", "promo_code_focus"),
        ("form_submit", "checkout_form_submit"),
        ("custom",      "cart_updated"),
        ("custom",      "payment_method_selected"),
        ("custom",      "purchase_complete"),
        ("custom",      "order_confirmed"),
    ],
    "retention": [
        ("page_view",   "dashboard_view"),
        ("page_view",   "feed_page_view"),
        ("page_view",   "profile_page_view"),
        ("click",       "notification_click"),
        ("click",       "content_click"),
        ("click",       "return_cta_click"),
        ("scroll",      "feed_scroll"),
        ("custom",      "content_viewed"),
        ("custom",      "action_taken"),
        ("custom",      "session_milestone"),
        ("custom",      "streak_updated"),
    ],
    "engagement": [
        ("page_view",   "content_page_view"),
        ("page_view",   "explore_page_view"),
        ("click",       "like_button_click"),
        ("click",       "share_button_click"),
        ("click",       "comment_click"),
        ("click",       "related_content_click"),
        ("scroll",      "content_scroll"),
        ("custom",      "content_consumed"),
        ("custom",      "reaction_recorded"),
        ("custom",      "share_completed"),
    ],
    "revenue": [
        ("page_view",   "pricing_page_view"),
        ("page_view",   "upgrade_page_view"),
        ("page_view",   "billing_page_view"),
        ("click",       "upgrade_cta_click"),
        ("click",       "plan_select_click"),
        ("click",       "compare_plans_click"),
        ("form_submit", "payment_form_submit"),
        ("custom",      "plan_selected"),
        ("custom",      "subscription_started"),
        ("custom",      "payment_completed"),
    ],
}

DEFAULT_EVENT_POOL: list[tuple[str, str]] = [
    ("page_view",   "page_view"),
    ("page_view",   "feature_page_view"),
    ("click",       "button_click"),
    ("click",       "cta_click"),
    ("click",       "link_click"),
    ("scroll",      "page_scroll"),
    ("input_focus", "input_focus"),
    ("form_submit", "form_submitted"),
    ("custom",      "custom_event"),
    ("custom",      "goal_reached"),
]

SIMULATED_URLS = [
    "https://app.example.com/",
    "https://app.example.com/dashboard",
    "https://app.example.com/signup",
    "https://app.example.com/onboarding",
    "https://app.example.com/features",
    "https://app.example.com/pricing",
    "https://app.example.com/settings",
    "https://app.example.com/profile",
    "https://app.example.com/explore",
]

SELECTORS = [
    None, "#cta-button", ".nav-link", "#signup-form", ".feature-card",
    "#submit-btn", ".hero-cta", "#email-input", ".product-card", "#checkout-btn",
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
]


def _event_pool(metric_name: str) -> list[tuple[str, str]]:
    metric_lower = (metric_name or "").lower()
    for key, pool in METRIC_EVENT_POOLS.items():
        if key in metric_lower:
            return pool
    return DEFAULT_EVENT_POOL


def _create_telemetry_for_experiment(
    client: BeakerClient,
    experiment_id: str,
    metric: str,
) -> None:
    """Create telemetry definitions for the experiment based on metric event pools."""
    pool = _event_pool(metric)
    created = 0
    for event_type, name in pool:
        result = client.post(f"/experiments/{experiment_id}/telemetry", json={
            "name": name,
            "event_type": event_type,
            "is_active": True,
        })
        if result:
            created += 1
    click.echo(f"Created {created}/{len(pool)} telemetry definitions.")


def _fetch_telemetry_pool(
    client: BeakerClient,
    experiment_id: str,
) -> list[tuple[str, str]] | None:
    """Fetch active telemetry events for the experiment and return an event pool."""
    events = client.get(f"/experiments/{experiment_id}/telemetry")
    if not events:
        return None
    pool = [
        (ev["event_type"], ev["name"])
        for ev in events
        if ev.get("is_active", True)
    ]
    return pool if pool else None


def _simulate_session(
    client: BeakerClient,
    user_id: str,
    variant: str,
    pool: list[tuple[str, str]],
    min_events: int,
) -> None:
    """Start a session, fire min_events activity events, then end the session."""
    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    entry_url = random.choice(SIMULATED_URLS)

    client.track("/track/session/start", {
        "session_id": session_id,
        "user_id": user_id,
        "entry_url": entry_url,
        "referrer": random.choice(["https://www.google.com/", "https://twitter.com/", None]),
        "user_agent": random.choice(USER_AGENTS),
        "metadata": {"variant": variant},
    })

    for step in range(random.randint(min_events, min_events + 20)):
        event_type, event_name = random.choice(pool)
        is_pointer = event_type in ("click", "scroll")
        client.track("/track/event", {
            "session_id": session_id,
            "user_id": user_id,
            "event_name": event_name,
            "event_type": event_type,
            "url": random.choice(SIMULATED_URLS),
            "selector": random.choice(SELECTORS) if is_pointer else None,
            "x": round(random.uniform(0, 1920), 1) if is_pointer else None,
            "y": round(random.uniform(0, 1080), 1) if is_pointer else None,
            "metadata": {"step": step + 1, "variant": variant},
        })

    client.track("/track/session/end", {"session_id": session_id})


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.command()
@click.argument("experiment_id", required=False)
@click.option("--interval", default=0.5, show_default=True, type=float,
              help="Seconds to sleep between users.")
@click.option("--min-events", default=60, show_default=True, type=int,
              help="Minimum activity events to fire per user session.")
@click.option("--use-existing-telemetry", "use_existing_telemetry", is_flag=True, default=False,
              help="Use telemetry events already defined for the experiment instead of creating them from the script.")
@api_options
def cli(
    experiment_id: str | None,
    interval: float,
    min_events: int,
    use_existing_telemetry: bool,
    base_url: str,
    email: str,
    password: str,
) -> None:
    """Continuously simulate live user traffic for an A/B experiment."""
    client = BeakerClient(base_url, email, password)

    # Resolve experiment
    if not experiment_id:
        experiments = client.get("/experiments")
        if not experiments:
            raise click.ClickException("No experiments found.")
        experiment_id = experiments[0]["id"]
        click.echo(f"Using latest experiment: {experiments[0]['name']} ({experiment_id})")

    # Ensure it's running
    click.echo(f"Starting experiment {experiment_id}...")
    client.post(f"/experiments/{experiment_id}/start")

    # Create user group for this session
    click.echo("Creating live test group...")
    group = client.post("/user-groups", json={
        "name": "Live Test Group",
        "description": "Automatically created for live testing",
        "assignment_rule": "random",
    })
    if not group:
        raise click.ClickException("Failed to create user group.")
    group_id = group["id"]

    # Fetch experiment details
    exp = client.get(f"/experiments/{experiment_id}")
    if not exp:
        raise click.ClickException("Could not fetch experiment details.")

    variant_names: list[str] = [v["name"] for v in exp["variants"]]
    metric: str = exp.get("primary_metric") or "conversion"

    click.echo(f"Variants: {variant_names}")
    click.echo(f"Primary metric: {metric}")

    if use_existing_telemetry:
        click.echo("Fetching existing telemetry definitions for experiment...")
        event_pool = _fetch_telemetry_pool(client, experiment_id)
        if event_pool:
            click.echo(f"Loaded {len(event_pool)} active events from experiment telemetry.")
        else:
            event_pool = _event_pool(metric)
            click.echo(f"No telemetry defined for experiment, falling back to '{metric}' pool ({len(event_pool)} events).")
    else:
        click.echo("Creating telemetry definitions from script...")
        _create_telemetry_for_experiment(client, experiment_id, metric)
        event_pool = _event_pool(metric)
        click.echo(f"Using script-generated pool ({len(event_pool)} events).")

    click.echo(f"Generating live data for experiment {experiment_id} (Group: {group_id})...")
    click.echo("Press Ctrl+C to stop.\n")

    user_count = 0
    conversions: dict[str, int] = {v: 0 for v in variant_names}
    sessions_per_variant: dict[str, int] = {v: 0 for v in variant_names}

    try:
        while True:
            variant_name = random.choice(variant_names)
            user_id = f"sim_user_{random.randint(100000, 999999)}"

            # Assign to experiment group
            client.post("/user-groups/assign", json={
                "user_id": user_id,
                "experiment_id": experiment_id,
                "group_id": group_id,
            })

            # Simulate a full browsing session
            _simulate_session(client, user_id, variant_name, event_pool, min_events)

            # Record conversion if applicable
            rate = DEFAULT_CONVERSION_RATES.get(variant_name.lower(), 0.10)
            if random.random() < rate:
                client.post("/events", json={
                    "experiment_id": experiment_id,
                    "user_id": user_id,
                    "variant": variant_name,
                    "metric_name": metric,
                    "metric_value": 1.0,
                })
                conversions[variant_name] += 1

            sessions_per_variant[variant_name] += 1
            user_count += 1

            if user_count % 5 == 0:
                stats = ", ".join(
                    f"{v}: {conversions[v]}/{sessions_per_variant[v]}" for v in variant_names
                )
                click.echo(f"Iters: {user_count} | {stats}")

            time.sleep(interval)

    except KeyboardInterrupt:
        click.echo("\nStopping data generation.")
