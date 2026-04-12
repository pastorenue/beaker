import requests
from typing import Optional, Dict, Any, List
import logging

logger = logging.getLogger(__name__)


class TelemetryClientConfig:
    def __init__(
        self,
        api_key: str,
        endpoint: Optional[str] = None
    ):
        self.api_key = api_key
        self.endpoint = endpoint or "/api/sdk/telemetry"


# TelemetryEvent shape:
# {
#   "id": str,
#   "definition_id": str,
#   "name": str,
#   "event_type": str,
#   "selector": Optional[str],
#   "url_pattern": Optional[str],
#   "visual_guide": Optional[str],
# }

# TelemetryDefinition shape:
# {
#   "id": str,
#   "account_id": str,
#   "experiment_id": str,
#   "description": str,
#   "is_active": bool,
#   "events": List[TelemetryEvent],
#   "created_at": str,
#   "updated_at": str,
# }


class BeakerTelemetry:
    def __init__(self, config: TelemetryClientConfig):
        self.config = config
        self.endpoint = config.endpoint

    def fetch_definitions(self, experiment_id: str) -> Dict[str, Any]:
        headers = {
            "x-beaker-key": self.config.api_key
        }

        try:
            response = requests.get(
                self.endpoint,
                params={"experiment_id": experiment_id},
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch telemetry definitions: {e}")
            raise e

    def get_active_definitions(self, experiment_id: str) -> List[Dict[str, Any]]:
        try:
            result = self.fetch_definitions(experiment_id)
            return result.get("definitions", [])
        except Exception:
            return []
