"""
LangGraph Agent with Tools

A simple ReAct-style agent with calculator, weather, and search tools.
Supports OpenAI, Anthropic, and Google Vertex AI.
"""

import json
import math
import os
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from neon_tracer import tracer


# =============================================================================
# LLM Provider Setup
# =============================================================================


def get_llm(model_name: str):
    """Get the appropriate LLM based on model name or environment.

    Supported models (2025):
        OpenAI:
            - gpt-4o-mini, gpt-4o, gpt-4-turbo
            - o1-mini, o1-preview, o3-mini

        Anthropic (direct):
            - claude-sonnet-4-5-20250514, claude-opus-4-5-20250514
            - claude-3-5-sonnet-20241022

        Vertex AI (with location="global"):
            - gemini-3-flash-preview (latest, recommended)
            - gemini-2.0-flash, gemini-1.5-pro
            - claude-sonnet-4-5@20250514 (Claude via Vertex)
            - claude-opus-4-5@20250514 (Claude via Vertex)

    For Vertex AI, set these environment variables:
        - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON key
        - GOOGLE_CLOUD_PROJECT: Your GCP project ID (default: sk-ml-inference)
        - GOOGLE_CLOUD_LOCATION: Region (default: global)
    """
    model_lower = model_name.lower()

    # OpenAI models
    if model_lower.startswith(("gpt-", "o1-", "o3-")):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model_name, temperature=0)

    # Anthropic models (direct API)
    elif model_lower.startswith("claude") and "@" not in model_name:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model_name, temperature=0)

    # Vertex AI models (Gemini or Claude via Vertex)
    elif model_lower.startswith("gemini") or "@" in model_name:
        from langchain_google_vertexai import ChatVertexAI

        # Service account auth via GOOGLE_APPLICATION_CREDENTIALS env var
        project = os.getenv("GOOGLE_CLOUD_PROJECT", "sk-ml-inference")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

        return ChatVertexAI(
            model=model_name,
            project=project,
            location=location,
            temperature=0,
        )

    else:
        # Default to OpenAI
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model_name, temperature=0)


# =============================================================================
# Tools
# =============================================================================


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression.

    Args:
        expression: A mathematical expression like "2 + 2" or "sqrt(16)"

    Returns:
        The result of the calculation
    """
    # Safe math evaluation
    allowed_names = {
        "abs": abs,
        "round": round,
        "min": min,
        "max": max,
        "sum": sum,
        "pow": pow,
        "sqrt": math.sqrt,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "pi": math.pi,
        "e": math.e,
    }

    try:
        # Replace common symbols
        expr = expression.replace("^", "**").replace("×", "*").replace("÷", "/")
        result = eval(expr, {"__builtins__": {}}, allowed_names)
        return str(result)
    except Exception as e:
        return f"Error: {e}"


@tool
def get_weather(location: str) -> str:
    """Get the current weather for a location.

    Args:
        location: City name like "San Francisco" or "New York"

    Returns:
        Weather information for the location
    """
    # Mock weather data
    weather_data = {
        "san francisco": {"temp": 62, "condition": "Foggy", "humidity": 78},
        "new york": {"temp": 45, "condition": "Cloudy", "humidity": 65},
        "los angeles": {"temp": 75, "condition": "Sunny", "humidity": 40},
        "chicago": {"temp": 38, "condition": "Windy", "humidity": 55},
        "miami": {"temp": 82, "condition": "Sunny", "humidity": 70},
    }

    location_lower = location.lower()
    if location_lower in weather_data:
        data = weather_data[location_lower]
        return f"Weather in {location}: {data['temp']}°F, {data['condition']}, {data['humidity']}% humidity"
    else:
        return f"Weather in {location}: 55°F, Partly Cloudy, 50% humidity (default)"


@tool
def web_search(query: str) -> str:
    """Search the web for information.

    Args:
        query: The search query

    Returns:
        Search results
    """
    # Mock search results
    return f"""Search results for "{query}":

1. **Latest AI News** - Recent developments in artificial intelligence include new language models and breakthroughs in robotics.

2. **Technology Updates** - Major tech companies continue to invest in AI research and development.

3. **Research Papers** - New papers published on machine learning, natural language processing, and computer vision.

Note: This is mock search data for demonstration purposes."""


# All available tools
TOOLS = [calculator, get_weather, web_search]
TOOL_MAP = {tool.name: tool for tool in TOOLS}


# =============================================================================
# Agent State
# =============================================================================


class AgentState(TypedDict):
    """State passed between agent nodes."""

    messages: Annotated[list, add_messages]
    tool_calls_made: int


# =============================================================================
# Agent Nodes
# =============================================================================


def create_agent(model_name: str = "gemini-2.5-flash"):
    """Create the agent with the specified model.

    Supported models (2025):
        - Vertex AI: gemini-2.5-flash (default), gemini-2.0-flash
        - Vertex AI Claude: claude-sonnet-4-5@20250514, claude-opus-4-5@20250514
        - OpenAI: gpt-4o-mini, gpt-4o
        - Anthropic direct: claude-sonnet-4-5-20250514
    """
    # Initialize LLM with tools
    llm = get_llm(model_name)
    llm_with_tools = llm.bind_tools(TOOLS)

    def call_model(state: AgentState) -> AgentState:
        """Call the LLM to decide next action."""
        messages = state["messages"]

        # Format messages for logging
        last_message = messages[-1] if messages else None
        input_preview = str(last_message.content)[:200] if last_message else ""

        with tracer.generation(
            name="llm-call",
            model=model_name,
            input_text=input_preview,
        ) as span:
            response = llm_with_tools.invoke(messages)

            # Update span with output
            output_preview = str(response.content)[:200] if response.content else ""
            span.attributes["gen_ai.completion"] = output_preview

            # Estimate tokens (rough)
            input_tokens = sum(len(str(m.content)) // 4 for m in messages)
            output_tokens = len(str(response.content)) // 4 if response.content else 10
            span.attributes["gen_ai.usage.input_tokens"] = input_tokens
            span.attributes["gen_ai.usage.output_tokens"] = output_tokens
            span.attributes["gen_ai.usage.total_tokens"] = input_tokens + output_tokens

            if response.tool_calls:
                span.attributes["tool_calls"] = len(response.tool_calls)

        print(f"  LLM response: {response.content[:100] if response.content else '[tool calls]'}...")

        return {"messages": [response], "tool_calls_made": state.get("tool_calls_made", 0)}

    def call_tools(state: AgentState) -> AgentState:
        """Execute tool calls from the last message."""
        last_message = state["messages"][-1]
        tool_messages = []

        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            print(f"  Calling tool: {tool_name}({tool_args})")

            with tracer.tool(
                name=f"tool-{tool_name}",
                tool_name=tool_name,
                tool_input=json.dumps(tool_args),
            ) as span:
                # Execute the tool
                tool_fn = TOOL_MAP.get(tool_name)
                if tool_fn:
                    result = tool_fn.invoke(tool_args)
                else:
                    result = f"Unknown tool: {tool_name}"

                span.attributes["tool.output"] = str(result)[:500]
                print(f"  Tool result: {result[:100]}...")

            tool_messages.append(
                ToolMessage(content=str(result), tool_call_id=tool_call["id"])
            )

        return {
            "messages": tool_messages,
            "tool_calls_made": state.get("tool_calls_made", 0) + len(tool_messages),
        }

    def should_continue(state: AgentState) -> str:
        """Decide whether to continue or end."""
        last_message = state["messages"][-1]

        # If no tool calls, we're done
        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            return "end"

        # Limit tool calls to prevent infinite loops
        if state.get("tool_calls_made", 0) >= 10:
            return "end"

        return "continue"

    # Build the graph
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", call_tools)

    # Set entry point
    workflow.set_entry_point("agent")

    # Add edges
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {"continue": "tools", "end": END},
    )
    workflow.add_edge("tools", "agent")

    return workflow.compile()


# =============================================================================
# Main Entry Point
# =============================================================================


def run_agent(query: str, model: str = "gpt-4o-mini") -> str:
    """Run the agent with tracing.

    Args:
        query: The user's question
        model: The model to use

    Returns:
        The agent's final response
    """
    agent = create_agent(model)

    with tracer.trace(f"agent-query"):
        print(f"Query: {query}\n")

        # Run the agent
        result = agent.invoke({
            "messages": [HumanMessage(content=query)],
            "tool_calls_made": 0,
        })

        # Extract final response
        final_message = result["messages"][-1]
        response = final_message.content if hasattr(final_message, "content") else str(final_message)

        print(f"\nFinal response: {response}")
        return response
