"""LLM Judge for scoring using Vertex AI."""

import json
from typing import Any

from src.config import settings


class LLMJudge:
    """LLM-based judge using Vertex AI."""

    def __init__(self, model: str | None = None):
        self.model = model or settings.default_scoring_model
        self._client = None

    async def _get_client(self):
        """Lazily initialize Vertex AI client."""
        if self._client is None:
            try:
                import vertexai
                from vertexai.generative_models import GenerativeModel

                vertexai.init(
                    project=settings.google_cloud_project,
                    location=settings.vertex_ai_location,
                )
                self._client = GenerativeModel(self.model)
            except Exception as e:
                raise RuntimeError(f"Failed to initialize Vertex AI: {e}")

        return self._client

    async def evaluate(self, prompt: str) -> dict[str, Any]:
        """Evaluate using LLM and parse JSON response."""
        try:
            client = await self._get_client()
            response = await client.generate_content_async(
                prompt,
                generation_config={
                    "temperature": 0.1,  # Low temp for consistent scoring
                    "max_output_tokens": 1024,
                },
            )

            # Parse JSON from response
            text = response.text
            # Try to extract JSON from the response
            json_match = self._extract_json(text)
            if json_match:
                return json.loads(json_match)

            # Fallback: return raw text as reason
            return {
                "score": 5,
                "reason": text[:200],
            }

        except Exception as e:
            # Return neutral evaluation on error
            return {
                "score": 5,
                "reason": f"Evaluation error: {str(e)}",
                "error": str(e),
            }

    def _extract_json(self, text: str) -> str | None:
        """Extract JSON object from text."""
        # Try to find JSON in the response
        start = text.find("{")
        end = text.rfind("}") + 1

        if start != -1 and end > start:
            try:
                json_str = text[start:end]
                # Validate it's valid JSON
                json.loads(json_str)
                return json_str
            except json.JSONDecodeError:
                pass

        return None
