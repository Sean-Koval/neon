"""API client for AgentEval."""

from typing import Any

import httpx

from src.config import get_config


class Client:
    """HTTP client for AgentEval API."""

    def __init__(self, api_url: str | None = None, api_key: str | None = None):
        config = get_config()
        self.api_url = api_url or config.get("api_url", "http://localhost:8000")
        self.api_key = api_key or config.get("api_key", "")
        self.timeout = 30.0

    def _headers(self) -> dict[str, str]:
        """Get request headers."""
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        json: dict | None = None,
        params: dict | None = None,
    ) -> dict[str, Any] | list[dict[str, Any]] | None:
        """Make an HTTP request."""
        url = f"{self.api_url}/api/v1{path}"

        with httpx.Client(timeout=self.timeout) as client:
            response = client.request(
                method=method,
                url=url,
                headers=self._headers(),
                json=json,
                params=params,
            )

            if response.status_code == 204:
                return None

            response.raise_for_status()
            return response.json()

    # =========================================================================
    # Suites
    # =========================================================================

    def list_suites(self) -> list[dict[str, Any]]:
        """List all suites."""
        result = self._request("GET", "/suites")
        return result.get("items", []) if isinstance(result, dict) else []

    def get_suite(self, suite_id: str) -> dict[str, Any] | None:
        """Get a suite by ID."""
        result = self._request("GET", f"/suites/{suite_id}")
        return result if isinstance(result, dict) else None

    def get_suite_by_name(self, name: str) -> dict[str, Any] | None:
        """Get a suite by name."""
        suites = self.list_suites()
        for suite in suites:
            if suite.get("name") == name:
                return self.get_suite(suite["id"])
        return None

    def create_suite(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new suite."""
        result = self._request("POST", "/suites", json=data)
        return result if isinstance(result, dict) else {}

    def delete_suite(self, suite_id: str) -> bool:
        """Delete a suite."""
        try:
            self._request("DELETE", f"/suites/{suite_id}")
            return True
        except httpx.HTTPStatusError:
            return False

    def delete_suite_by_name(self, name: str) -> bool:
        """Delete a suite by name."""
        suite = self.get_suite_by_name(name)
        if suite:
            return self.delete_suite(suite["id"])
        return False

    # =========================================================================
    # Runs
    # =========================================================================

    def list_runs(
        self,
        suite_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List runs."""
        params = {"limit": limit}
        if suite_id:
            params["suite_id"] = suite_id
        if status:
            params["status_filter"] = status

        result = self._request("GET", "/runs", params=params)
        return result.get("items", []) if isinstance(result, dict) else []

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Get a run by ID."""
        result = self._request("GET", f"/runs/{run_id}")
        return result if isinstance(result, dict) else None

    def get_run_results(
        self, run_id: str, failed_only: bool = False
    ) -> list[dict[str, Any]]:
        """Get results for a run."""
        params = {"failed_only": failed_only}
        result = self._request("GET", f"/runs/{run_id}/results", params=params)
        return result if isinstance(result, list) else []

    def start_run(
        self,
        suite_id: str,
        agent_version: str | None = None,
        trigger: str = "cli",
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Start a new run."""
        data = {
            "agent_version": agent_version,
            "trigger": trigger,
            "config": config,
        }
        result = self._request("POST", f"/runs/suites/{suite_id}/run", json=data)
        return result if isinstance(result, dict) else {}

    # =========================================================================
    # Compare
    # =========================================================================

    def compare_runs(
        self,
        baseline_run_id: str,
        candidate_run_id: str,
        threshold: float = 0.05,
    ) -> dict[str, Any] | None:
        """Compare two runs."""
        data = {
            "baseline_run_id": baseline_run_id,
            "candidate_run_id": candidate_run_id,
            "threshold": threshold,
        }
        result = self._request("POST", "/compare", json=data)
        return result if isinstance(result, dict) else None

    # =========================================================================
    # API Keys
    # =========================================================================

    def list_api_keys(self) -> list[dict[str, Any]]:
        """List API keys."""
        result = self._request("GET", "/api-keys")
        return result.get("items", []) if isinstance(result, dict) else []

    def create_api_key(
        self, name: str, scopes: list[str] | None = None
    ) -> dict[str, Any]:
        """Create a new API key."""
        data = {"name": name}
        if scopes:
            data["scopes"] = scopes
        result = self._request("POST", "/api-keys", json=data)
        return result if isinstance(result, dict) else {}

    def revoke_api_key(self, key_id: str) -> bool:
        """Revoke an API key."""
        try:
            self._request("DELETE", f"/api-keys/{key_id}")
            return True
        except httpx.HTTPStatusError:
            return False


def get_client() -> Client:
    """Get a configured client instance."""
    return Client()
