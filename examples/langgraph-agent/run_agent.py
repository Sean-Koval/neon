#!/usr/bin/env python3
"""
Run the LangGraph agent with Neon tracing.

Usage:
    python run_agent.py "What is 25 * 4 + 10?"
    python run_agent.py "What's the weather in San Francisco?"
    python run_agent.py "Search for the latest AI news"
"""

import argparse
import sys

from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()


def main():
    parser = argparse.ArgumentParser(
        description="Run LangGraph agent with Neon tracing"
    )
    parser.add_argument(
        "query",
        nargs="?",
        default="What is 25 * 4 + 10?",
        help="The query to send to the agent",
    )
    parser.add_argument(
        "--model",
        default="gemini-3-flash-preview",
        help="Model to use (default: gemini-3-flash-preview)",
    )
    parser.add_argument(
        "--interactive",
        "-i",
        action="store_true",
        help="Run in interactive mode",
    )

    args = parser.parse_args()

    # Import here to avoid import errors before env vars are loaded
    from agent import run_agent

    if args.interactive:
        print("Interactive mode. Type 'quit' or 'exit' to stop.\n")
        while True:
            try:
                query = input("You: ").strip()
                if query.lower() in ("quit", "exit", "q"):
                    print("Goodbye!")
                    break
                if not query:
                    continue

                run_agent(query, model=args.model)
                print()

            except KeyboardInterrupt:
                print("\nGoodbye!")
                break
            except Exception as e:
                print(f"Error: {e}")
    else:
        run_agent(args.query, model=args.model)


if __name__ == "__main__":
    main()
