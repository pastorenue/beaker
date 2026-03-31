import requests
import uuid
import datetime
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class ExpothesisTrackerConfig:
    def __init__(
        self,
        api_key: str,
        endpoint: Optional[str] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None
    ):
        self.api_key = api_key
        self.endpoint = endpoint or "/api/track"
        self.user_id = user_id
        self.session_id = session_id or str(uuid.uuid4())

class ExpothesisTracker:
    def __init__(self, config: ExpothesisTrackerConfig):
        self.config = config
        self.session_id = config.session_id
        self.user_id = config.user_id
        self.endpoint = config.endpoint
        self.api_key = config.api_key

    def identify(self, user_id: str):
        self.user_id = user_id

    def get_session_id(self) -> str:
        return self.session_id

    def start_session(
        self,
        entry_url: str = "",
        referrer: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        payload = {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "entry_url": entry_url,
            "referrer": referrer,
            "user_agent": user_agent,
            "metadata": metadata or {}
        }
        return self._send("/session/start", payload)

    def track(
        self,
        event_name: str,
        event_type: str = "custom",
        url: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        payload = {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "event_name": event_name,
            "event_type": event_type,
            "url": url,
            "metadata": metadata or {},
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
        }
        return self._send("/event", payload)

    def end_session(self) -> bool:
        payload = {
            "session_id": self.session_id,
            "ended_at": datetime.datetime.utcnow().isoformat() + "Z"
        }
        return self._send("/session/end", payload)

    def _send(self, path: str, payload: Dict[str, Any]) -> bool:
        headers = {
            "Content-Type": "application/json",
            "x-expothesis-key": self.api_key
        }
        url = f"{self.endpoint.rstrip('/')}{path}"
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=5)
            response.raise_for_status()
            return True
        except Exception as e:
            logger.warning(f"Failed to send Expothesis event to {path}: {e}")
            return False
