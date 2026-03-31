import requests
import uuid
import datetime
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class FeatureFlagClientConfig:
    def __init__(
        self,
        api_key: str,
        endpoint: Optional[str] = None
    ):
        self.api_key = api_key
        self.endpoint = endpoint or "/api/sdk/feature-flags/evaluate"

class ExpothesisFeatureFlags:
    def __init__(self, config: FeatureFlagClientConfig):
        self.config = config
        self.endpoint = config.endpoint

    def evaluate(
        self,
        user_id: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None,
        flags: Optional[list[str]] = None,
        environment: Optional[str] = None
    ) -> Dict[str, Any]:
        
        headers = {
            "Content-Type": "application/json",
            "x-expothesis-key": self.config.api_key
        }
        
        payload = {
            "user_id": user_id,
            "attributes": attributes or {},
            "flags": flags,
            "environment": environment
        }

        try:
            response = requests.post(
                self.endpoint,
                json=payload,
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to evaluate feature flags: {e}")
            raise e

    def is_enabled(
        self,
        flag_name: str,
        user_id: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None,
        environment: Optional[str] = None
    ) -> bool:
        try:
            result = self.evaluate(
                user_id=user_id,
                attributes=attributes,
                flags=[flag_name],
                environment=environment
            )
            flags = result.get("flags", [])
            if flags:
                return flags[0].get("enabled", False)
            return False
        except Exception:
            return False
