#!/usr/bin/env python3
"""
Demo Runner - Sends a variety of queries to generate interesting traces.

Runs a series of queries through the LangGraph agent, each generating
traces that appear in the Neon dashboard with different span types:
generation, tool, retrieval, etc.

Usage:
    python run_demo.py                    # Run all demo queries
    python run_demo.py --model gpt-4o     # Use a specific model
    python run_demo.py --count 3          # Run only first 3 queries
    python run_demo.py --delay 5          # Wait 5s between queries
"""

import argparse
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

# Demo queries that exercise different agent capabilities
DEMO_QUERIES = [
    # Tool use: calculator
    "What is 42 * 17 + 256?",
    # Tool use: weather
    "What's the weather like in San Francisco and New York?",
    # Tool use: search
    "Search for the latest developments in AI agents",
    # Multi-tool: calculator + reasoning
    "If I invest $10,000 at 7% annual interest, how much will I have after 5 years? Use the calculator.",
    # Multi-tool: weather + comparison
    "Compare the weather in Miami and Chicago. Which city is warmer?",
    # Complex reasoning
    "What are the top 3 benefits of using agent evaluation platforms? Search for information first.",
]


def wait_for_api(api_url: str, max_retries: int = 30, delay: float = 2.0) -> bool:
    """Wait for the Neon API to be available."""
    import httpx

    print(f"Waiting for Neon API at {api_url}...")
    for i in range(max_retries):
        try:
            response = httpx.get(f"{api_url}/api/health", timeout=5.0)
            if response.status_code < 500:
                print(f"  API is ready! (attempt {i + 1})")
                return True
        except httpx.HTTPError:
            pass

        # Also try the traces endpoint as a fallback
        try:
            response = httpx.post(
                f"{api_url}/api/v1/traces",
                json={"resourceSpans": []},
                headers={"Content-Type": "application/json"},
                timeout=5.0,
            )
            if response.status_code < 500:
                print(f"  API is ready! (attempt {i + 1})")
                return True
        except httpx.HTTPError:
            pass

        if i < max_retries - 1:
            print(f"  Not ready yet (attempt {i + 1}/{max_retries}), retrying in {delay}s...")
            time.sleep(delay)

    print("  API did not become ready in time!")
    return False


def main():
    parser = argparse.ArgumentParser(description="Run demo queries with tracing")
    parser.add_argument("--model", default="gemini-2.5-flash", help="Model to use")
    parser.add_argument("--count", type=int, default=0, help="Number of queries (0=all)")
    parser.add_argument("--delay", type=float, default=2.0, help="Delay between queries (seconds)")
    parser.add_argument("--no-wait", action="store_true", help="Don't wait for API")
    args = parser.parse_args()

    api_url = os.getenv("NEON_API_URL", "http://localhost:3000")

    # Wait for the API to be available
    if not args.no_wait:
        if not wait_for_api(api_url):
            print("\nNeon API is not available. Make sure the platform is running:")
            print("  docker compose up -d")
            print("  # or: bun dev (in frontend/)")
            sys.exit(1)

    from agent import run_agent

    queries = DEMO_QUERIES[: args.count] if args.count > 0 else DEMO_QUERIES

    print(f"\n{'=' * 60}")
    print(f"  Neon Demo: Running {len(queries)} queries")
    print(f"  Model: {args.model}")
    print(f"  Dashboard: {api_url}/traces")
    print(f"{'=' * 60}\n")

    for i, query in enumerate(queries, 1):
        print(f"\n--- Query {i}/{len(queries)} ---")
        try:
            run_agent(query, model=args.model)
        except Exception as e:
            print(f"  Error: {e}")

        if i < len(queries):
            print(f"\n  (waiting {args.delay}s before next query...)")
            time.sleep(args.delay)

    print(f"\n{'=' * 60}")
    print(f"  Demo complete! View traces at:")
    print(f"  {api_url}/traces")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
