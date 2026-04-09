"""Shared authenticated HTTP client for the Beaker API."""

from __future__ import annotations

import click
import httpx


class BeakerClient:
    """Thin wrapper around httpx.Client that handles JWT auth and SDK tracking keys."""

    def __init__(self, base_url: str, email: str, password: str) -> None:
        self._http = httpx.Client(base_url=base_url.rstrip("/"), timeout=30)
        self._tracking_key: str | None = None
        self._login(email, password)

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def _login(self, email: str, password: str) -> None:
        resp = self._http.post("/api/auth/login", json={"email": email, "password": password})
        resp.raise_for_status()
        data = resp.json()
        if token := data.get("token"):
            self._http.headers["Authorization"] = f"Bearer {token}"
            click.echo("Authenticated successfully.")
            return
        if data.get("requires_otp"):
            code = data.get("dev_code")
            if not code:
                raise click.ClickException(
                    "OTP required but no dev_code returned. Set ALLOW_DEV_OTP=1 on the server."
                )
            self._verify_otp(email, code)

    def _verify_otp(self, email: str, code: str) -> None:
        resp = self._http.post("/api/auth/verify-otp", json={"email": email, "code": code})
        resp.raise_for_status()
        data = resp.json()
        if token := data.get("token"):
            self._http.headers["Authorization"] = f"Bearer {token}"
            click.echo("OTP verified, authenticated successfully.")

    def tracking_key(self) -> str:
        if not self._tracking_key:
            resp = self._http.get("/api/sdk/tokens")
            resp.raise_for_status()
            self._tracking_key = resp.json()["tracking_api_key"]
            click.echo("Tracking key loaded.")
        return self._tracking_key

    # ------------------------------------------------------------------
    # API helpers
    # ------------------------------------------------------------------

    def get(self, path: str) -> dict | list | None:
        resp = self._http.get(f"/api{path}")
        if resp.is_success:
            return resp.json()
        click.echo(f"Error GET {path}: {resp.status_code} {resp.text}", err=True)
        return None

    def post(self, path: str, json: dict | None = None) -> dict | None:
        resp = self._http.post(f"/api{path}", json=json)
        if resp.is_success:
            return resp.json()
        click.echo(f"Error POST {path}: {resp.status_code} {resp.text}", err=True)
        return None

    def track(self, path: str, json: dict) -> None:
        """Fire-and-forget tracking call via SDK key. HTTP errors are suppressed."""
        try:
            self._http.post(
                f"/api{path}",
                json=json,
                headers={"x-beaker-key": self.tracking_key()},
            )
        except Exception:
            pass


def api_options(func):
    """Click decorator that adds shared --base-url / --email / --password options."""
    func = click.option(
        "--base-url",
        default="http://localhost:8080",
        envvar="BEAKER_BASE_URL",
        show_default=True,
        help="Beaker API base URL.",
    )(func)
    func = click.option(
        "--email",
        default="admin@beaker.local",
        envvar="BEAKER_EMAIL",
        show_default=True,
        help="Admin email for authentication.",
    )(func)
    func = click.option(
        "--password",
        default="admin",
        envvar="BEAKER_PASSWORD",
        show_default=True,
        help="Admin password for authentication.",
    )(func)
    return func
