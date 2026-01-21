"""Mock agent for deterministic testing.

This agent returns predictable outputs based on the query and context,
enabling reliable integration tests without external dependencies.

Usage:
    from examples.agents.mock_agent import run, MockAgent

    # Function-based usage (matches AgentProtocol)
    result = run("What is 2 + 2?", context={})

    # Class-based usage with scenarios
    agent = MockAgent(scenario="pass_all")
    result = agent.run("Any query", context={})

Scenarios:
    - "pass_all": All responses designed to pass evaluation
    - "fail_all": All responses designed to fail evaluation
    - "mixed": Some pass, some fail
    - "timeout": Simulates slow responses
    - "error": Raises exceptions
"""

from __future__ import annotations

import time
from typing import Any


# Predefined responses for specific queries
QUERY_RESPONSES: dict[str, dict[str, Any]] = {
    # Arithmetic
    "what is 2 + 2": {
        "output": "The answer is 4.",
        "tools_called": [],
        "reasoning": "Simple arithmetic: 2 + 2 = 4",
    },
    "what is 15 multiplied by 7": {
        "output": "15 multiplied by 7 equals 105.",
        "tools_called": [],
        "reasoning": "15 x 7 = 105",
    },
    # Factual with search
    "what is the capital of france": {
        "output": "The capital of France is Paris.",
        "tools_called": ["web_search"],
        "reasoning": "Used web search to find factual information about France's capital.",
    },
    "what is the current population of japan": {
        "output": "Japan has a population of approximately 125 million people.",
        "tools_called": ["web_search"],
        "reasoning": "Searched for current population data of Japan.",
    },
    # Comparison queries
    "compare the populations of tokyo and new york": {
        "output": "Tokyo has approximately 14 million people in the city proper, while New York City has about 8.3 million. Tokyo is significantly larger.",
        "tools_called": ["web_search", "web_search"],
        "reasoning": "Searched for population data of both cities and compared them.",
    },
    "compare tokyo and new york": {
        "output": "Tokyo has approximately 14 million people in the city proper, while New York City has about 8.3 million. Tokyo is significantly larger.",
        "tools_called": ["web_search", "web_search"],
        "reasoning": "Searched for population data of both cities and compared them.",
    },
    "compare the gdp of the united states and china": {
        "output": "The United States has a GDP of approximately $25 trillion, while China's GDP is around $18 trillion. The US economy is larger, but China's GDP growth rate has been higher in recent years.",
        "tools_called": ["web_search", "web_search"],
        "reasoning": "Searched for GDP data of both countries and analyzed growth trends.",
    },
    # Logical reasoning
    "alice is taller than bob": {
        "output": "Based on the given information: Alice > Bob > Charlie > Diana in height. Therefore, Diana is the shortest.",
        "tools_called": [],
        "reasoning": "Applied transitive property to determine height order.",
    },
    # Context-based
    "what are the main features of the new product": {
        "output": "The XZ-5000 features: 50% faster processing speed, AI-powered noise cancellation, 24-hour battery life, and water resistance (IP67).",
        "tools_called": [],
        "reasoning": "Extracted key features from the provided product document.",
    },
    "what color is the xz-5000": {
        "output": "The color of the XZ-5000 is not specified in the provided documentation.",
        "tools_called": [],
        "reasoning": "The context does not contain color information, so I cannot provide that detail.",
    },
    # Tool sequence
    "find information about climate change": {
        "output": "Climate change is causing rising temperatures, sea level rise, and more extreme weather events. Key impacts include melting ice caps, ecosystem disruption, and agricultural challenges.",
        "tools_called": ["web_search", "summarize"],
        "reasoning": "Searched for climate change information and summarized the key points.",
    },
    # Calculator usage
    "calculate the compound interest": {
        "output": "The compound interest on $10,000 at 5% APR over 10 years is approximately $6,288.95, for a total of $16,288.95.",
        "tools_called": ["calculator"],
        "reasoning": "Used calculator: A = P(1 + r/n)^(nt) = 10000(1.05)^10 = $16,288.95",
    },
    # Default/ambiguous
    "what's the best one": {
        "output": "I need more context to answer that question. Could you please specify what you're asking about?",
        "tools_called": [],
        "reasoning": "The query is ambiguous and requires clarification.",
    },
    # Simple factual
    "what is the capital of germany": {
        "output": "Berlin is the capital of Germany.",
        "tools_called": [],
        "reasoning": "This is common knowledge.",
    },
}


class MockAgent:
    """Mock agent with configurable behavior for testing.

    Attributes:
        scenario: The behavior scenario ("pass_all", "fail_all", "mixed", "timeout", "error")
        delay: Optional delay in seconds to simulate slow responses
    """

    def __init__(
        self,
        scenario: str = "pass_all",
        delay: float = 0.0,
    ) -> None:
        """Initialize the mock agent.

        Args:
            scenario: Behavior scenario to use
            delay: Artificial delay in seconds
        """
        self.scenario = scenario
        self.delay = delay

    def run(
        self,
        query: str,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute the mock agent.

        Args:
            query: The input query
            context: Optional context dictionary

        Returns:
            Response dictionary with output, tools_called, and metadata
        """
        context = context or {}

        # Handle delay from context
        if context.get("simulate_delay"):
            delay = context.get("delay_seconds", self.delay)
            time.sleep(delay)

        # Handle error scenario
        if self.scenario == "error":
            raise RuntimeError("Simulated agent error")

        # Handle timeout scenario
        if self.scenario == "timeout":
            time.sleep(60)  # Sleep longer than typical timeout

        # Normalize query for lookup
        query_lower = query.lower().strip()

        # Find matching response
        response = None
        for key, value in QUERY_RESPONSES.items():
            if key in query_lower:
                response = value.copy()
                break

        # Default response if no match
        if response is None:
            response = {
                "output": f"I processed your query: {query}",
                "tools_called": [],
                "reasoning": "No specific handler for this query.",
            }

        # Modify response based on scenario
        if self.scenario == "fail_all":
            response["output"] = "I don't know the answer."
            response["tools_called"] = ["wrong_tool"]
            response["reasoning"] = ""

        elif self.scenario == "mixed":
            # Fail every other query (based on query length)
            if len(query) % 2 == 0:
                response["output"] = "Unable to process this request."
                response["tools_called"] = []

        # Handle context-specific overrides
        if context.get("require_search") and "web_search" not in response.get("tools_called", []):
            response["tools_called"] = ["web_search"] + response.get("tools_called", [])

        # Add metadata
        response["metadata"] = {
            "agent": "mock_agent",
            "scenario": self.scenario,
            "query_length": len(query),
        }

        return response


def run(
    query: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Function-based agent interface matching AgentProtocol.

    This is the default entry point for the mock agent.

    Args:
        query: The input query
        context: Optional context dictionary

    Returns:
        Response dictionary with output, tools_called, and metadata
    """
    agent = MockAgent(scenario="pass_all")
    return agent.run(query, context)


# Convenience functions for different scenarios
def run_pass_all(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run agent with pass_all scenario."""
    return MockAgent(scenario="pass_all").run(query, context)


def run_fail_all(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run agent with fail_all scenario."""
    return MockAgent(scenario="fail_all").run(query, context)


def run_mixed(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run agent with mixed scenario."""
    return MockAgent(scenario="mixed").run(query, context)
