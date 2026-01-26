"""Agent loader - dynamically loads agent callables from module paths.

Supports loading agents from module path strings like:
    - 'myagent:run'
    - 'src.agents.research:ResearchAgent'
"""

import importlib
import inspect
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol, runtime_checkable


class AgentLoadError(Exception):
    """Raised when an agent cannot be loaded."""

    pass


@runtime_checkable
class AgentProtocol(Protocol):
    """Protocol that agents must implement."""

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the agent with given input.

        Args:
            query: The input query/prompt for the agent.
            context: Optional context dictionary.

        Returns:
            A dictionary containing the agent's response.
        """
        ...


class CallableAdapter:
    """Adapter that wraps a simple callable to conform to AgentProtocol."""

    def __init__(self, fn: Callable[..., Any]) -> None:
        """Initialize the adapter with a callable.

        Args:
            fn: A callable that takes (query, context) or just (query).
        """
        self._fn = fn
        self._accepts_context = self._check_accepts_context(fn)

    @staticmethod
    def _check_accepts_context(fn: Callable[..., Any]) -> bool:
        """Check if the function accepts a context parameter."""
        try:
            sig = inspect.signature(fn)
            params = list(sig.parameters.keys())
            # Check if there's a second parameter (context)
            return len(params) >= 2
        except (ValueError, TypeError):
            # Can't inspect, assume it accepts context
            return True

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the wrapped callable.

        Args:
            query: The input query.
            context: Optional context dictionary.

        Returns:
            The callable's response, wrapped in a dict if needed.
        """
        result = self._fn(query, context) if self._accepts_context else self._fn(query)

        # Wrap non-dict results
        if isinstance(result, dict):
            return result
        return {"response": result}


class LangChainAdapter:
    """Adapter that wraps LangChain agents/runnables to conform to AgentProtocol."""

    def __init__(self, agent: Any) -> None:
        """Initialize the adapter with a LangChain agent.

        Args:
            agent: A LangChain agent, chain, or runnable.
        """
        self._agent = agent

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Execute the LangChain agent.

        Args:
            query: The input query.
            context: Optional context dictionary.

        Returns:
            The agent's response as a dictionary.
        """
        # Build input - LangChain typically uses "input" key
        input_dict: dict[str, Any] = {"input": query}
        if context:
            input_dict.update(context)

        # Try different invocation methods
        if hasattr(self._agent, "invoke"):
            # LangChain LCEL runnables
            result = self._agent.invoke(input_dict)
        elif hasattr(self._agent, "run"):
            # Legacy LangChain chains
            result = self._agent.run(input_dict)
        elif callable(self._agent):
            # Callable agents
            result = self._agent(input_dict)
        else:
            raise AgentLoadError(
                f"LangChain agent {type(self._agent).__name__} has no invoke/run method"
            )

        # Normalize output
        if isinstance(result, dict):
            return result
        if isinstance(result, str):
            return {"output": result}
        # Try to extract output from LangChain response objects
        if hasattr(result, "content"):
            return {"output": result.content}
        return {"output": str(result)}


def _is_langchain_agent(obj: Any) -> bool:
    """Check if an object is a LangChain agent/runnable."""
    # Check for common LangChain base classes by module name
    # This avoids requiring LangChain as a dependency
    type_name = type(obj).__name__
    module = type(obj).__module__

    # Check module path for langchain indicators
    if module.startswith("langchain"):
        return True

    # Check for common LangChain class names
    langchain_classes = {
        "Runnable",
        "RunnableSequence",
        "AgentExecutor",
        "Chain",
        "LLMChain",
        "ConversationChain",
    }
    if type_name in langchain_classes:
        return True

    # Check inheritance chain
    return any(cls.__module__.startswith("langchain") for cls in type(obj).__mro__)


def _validate_callable_signature(fn: Callable[..., Any], name: str) -> None:
    """Validate that a callable has a compatible signature.

    Args:
        fn: The callable to validate.
        name: Name for error messages.

    Raises:
        AgentLoadError: If the signature is incompatible.
    """
    try:
        sig = inspect.signature(fn)
        params = list(sig.parameters.values())

        if not params:
            raise AgentLoadError(
                f"'{name}' takes no arguments, but must accept at least a query parameter"
            )

        # First param should accept a string (the query)
        first_param = params[0]
        if first_param.kind == inspect.Parameter.KEYWORD_ONLY:
            raise AgentLoadError(
                f"'{name}' first parameter cannot be keyword-only"
            )

    except (ValueError, TypeError):
        # Can't inspect signature (e.g., built-in), allow it
        pass


def load_agent(
    module_path: str,
    working_dir: str | Path | None = None,
) -> AgentProtocol:
    """Load an agent callable from a module path string.

    Supports paths like:
        - 'myagent:run' - loads run() function from myagent module
        - 'myagent:Agent' - loads Agent class and returns instance
        - 'src.agents.research:ResearchAgent' - relative imports

    Args:
        module_path: Module path in format 'module:attribute'.
        working_dir: Optional working directory to add to sys.path.

    Returns:
        An object conforming to AgentProtocol.

    Raises:
        AgentLoadError: If the agent cannot be loaded.
    """
    # Parse module path
    if ":" not in module_path:
        raise AgentLoadError(
            f"Invalid module path '{module_path}'. Expected format: 'module:attribute'"
        )

    module_name, attr_name = module_path.rsplit(":", 1)

    if not module_name or not attr_name:
        raise AgentLoadError(
            f"Invalid module path '{module_path}'. Both module and attribute required."
        )

    # Add working directory to sys.path if needed
    if working_dir:
        working_dir = Path(working_dir).resolve()
        working_dir_str = str(working_dir)
        if working_dir_str not in sys.path:
            sys.path.insert(0, working_dir_str)

    # Also add current directory if not present
    cwd = str(Path.cwd())
    if cwd not in sys.path:
        sys.path.insert(0, cwd)

    # Import the module
    try:
        module = importlib.import_module(module_name)
    except ModuleNotFoundError as e:
        raise AgentLoadError(
            f"Module '{module_name}' not found. Ensure the module is installed or "
            f"accessible from the working directory. Error: {e}"
        ) from e
    except Exception as e:
        raise AgentLoadError(f"Failed to import module '{module_name}': {e}") from e

    # Get the attribute
    if not hasattr(module, attr_name):
        available = [a for a in dir(module) if not a.startswith("_")]
        raise AgentLoadError(
            f"Module '{module_name}' has no attribute '{attr_name}'. "
            f"Available: {', '.join(available[:10])}"
        )

    attr = getattr(module, attr_name)

    # Handle different types of attributes
    if inspect.isclass(attr):
        # It's a class - instantiate it
        try:
            instance = attr()
        except Exception as e:
            raise AgentLoadError(
                f"Failed to instantiate class '{attr_name}': {e}"
            ) from e

        # Check if it already conforms to AgentProtocol
        if hasattr(instance, "run") and callable(instance.run):
            # Validate run method signature
            _validate_callable_signature(instance.run, f"{attr_name}.run")

            # Check if it's a LangChain agent
            if _is_langchain_agent(instance):
                return LangChainAdapter(instance)

            # Already has run method
            return instance  # type: ignore

        # Check for LangChain-style invoke
        if hasattr(instance, "invoke") and _is_langchain_agent(instance):
            return LangChainAdapter(instance)

        raise AgentLoadError(
            f"Class '{attr_name}' has no 'run' method. "
            f"Classes must implement AgentProtocol or be LangChain runnables."
        )

    elif callable(attr):
        # It's a function or callable
        _validate_callable_signature(attr, attr_name)

        # Check if it's a LangChain runnable (unlikely for functions, but possible)
        if _is_langchain_agent(attr):
            return LangChainAdapter(attr)

        # Wrap in CallableAdapter
        return CallableAdapter(attr)

    else:
        raise AgentLoadError(
            f"Attribute '{attr_name}' in module '{module_name}' is not callable. "
            f"Got {type(attr).__name__}."
        )
