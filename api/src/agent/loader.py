"""Dynamic agent loader for loading agents from module path strings."""

import importlib
import importlib.util
import inspect
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

from src.agent.adapters import AgentProtocol, CallableAdapter, LangChainAdapter


class AgentLoadError(Exception):
    """Raised when an agent cannot be loaded."""

    pass


class AgentSignatureError(Exception):
    """Raised when a loaded agent has an invalid signature."""

    pass


def load_agent(
    module_path: str,
    *,
    working_dir: str | Path | None = None,
    auto_wrap: bool = True,
) -> AgentProtocol:
    """Load an agent from a module path string.

    Supports loading agents specified as 'module:attribute' where:
    - module: Python module path (e.g., 'myagent' or 'src.agents.research')
    - attribute: Function, class, or object name in the module

    For classes, the loader will instantiate the class and return the instance's
    `run` method if it exists, otherwise wraps the instance.

    Args:
        module_path: String in format 'module:attribute' (e.g., 'myagent:run')
        working_dir: Optional directory to add to sys.path for imports.
            Useful for loading agents from the current project.
        auto_wrap: If True, automatically wrap non-protocol callables with
            appropriate adapters (CallableAdapter or LangChainAdapter)

    Returns:
        An object implementing AgentProtocol

    Raises:
        AgentLoadError: If the module or attribute cannot be found
        AgentSignatureError: If the loaded callable has an incompatible signature

    Examples:
        # Load a function
        agent = load_agent('myagent:run')

        # Load a class (instantiates and returns run method)
        agent = load_agent('src.agents.research:ResearchAgent')

        # Load with project path
        agent = load_agent('agents.qa:QAAgent', working_dir='/path/to/project')
    """
    # Parse the module path
    module_name, attr_name = _parse_module_path(module_path)

    # Optionally add working directory to path
    original_path = list(sys.path)
    if working_dir:
        working_dir = Path(working_dir).resolve()
        if str(working_dir) not in sys.path:
            sys.path.insert(0, str(working_dir))

    try:
        # Import the module
        module = _import_module(module_name)

        # Get the attribute
        attr = _get_attribute(module, attr_name, module_name)

        # Resolve to a callable agent
        agent = _resolve_agent(attr, attr_name, auto_wrap)

        # Validate the agent implements the protocol
        _validate_agent(agent, module_path)

        return agent

    finally:
        # Restore original sys.path
        sys.path[:] = original_path


def _parse_module_path(module_path: str) -> tuple[str, str]:
    """Parse a module path string into module name and attribute name.

    Args:
        module_path: String in format 'module:attribute'

    Returns:
        Tuple of (module_name, attribute_name)

    Raises:
        AgentLoadError: If the format is invalid
    """
    if ":" not in module_path:
        raise AgentLoadError(
            f"Invalid module path format: '{module_path}'. "
            f"Expected format 'module:attribute' (e.g., 'myagent:run' or 'src.agents:MyAgent')"
        )

    parts = module_path.split(":", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise AgentLoadError(
            f"Invalid module path format: '{module_path}'. "
            f"Expected format 'module:attribute' (e.g., 'myagent:run')"
        )

    return parts[0], parts[1]


def _import_module(module_name: str) -> Any:
    """Import a module by name.

    Args:
        module_name: Dotted module path (e.g., 'src.agents.research')

    Returns:
        The imported module object

    Raises:
        AgentLoadError: If the module cannot be imported
    """
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as e:
        # Provide helpful error message
        if e.name == module_name or (e.name and module_name.startswith(e.name)):
            raise AgentLoadError(
                f"Module '{module_name}' not found. "
                f"Make sure the module is installed or the path is correct. "
                f"For project modules, use working_dir parameter."
            ) from e
        else:
            # Dependency missing
            raise AgentLoadError(
                f"Module '{module_name}' has a missing dependency: {e.name}"
            ) from e
    except ImportError as e:
        raise AgentLoadError(
            f"Failed to import module '{module_name}': {e}"
        ) from e


def _get_attribute(module: Any, attr_name: str, module_name: str) -> Any:
    """Get an attribute from a module.

    Args:
        module: The imported module
        attr_name: Name of the attribute to get
        module_name: Module name for error messages

    Returns:
        The attribute value

    Raises:
        AgentLoadError: If the attribute doesn't exist
    """
    if not hasattr(module, attr_name):
        # List available attributes for helpful error
        available = [
            name for name in dir(module)
            if not name.startswith("_") and (
                callable(getattr(module, name, None)) or
                isinstance(getattr(module, name, None), type)
            )
        ]
        available_str = ", ".join(available[:10])
        if len(available) > 10:
            available_str += f", ... ({len(available) - 10} more)"

        raise AgentLoadError(
            f"Attribute '{attr_name}' not found in module '{module_name}'. "
            f"Available callables/classes: {available_str or '(none)'}"
        )

    return getattr(module, attr_name)


def _resolve_agent(attr: Any, attr_name: str, auto_wrap: bool) -> AgentProtocol:
    """Resolve an attribute to an AgentProtocol-compatible object.

    Handles:
    - Classes: Instantiate and return instance (uses .run method if available)
    - Objects already implementing AgentProtocol: Return as-is
    - Callables: Wrap with appropriate adapter if auto_wrap is True

    Args:
        attr: The attribute to resolve
        attr_name: Name for error messages
        auto_wrap: Whether to auto-wrap non-protocol callables

    Returns:
        An AgentProtocol-compatible object

    Raises:
        AgentLoadError: If the attribute cannot be resolved to an agent
    """
    # Check if it's a class
    if isinstance(attr, type):
        return _resolve_class(attr, attr_name, auto_wrap)

    # Check if it already implements AgentProtocol
    if isinstance(attr, AgentProtocol):
        return attr

    # Check if it has a run method (duck typing)
    if hasattr(attr, "run") and callable(attr.run):
        return cast(AgentProtocol, attr)

    # Check if it's a callable (function)
    if callable(attr):
        return _wrap_callable(attr, attr_name, auto_wrap)

    raise AgentLoadError(
        f"'{attr_name}' is not a callable, class, or AgentProtocol instance. "
        f"Got type: {type(attr).__name__}"
    )


def _resolve_class(cls: type, cls_name: str, auto_wrap: bool) -> AgentProtocol:
    """Resolve a class to an agent instance.

    Args:
        cls: The class to instantiate
        cls_name: Class name for error messages
        auto_wrap: Whether to auto-wrap non-protocol instances

    Returns:
        An AgentProtocol-compatible instance

    Raises:
        AgentLoadError: If instantiation fails or class doesn't match protocol
    """
    # Check if the class can be instantiated without arguments
    try:
        sig = inspect.signature(cls)
        # Count required parameters (excluding self)
        required = sum(
            1 for p in list(sig.parameters.values())
            if p.default is inspect.Parameter.empty
            and p.kind not in (
                inspect.Parameter.VAR_POSITIONAL,
                inspect.Parameter.VAR_KEYWORD
            )
        )
        if required > 0:
            raise AgentLoadError(
                f"Class '{cls_name}' requires {required} argument(s) to instantiate. "
                f"Provide a factory function or instance instead."
            )
    except (ValueError, TypeError):
        # Can't inspect signature, try instantiating anyway
        pass

    try:
        instance = cls()
    except TypeError as e:
        raise AgentLoadError(
            f"Failed to instantiate class '{cls_name}': {e}"
        ) from e

    # Check if instance has a run method
    if hasattr(instance, "run") and callable(instance.run):
        return cast(AgentProtocol, instance)

    # Check if instance is callable (has __call__)
    if callable(instance) and auto_wrap:
        return _wrap_callable(instance, cls_name, auto_wrap)

    raise AgentLoadError(
        f"Class '{cls_name}' instance does not have a 'run' method or __call__. "
        f"Agents must implement AgentProtocol (have a 'run' method)."
    )


def _wrap_callable(fn: Callable[..., Any], name: str, auto_wrap: bool) -> AgentProtocol:
    """Wrap a callable with an appropriate adapter.

    Args:
        fn: The callable to wrap
        name: Name for error messages
        auto_wrap: Whether to actually wrap

    Returns:
        Wrapped callable as AgentProtocol

    Raises:
        AgentLoadError: If auto_wrap is False and callable doesn't match protocol
    """
    if not auto_wrap:
        raise AgentLoadError(
            f"'{name}' is a callable but does not implement AgentProtocol. "
            f"Enable auto_wrap=True to wrap it with CallableAdapter."
        )

    # Check if it looks like a LangChain agent
    if _is_langchain_agent(fn):
        return LangChainAdapter(fn)

    # Default to CallableAdapter
    return CallableAdapter(fn)


def _is_langchain_agent(obj: Any) -> bool:
    """Check if an object appears to be a LangChain agent.

    Args:
        obj: Object to check

    Returns:
        True if the object looks like a LangChain agent
    """
    # Check for common LangChain types
    type_name = type(obj).__name__
    langchain_types = (
        "AgentExecutor",
        "RunnableSequence",
        "RunnableLambda",
        "RunnableParallel",
        "RunnableWithMessageHistory",
        "LLMChain",
        "ConversationChain",
    )

    if type_name in langchain_types:
        return True

    # Check for langchain in module path
    module = type(obj).__module__
    if module and "langchain" in module:
        return True

    # Check for invoke method (LangChain Runnable interface)
    return hasattr(obj, "invoke") and hasattr(obj, "batch")


def _validate_agent(agent: AgentProtocol, module_path: str) -> None:
    """Validate that an agent has a compatible signature.

    Args:
        agent: The agent to validate
        module_path: Original module path for error messages

    Raises:
        AgentSignatureError: If the agent's run method has an incompatible signature
    """
    if not hasattr(agent, "run"):
        raise AgentSignatureError(
            f"Agent loaded from '{module_path}' does not have a 'run' method."
        )

    run_method = agent.run
    if not callable(run_method):
        raise AgentSignatureError(
            f"Agent loaded from '{module_path}' has 'run' but it's not callable."
        )

    # Validate signature
    try:
        sig = inspect.signature(run_method)
    except (ValueError, TypeError):
        # Can't inspect, assume it's okay
        return

    params = list(sig.parameters.values())

    # Skip 'self' if it's a bound method
    if params and params[0].name == "self":
        params = params[1:]

    if len(params) == 0:
        raise AgentSignatureError(
            f"Agent run method from '{module_path}' takes no arguments. "
            f"Expected signature: run(query: str, context: dict | None = None)"
        )

    # First param should accept a string (query)
    first_param = params[0]
    if first_param.kind in (
        inspect.Parameter.VAR_POSITIONAL,
        inspect.Parameter.KEYWORD_ONLY
    ):
        raise AgentSignatureError(
            f"Agent run method from '{module_path}' has invalid first parameter. "
            f"Expected a positional 'query' parameter."
        )

    # Check annotation if present - we're lenient here and only warn (not fail)
    # for annotations that don't look like str or Any

    # Second param should be optional context
    if len(params) >= 2:
        second_param = params[1]
        # Should either have a default or be VAR_KEYWORD
        if (
            second_param.default is inspect.Parameter.empty
            and second_param.kind not in (
                inspect.Parameter.VAR_POSITIONAL,
                inspect.Parameter.VAR_KEYWORD
            )
        ):
            # Required second parameter - might still work but warn via the return
            pass


def get_agent_info(module_path: str, working_dir: str | Path | None = None) -> dict[str, Any]:
    """Get information about an agent without fully loading it.

    Useful for validation and documentation.

    Args:
        module_path: String in format 'module:attribute'
        working_dir: Optional directory to add to sys.path

    Returns:
        Dictionary with agent information:
            - module: str - Module name
            - attribute: str - Attribute name
            - type: str - 'function', 'class', or 'instance'
            - signature: str - The run method signature
            - docstring: str | None - Docstring if available

    Raises:
        AgentLoadError: If the agent cannot be found
    """
    module_name, attr_name = _parse_module_path(module_path)

    original_path = list(sys.path)
    if working_dir:
        working_dir = Path(working_dir).resolve()
        if str(working_dir) not in sys.path:
            sys.path.insert(0, str(working_dir))

    try:
        module = _import_module(module_name)
        attr = _get_attribute(module, attr_name, module_name)

        info = {
            "module": module_name,
            "attribute": attr_name,
            "type": "unknown",
            "signature": None,
            "docstring": None,
        }

        if isinstance(attr, type):
            info["type"] = "class"
            if hasattr(attr, "run"):
                info["signature"] = str(inspect.signature(attr.run))
                info["docstring"] = attr.run.__doc__
            else:
                info["signature"] = str(inspect.signature(attr))
                info["docstring"] = attr.__doc__
        elif callable(attr):
            info["type"] = "function"
            info["signature"] = str(inspect.signature(attr))
            info["docstring"] = attr.__doc__
        elif hasattr(attr, "run"):
            info["type"] = "instance"
            info["signature"] = str(inspect.signature(attr.run))
            info["docstring"] = attr.run.__doc__

        return info

    finally:
        sys.path[:] = original_path
