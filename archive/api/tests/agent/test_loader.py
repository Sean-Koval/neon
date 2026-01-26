"""Tests for agent loader module."""

import sys
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from src.agent.loader import (
    AgentLoadError,
    AgentProtocol,
    CallableAdapter,
    LangChainAdapter,
    _is_langchain_agent,
    load_agent,
)


# =============================================================================
# Test Fixtures - Sample Agents
# =============================================================================


class SimpleAgent:
    """A simple agent that conforms to AgentProtocol."""

    def run(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        return {"response": f"Processed: {query}", "context": context}


class AgentWithoutRun:
    """An agent without a run method."""

    def process(self, query: str) -> str:
        return query


def simple_function(query: str) -> str:
    """A simple function that takes just a query."""
    return f"Result: {query}"


def function_with_context(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """A function that matches AgentProtocol signature."""
    return {"query": query, "context": context}


def function_no_args() -> str:
    """A function with no arguments (invalid)."""
    return "no args"


# =============================================================================
# Test CallableAdapter
# =============================================================================


class TestCallableAdapter:
    """Tests for CallableAdapter."""

    def test_wraps_simple_function(self):
        """Test wrapping a function that returns a string."""
        adapter = CallableAdapter(simple_function)
        result = adapter.run("hello")

        assert isinstance(result, dict)
        assert result == {"response": "Result: hello"}

    def test_wraps_function_with_context(self):
        """Test wrapping a function that accepts context."""
        adapter = CallableAdapter(function_with_context)
        result = adapter.run("hello", {"key": "value"})

        assert result == {"query": "hello", "context": {"key": "value"}}

    def test_preserves_dict_return(self):
        """Test that dict returns are preserved."""

        def returns_dict(query: str) -> dict[str, Any]:
            return {"output": query, "extra": "data"}

        adapter = CallableAdapter(returns_dict)
        result = adapter.run("test")

        assert result == {"output": "test", "extra": "data"}

    def test_context_none_by_default(self):
        """Test that context defaults to None."""
        adapter = CallableAdapter(function_with_context)
        result = adapter.run("hello")

        assert result == {"query": "hello", "context": None}


# =============================================================================
# Test LangChainAdapter
# =============================================================================


class TestLangChainAdapter:
    """Tests for LangChainAdapter."""

    def test_invoke_method(self):
        """Test adapter with invoke method."""
        mock_agent = MagicMock()
        mock_agent.invoke.return_value = {"output": "result"}

        adapter = LangChainAdapter(mock_agent)
        result = adapter.run("query", {"ctx": "val"})

        mock_agent.invoke.assert_called_once_with({"input": "query", "ctx": "val"})
        assert result == {"output": "result"}

    def test_run_method_fallback(self):
        """Test adapter falls back to run method."""
        mock_agent = MagicMock(spec=["run"])
        mock_agent.run.return_value = {"output": "from run"}

        adapter = LangChainAdapter(mock_agent)
        result = adapter.run("query")

        mock_agent.run.assert_called_once()
        assert result == {"output": "from run"}

    def test_string_output_wrapped(self):
        """Test string output is wrapped in dict."""
        mock_agent = MagicMock()
        mock_agent.invoke.return_value = "plain string"

        adapter = LangChainAdapter(mock_agent)
        result = adapter.run("query")

        assert result == {"output": "plain string"}

    def test_content_attribute_extracted(self):
        """Test objects with content attribute are handled."""
        mock_result = MagicMock()
        mock_result.content = "message content"

        mock_agent = MagicMock()
        mock_agent.invoke.return_value = mock_result

        adapter = LangChainAdapter(mock_agent)
        result = adapter.run("query")

        assert result == {"output": "message content"}


# =============================================================================
# Test _is_langchain_agent
# =============================================================================


class TestIsLangChainAgent:
    """Tests for LangChain detection."""

    def test_regular_class_not_detected(self):
        """Test that regular classes are not detected as LangChain."""
        assert not _is_langchain_agent(SimpleAgent())
        assert not _is_langchain_agent("string")
        assert not _is_langchain_agent(123)

    def test_mock_langchain_module(self):
        """Test detection by module name."""

        class FakeRunnable:
            pass

        # Simulate langchain module
        FakeRunnable.__module__ = "langchain_core.runnables"

        instance = FakeRunnable()
        assert _is_langchain_agent(instance)


# =============================================================================
# Test load_agent
# =============================================================================


class TestLoadAgent:
    """Tests for the load_agent function."""

    def test_invalid_path_no_colon(self):
        """Test error on path without colon separator."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("mymodule.agent")

        assert "Expected format: 'module:attribute'" in str(exc.value)

    def test_invalid_path_empty_module(self):
        """Test error on empty module name."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent(":function")

        assert "Both module and attribute required" in str(exc.value)

    def test_invalid_path_empty_attribute(self):
        """Test error on empty attribute name."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("module:")

        assert "Both module and attribute required" in str(exc.value)

    def test_module_not_found(self):
        """Test error when module doesn't exist."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("nonexistent_module_xyz:function")

        assert "Module 'nonexistent_module_xyz' not found" in str(exc.value)

    def test_attribute_not_found(self):
        """Test error when attribute doesn't exist."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("os:nonexistent_attribute_xyz")

        assert "has no attribute 'nonexistent_attribute_xyz'" in str(exc.value)

    def test_non_callable_attribute(self):
        """Test error when attribute is not callable."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("os:sep")  # os.sep is a string

        assert "is not callable" in str(exc.value)

    def test_load_builtin_function(self):
        """Test loading a built-in function."""
        agent = load_agent("os.path:basename")

        assert isinstance(agent, CallableAdapter)
        result = agent.run("/path/to/file.txt")
        assert result == {"response": "file.txt"}

    def test_load_class_with_run_method(self):
        """Test loading a class that has a run method."""
        # Create a temp module with our test class
        with tempfile.TemporaryDirectory() as tmpdir:
            module_file = Path(tmpdir) / "test_agent_module.py"
            module_file.write_text('''
class TestAgent:
    def run(self, query, context=None):
        return {"result": query}
''')
            agent = load_agent("test_agent_module:TestAgent", working_dir=tmpdir)

            assert hasattr(agent, "run")
            result = agent.run("hello")
            assert result == {"result": "hello"}

            # Clean up
            if "test_agent_module" in sys.modules:
                del sys.modules["test_agent_module"]

    def test_load_function_directly(self):
        """Test loading a function directly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            module_file = Path(tmpdir) / "test_func_module.py"
            module_file.write_text('''
def process_query(query, context=None):
    return {"processed": query}
''')
            agent = load_agent("test_func_module:process_query", working_dir=tmpdir)

            assert isinstance(agent, CallableAdapter)
            result = agent.run("test")
            assert result == {"processed": "test"}

            # Clean up
            if "test_func_module" in sys.modules:
                del sys.modules["test_func_module"]

    def test_class_without_run_raises(self):
        """Test that a class without run method raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            module_file = Path(tmpdir) / "bad_agent.py"
            module_file.write_text('''
class BadAgent:
    def process(self, query):
        return query
''')
            with pytest.raises(AgentLoadError) as exc:
                load_agent("bad_agent:BadAgent", working_dir=tmpdir)

            assert "has no 'run' method" in str(exc.value)

            # Clean up
            if "bad_agent" in sys.modules:
                del sys.modules["bad_agent"]

    def test_function_no_args_raises(self):
        """Test that a function with no args raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            module_file = Path(tmpdir) / "no_args.py"
            module_file.write_text('''
def no_args_func():
    return "nope"
''')
            with pytest.raises(AgentLoadError) as exc:
                load_agent("no_args:no_args_func", working_dir=tmpdir)

            assert "takes no arguments" in str(exc.value)

            # Clean up
            if "no_args" in sys.modules:
                del sys.modules["no_args"]

    def test_working_dir_added_to_path(self):
        """Test that working_dir is added to sys.path."""
        with tempfile.TemporaryDirectory() as tmpdir:
            module_file = Path(tmpdir) / "path_test.py"
            module_file.write_text('''
def func(query):
    return query
''')
            load_agent("path_test:func", working_dir=tmpdir)

            # Working dir should be in path
            assert str(Path(tmpdir).resolve()) in sys.path

            # Clean up
            if "path_test" in sys.modules:
                del sys.modules["path_test"]

    def test_relative_import_path(self):
        """Test loading from relative paths like myproject.agents.foo:bar."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create nested structure (use unique name to avoid conflict with project src)
            nested_dir = Path(tmpdir) / "myproject" / "agents"
            nested_dir.mkdir(parents=True)

            # Create __init__.py files
            (Path(tmpdir) / "myproject" / "__init__.py").write_text("")
            (nested_dir / "__init__.py").write_text("")

            # Create agent module
            (nested_dir / "research.py").write_text('''
class ResearchAgent:
    def run(self, query, context=None):
        return {"research": query}
''')

            agent = load_agent("myproject.agents.research:ResearchAgent", working_dir=tmpdir)
            result = agent.run("test query")
            assert result == {"research": "test query"}

            # Clean up
            for mod in list(sys.modules.keys()):
                if mod.startswith("myproject"):
                    del sys.modules[mod]


# =============================================================================
# Test AgentProtocol
# =============================================================================


class TestAgentProtocol:
    """Tests for AgentProtocol."""

    def test_simple_agent_conforms(self):
        """Test that SimpleAgent conforms to protocol."""
        agent = SimpleAgent()
        assert isinstance(agent, AgentProtocol)

    def test_callable_adapter_conforms(self):
        """Test that CallableAdapter conforms to protocol."""
        adapter = CallableAdapter(simple_function)
        # Runtime checkable protocols use duck typing
        assert hasattr(adapter, "run")
        result = adapter.run("test")
        assert isinstance(result, dict)

    def test_langchain_adapter_conforms(self):
        """Test that LangChainAdapter conforms to protocol."""
        mock_agent = MagicMock()
        mock_agent.invoke.return_value = {}

        adapter = LangChainAdapter(mock_agent)
        assert hasattr(adapter, "run")
        result = adapter.run("test")
        assert isinstance(result, dict)
