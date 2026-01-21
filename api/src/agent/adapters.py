"""Agent adapters for wrapping different agent types into AgentProtocol."""

from collections.abc import Callable
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class AgentProtocol(Protocol):
    """Protocol that agents must implement for evaluation.

    This defines the interface that all agents must follow to be
    evaluated by Neon. Agents can either implement this directly
    or be wrapped using one of the adapters.
    """

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the agent with the given input.

        Args:
            query: The input query/prompt for the agent
            context: Optional context dictionary with additional information

        Returns:
            Dictionary containing at minimum:
                - output: str - The agent's response text
                - tools_called: list[str] - Names of tools invoked
            May also include:
                - metadata: dict - Additional execution metadata
                - trace_id: str - MLflow trace identifier
        """
        ...


class CallableAdapter:
    """Wrap any callable (function) as an agent.

    This adapter allows simple functions to be used as agents. The function
    should accept a query string and optional context, returning either:
    - A string (which becomes the output)
    - A dict with 'output' and optionally 'tools_called', 'metadata'

    Example:
        def my_agent(query: str, **context) -> str:
            return f"Response to: {query}"

        adapter = CallableAdapter(my_agent)
        result = adapter.run("hello")
        # {'output': 'Response to: hello', 'tools_called': [], 'metadata': {}}
    """

    def __init__(self, fn: Callable[..., Any]):
        """Initialize the adapter with a callable.

        Args:
            fn: A callable that takes (query, **context) or (query, context)
        """
        self.fn = fn

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the wrapped function and normalize the output.

        Args:
            query: The input query for the agent
            context: Optional context dictionary

        Returns:
            Normalized output dictionary with 'output', 'tools_called', 'metadata'
        """
        ctx = context or {}

        # Try calling with **context first (more flexible), fall back to dict
        try:
            result = self.fn(query, **ctx)
        except TypeError:
            # Function might expect context as a single dict argument
            result = self.fn(query, ctx)

        # Normalize the result
        if isinstance(result, str):
            return {
                "output": result,
                "tools_called": [],
                "metadata": {},
            }
        elif isinstance(result, dict):
            return {
                "output": result.get("output", str(result)),
                "tools_called": result.get("tools_called", []),
                "metadata": result.get("metadata", {}),
            }
        else:
            # Attempt to convert to string
            return {
                "output": str(result),
                "tools_called": [],
                "metadata": {},
            }


class LangChainAdapter:
    """Wrap a LangChain agent to match AgentProtocol.

    This adapter handles LangChain agents (AgentExecutor, chains, runnables)
    and normalizes their output to match the expected format.

    Supports:
    - AgentExecutor with .invoke()
    - RunnableSequence/RunnableLambda with .invoke()
    - Legacy chains with .run()

    Example:
        from langchain.agents import AgentExecutor

        agent_executor = AgentExecutor(...)
        adapter = LangChainAdapter(agent_executor)
        result = adapter.run("What is 2+2?")
    """

    def __init__(self, agent: Any):
        """Initialize the adapter with a LangChain agent.

        Args:
            agent: A LangChain agent (AgentExecutor, chain, or runnable)
        """
        self.agent = agent

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the LangChain agent and normalize the output.

        Args:
            query: The input query for the agent
            context: Optional context dictionary

        Returns:
            Normalized output dictionary with 'output', 'tools_called', 'metadata'
        """
        ctx = context or {}

        # Prepare input - LangChain typically expects {"input": ...}
        langchain_input = {"input": query, **ctx}

        # Try different invocation methods
        if hasattr(self.agent, "invoke"):
            # Modern LangChain API (AgentExecutor, Runnables)
            result = self.agent.invoke(langchain_input)
        elif hasattr(self.agent, "run"):
            # Legacy chain API
            result = self.agent.run(langchain_input)
        elif callable(self.agent):
            # Direct callable
            result = self.agent(langchain_input)
        else:
            raise TypeError(
                f"LangChain agent must have invoke(), run(), or be callable. "
                f"Got {type(self.agent)}"
            )

        # Normalize the result
        return self._normalize_result(result)

    def _normalize_result(self, result: Any) -> dict[str, Any]:
        """Normalize LangChain output to standard format.

        Args:
            result: Raw output from LangChain agent

        Returns:
            Normalized dictionary with output, tools_called, metadata
        """
        tools_called = []
        metadata = {}

        if isinstance(result, dict):
            # AgentExecutor returns dict with 'output' and 'intermediate_steps'
            output = result.get("output", str(result))

            # Extract tools from intermediate_steps if present
            intermediate_steps = result.get("intermediate_steps", [])
            tools_called = self._extract_tools(intermediate_steps)

            # Capture any additional fields as metadata
            metadata = {
                k: v for k, v in result.items()
                if k not in ("output", "intermediate_steps", "input")
            }
        elif isinstance(result, str):
            output = result
        else:
            # AIMessage or other types
            output = getattr(result, "content", str(result))
            if hasattr(result, "additional_kwargs"):
                metadata = result.additional_kwargs

        return {
            "output": output,
            "tools_called": tools_called,
            "metadata": metadata,
        }

    def _extract_tools(self, intermediate_steps: list[Any]) -> list[str]:
        """Extract tool names from LangChain intermediate steps.

        Args:
            intermediate_steps: List of (AgentAction, output) tuples

        Returns:
            List of tool names that were called
        """
        tools = []
        for step in intermediate_steps:
            if isinstance(step, tuple) and len(step) >= 1:
                action = step[0]
                # AgentAction has a 'tool' attribute
                if hasattr(action, "tool"):
                    tools.append(action.tool)
                elif isinstance(action, dict) and "tool" in action:
                    tools.append(action["tool"])
        return tools
