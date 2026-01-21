"""Tests for agent loader functionality."""

import sys
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.agent.adapters import AgentProtocol, CallableAdapter, LangChainAdapter
from src.agent.loader import (
    AgentLoadError,
    AgentSignatureError,
    _is_langchain_agent,
    _parse_module_path,
    _validate_agent,
    get_agent_info,
    load_agent,
)


# =============================================================================
# Test Fixtures - Sample agents for testing
# =============================================================================


def simple_function_agent(query: str, context: dict[str, Any] | None = None) -> str:
    """A simple function that returns a string."""
    return f"Response to: {query}"


def dict_returning_agent(query: str, context: dict | None = None) -> dict:
    """A function that returns a dict with full agent output format."""
    return {
        "output": f"Processed: {query}",
        "tools_called": ["search", "calculate"],
        "metadata": {"source": "test"},
    }


def kwargs_agent(query: str, **kwargs) -> str:
    """A function that accepts kwargs."""
    ctx = kwargs.get("context", {})
    return f"Query: {query}, context keys: {list(ctx.keys())}"


class ClassAgent:
    """A class-based agent with run method."""

    def __init__(self):
        self.name = "ClassAgent"

    def run(self, query: str, context: dict | None = None) -> dict:
        return {
            "output": f"{self.name} processed: {query}",
            "tools_called": [],
            "metadata": {},
        }


class ClassAgentWithInit:
    """A class that requires init arguments (should fail)."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def run(self, query: str, context: dict | None = None) -> dict:
        return {"output": query, "tools_called": [], "metadata": {}}


class CallableClass:
    """A class that's callable via __call__."""

    def __call__(self, query: str, context: dict | None = None) -> str:
        return f"Called with: {query}"


class NoRunMethod:
    """A class without a run method."""

    pass


# =============================================================================
# Test _parse_module_path
# =============================================================================


class TestParseModulePath:
    """Tests for module path parsing."""

    def test_simple_module_path(self):
        """Test parsing 'module:function' format."""
        module, attr = _parse_module_path("myagent:run")
        assert module == "myagent"
        assert attr == "run"

    def test_dotted_module_path(self):
        """Test parsing 'src.agents.foo:bar' format."""
        module, attr = _parse_module_path("src.agents.research:ResearchAgent")
        assert module == "src.agents.research"
        assert attr == "ResearchAgent"

    def test_deep_dotted_path(self):
        """Test deeply nested module paths."""
        module, attr = _parse_module_path("a.b.c.d.e:MyClass")
        assert module == "a.b.c.d.e"
        assert attr == "MyClass"

    def test_invalid_no_colon(self):
        """Test error when no colon separator."""
        with pytest.raises(AgentLoadError) as exc:
            _parse_module_path("myagent_run")
        assert "Expected format 'module:attribute'" in str(exc.value)

    def test_invalid_empty_module(self):
        """Test error when module is empty."""
        with pytest.raises(AgentLoadError) as exc:
            _parse_module_path(":run")
        assert "Expected format 'module:attribute'" in str(exc.value)

    def test_invalid_empty_attribute(self):
        """Test error when attribute is empty."""
        with pytest.raises(AgentLoadError) as exc:
            _parse_module_path("myagent:")
        assert "Expected format 'module:attribute'" in str(exc.value)

    def test_colon_in_attribute(self):
        """Test that only first colon is used as separator."""
        module, attr = _parse_module_path("module:class:method")
        assert module == "module"
        assert attr == "class:method"


# =============================================================================
# Test load_agent with built-in modules
# =============================================================================


class TestLoadAgentBuiltins:
    """Tests loading agents from built-in modules."""

    def test_load_builtin_function(self):
        """Test loading a built-in function (json.loads)."""
        # json.loads doesn't match AgentProtocol, but we can load and wrap it
        agent = load_agent("json:loads", auto_wrap=True)
        assert hasattr(agent, "run")

    def test_load_os_path_join(self):
        """Test loading os.path.join (should wrap as callable)."""
        agent = load_agent("os.path:join", auto_wrap=True)
        assert hasattr(agent, "run")

    def test_module_not_found(self):
        """Test clear error when module doesn't exist."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("nonexistent_module_xyz:run")
        assert "Module 'nonexistent_module_xyz' not found" in str(exc.value)

    def test_attribute_not_found(self):
        """Test clear error when attribute doesn't exist."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("json:nonexistent_function")
        assert "Attribute 'nonexistent_function' not found" in str(exc.value)
        assert "Available callables" in str(exc.value)


# =============================================================================
# Test load_agent with test fixtures
# =============================================================================


class TestLoadAgentFromTestModule:
    """Tests loading agents from this test module."""

    @pytest.fixture(autouse=True)
    def setup_module_path(self):
        """Ensure test module is importable."""
        # The test module should be in sys.path via pytest
        pass

    def test_load_simple_function(self):
        """Test loading a simple function agent."""
        agent = load_agent(
            "tests.agent.test_loader:simple_function_agent",
            working_dir=Path(__file__).parent.parent.parent,
        )
        assert hasattr(agent, "run")
        result = agent.run("hello")
        assert result["output"] == "Response to: hello"

    def test_load_dict_returning_function(self):
        """Test loading a function that returns dict."""
        agent = load_agent(
            "tests.agent.test_loader:dict_returning_agent",
            working_dir=Path(__file__).parent.parent.parent,
        )
        result = agent.run("test query")
        assert result["output"] == "Processed: test query"
        assert result["tools_called"] == ["search", "calculate"]

    def test_load_kwargs_function(self):
        """Test loading a function with **kwargs."""
        agent = load_agent(
            "tests.agent.test_loader:kwargs_agent",
            working_dir=Path(__file__).parent.parent.parent,
        )
        result = agent.run("hello", {"key": "value"})
        assert "hello" in result["output"]

    def test_load_class_agent(self):
        """Test loading a class-based agent (instantiates and uses run method)."""
        agent = load_agent(
            "tests.agent.test_loader:ClassAgent",
            working_dir=Path(__file__).parent.parent.parent,
        )
        result = agent.run("test")
        assert "ClassAgent processed: test" in result["output"]

    def test_load_class_requiring_init_args_fails(self):
        """Test that class requiring init args raises clear error."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent(
                "tests.agent.test_loader:ClassAgentWithInit",
                working_dir=Path(__file__).parent.parent.parent,
            )
        assert "requires" in str(exc.value).lower() or "argument" in str(exc.value).lower()

    def test_load_class_without_run_method_fails(self):
        """Test that class without run method raises clear error."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent(
                "tests.agent.test_loader:NoRunMethod",
                working_dir=Path(__file__).parent.parent.parent,
            )
        assert "run" in str(exc.value).lower()


# =============================================================================
# Test CallableAdapter
# =============================================================================


class TestCallableAdapter:
    """Tests for CallableAdapter."""

    def test_wrap_string_returning_function(self):
        """Test wrapping a function that returns string."""
        adapter = CallableAdapter(simple_function_agent)
        result = adapter.run("hello")

        assert result["output"] == "Response to: hello"
        assert result["tools_called"] == []
        assert result["metadata"] == {}

    def test_wrap_dict_returning_function(self):
        """Test wrapping a function that returns dict."""
        adapter = CallableAdapter(dict_returning_agent)
        result = adapter.run("test")

        assert result["output"] == "Processed: test"
        assert result["tools_called"] == ["search", "calculate"]
        assert result["metadata"] == {"source": "test"}

    def test_wrap_kwargs_function(self):
        """Test wrapping a function with **kwargs."""
        adapter = CallableAdapter(kwargs_agent)
        result = adapter.run("query", {"foo": "bar"})

        assert "query" in result["output"].lower()

    def test_wrap_lambda(self):
        """Test wrapping a lambda function."""
        fn = lambda q, ctx=None: f"Lambda: {q}"
        adapter = CallableAdapter(fn)
        result = adapter.run("test")

        assert result["output"] == "Lambda: test"

    def test_context_passed_correctly(self):
        """Test that context is passed to the wrapped function."""

        def context_checker(query: str, **ctx):
            return {"output": str(ctx), "tools_called": [], "metadata": {}}

        adapter = CallableAdapter(context_checker)
        result = adapter.run("q", {"key": "value"})

        assert "key" in result["output"]


# =============================================================================
# Test LangChainAdapter
# =============================================================================


class TestLangChainAdapter:
    """Tests for LangChainAdapter."""

    def test_wrap_object_with_invoke(self):
        """Test wrapping object with invoke method."""
        mock_agent = MagicMock()
        mock_agent.invoke.return_value = {
            "output": "LangChain response",
            "intermediate_steps": [],
        }

        adapter = LangChainAdapter(mock_agent)
        result = adapter.run("hello")

        assert result["output"] == "LangChain response"
        mock_agent.invoke.assert_called_once()

    def test_extract_tools_from_intermediate_steps(self):
        """Test extracting tool names from intermediate_steps."""
        mock_action = MagicMock()
        mock_action.tool = "web_search"

        mock_agent = MagicMock()
        mock_agent.invoke.return_value = {
            "output": "Result",
            "intermediate_steps": [
                (mock_action, "search result"),
            ],
        }

        adapter = LangChainAdapter(mock_agent)
        result = adapter.run("search query")

        assert result["tools_called"] == ["web_search"]

    def test_wrap_object_with_run_method(self):
        """Test wrapping object with legacy run method."""
        mock_chain = MagicMock(spec=["run"])
        del mock_chain.invoke  # Remove invoke to test run fallback
        mock_chain.run.return_value = "Chain output"

        adapter = LangChainAdapter(mock_chain)
        result = adapter.run("test")

        assert result["output"] == "Chain output"

    def test_wrap_callable_langchain_object(self):
        """Test wrapping callable LangChain object."""
        mock_runnable = MagicMock(spec=["__call__"])
        del mock_runnable.invoke
        del mock_runnable.run
        mock_runnable.return_value = {"output": "Direct call"}

        adapter = LangChainAdapter(mock_runnable)
        result = adapter.run("test")

        assert result["output"] == "Direct call"

    def test_string_output_normalized(self):
        """Test that string output is normalized to dict."""
        mock_agent = MagicMock()
        mock_agent.invoke.return_value = "Simple string response"

        adapter = LangChainAdapter(mock_agent)
        result = adapter.run("test")

        assert result["output"] == "Simple string response"
        assert result["tools_called"] == []


# =============================================================================
# Test _is_langchain_agent detection
# =============================================================================


class TestIsLangchainAgent:
    """Tests for LangChain agent detection."""

    def test_detects_by_class_name(self):
        """Test detection by class name."""
        mock = MagicMock()
        mock.__class__.__name__ = "AgentExecutor"
        mock.__class__.__module__ = "some.module"

        assert _is_langchain_agent(mock) is True

    def test_detects_by_module_name(self):
        """Test detection by module containing 'langchain'."""
        mock = MagicMock()
        mock.__class__.__name__ = "CustomClass"
        mock.__class__.__module__ = "langchain_community.agents.custom"

        assert _is_langchain_agent(mock) is True

    def test_detects_by_interface(self):
        """Test detection by Runnable interface (invoke + batch)."""
        mock = MagicMock(spec=["invoke", "batch"])
        mock.__class__.__name__ = "Unknown"
        mock.__class__.__module__ = "unknown"

        assert _is_langchain_agent(mock) is True

    def test_rejects_non_langchain(self):
        """Test rejection of non-LangChain objects."""
        mock = MagicMock(spec=["some_method"])
        mock.__class__.__name__ = "RegularClass"
        mock.__class__.__module__ = "mymodule"

        assert _is_langchain_agent(mock) is False


# =============================================================================
# Test signature validation
# =============================================================================


class TestValidateAgent:
    """Tests for agent signature validation."""

    def test_valid_agent_passes(self):
        """Test that valid agent passes validation."""
        agent = CallableAdapter(simple_function_agent)
        # Should not raise
        _validate_agent(agent, "test:agent")

    def test_missing_run_method_fails(self):
        """Test that missing run method fails."""

        class NoRun:
            pass

        with pytest.raises(AgentSignatureError) as exc:
            _validate_agent(NoRun(), "test:agent")
        assert "run" in str(exc.value).lower()

    def test_non_callable_run_fails(self):
        """Test that non-callable run attribute fails."""

        class RunNotCallable:
            run = "not a method"

        with pytest.raises(AgentSignatureError) as exc:
            _validate_agent(RunNotCallable(), "test:agent")
        assert "not callable" in str(exc.value).lower()

    def test_run_with_no_params_fails(self):
        """Test that run() with no params fails."""

        class NoParams:
            def run(self):
                return {}

        with pytest.raises(AgentSignatureError) as exc:
            _validate_agent(NoParams(), "test:agent")
        assert "no arguments" in str(exc.value).lower()


# =============================================================================
# Test get_agent_info
# =============================================================================


class TestGetAgentInfo:
    """Tests for get_agent_info utility."""

    def test_get_info_for_function(self):
        """Test getting info for a function."""
        info = get_agent_info(
            "tests.agent.test_loader:simple_function_agent",
            working_dir=Path(__file__).parent.parent.parent,
        )

        assert info["module"] == "tests.agent.test_loader"
        assert info["attribute"] == "simple_function_agent"
        assert info["type"] == "function"
        assert "query" in info["signature"]
        assert info["docstring"] is not None

    def test_get_info_for_class(self):
        """Test getting info for a class."""
        info = get_agent_info(
            "tests.agent.test_loader:ClassAgent",
            working_dir=Path(__file__).parent.parent.parent,
        )

        assert info["type"] == "class"
        assert "run" in info["signature"].lower() or "self" in info["signature"]

    def test_get_info_module_not_found(self):
        """Test error for non-existent module."""
        with pytest.raises(AgentLoadError):
            get_agent_info("nonexistent:thing")


# =============================================================================
# Test working_dir functionality
# =============================================================================


class TestWorkingDir:
    """Tests for working_dir path manipulation."""

    def test_working_dir_added_to_path(self):
        """Test that working_dir is added to sys.path temporarily."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a test module
            module_path = Path(tmpdir) / "test_agent.py"
            module_path.write_text(
                """
def run(query, context=None):
    return {"output": "from temp dir", "tools_called": [], "metadata": {}}
"""
            )

            agent = load_agent("test_agent:run", working_dir=tmpdir)
            result = agent.run("test")

            assert result["output"] == "from temp dir"

        # Verify path was cleaned up
        assert tmpdir not in sys.path

    def test_sys_path_restored_on_error(self):
        """Test that sys.path is restored even when loading fails."""
        original_path = list(sys.path)

        with pytest.raises(AgentLoadError):
            load_agent(
                "nonexistent:thing",
                working_dir="/some/fake/path",
            )

        assert sys.path == original_path


# =============================================================================
# Test auto_wrap behavior
# =============================================================================


class TestAutoWrap:
    """Tests for auto_wrap parameter."""

    def test_auto_wrap_true_wraps_callable(self):
        """Test that auto_wrap=True wraps callables."""
        # json.dumps is a callable but doesn't match AgentProtocol
        agent = load_agent("json:dumps", auto_wrap=True)
        assert isinstance(agent, (CallableAdapter, LangChainAdapter))

    def test_auto_wrap_false_rejects_non_protocol(self):
        """Test that auto_wrap=False rejects non-protocol callables."""
        with pytest.raises(AgentLoadError) as exc:
            load_agent("json:dumps", auto_wrap=False)
        assert "auto_wrap" in str(exc.value).lower()


# =============================================================================
# Integration tests
# =============================================================================


class TestIntegration:
    """Integration tests for end-to-end agent loading."""

    def test_full_workflow_with_class_agent(self):
        """Test full workflow: load class agent, run, get results."""
        agent = load_agent(
            "tests.agent.test_loader:ClassAgent",
            working_dir=Path(__file__).parent.parent.parent,
        )

        # Verify it's a valid agent
        assert hasattr(agent, "run")

        # Run it
        result = agent.run("integration test", {"key": "value"})

        # Verify output format
        assert "output" in result
        assert "tools_called" in result
        assert "integration test" in result["output"]

    def test_full_workflow_with_function_agent(self):
        """Test full workflow with function agent."""
        agent = load_agent(
            "tests.agent.test_loader:dict_returning_agent",
            working_dir=Path(__file__).parent.parent.parent,
        )

        result = agent.run("test query")

        assert result["output"] == "Processed: test query"
        assert result["tools_called"] == ["search", "calculate"]
        assert result["metadata"]["source"] == "test"
