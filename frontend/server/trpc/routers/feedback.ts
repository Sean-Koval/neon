/**
 * Feedback Router
 *
 * tRPC procedures for human feedback/RLHF operations.
 * Handles preference and correction submissions, plus A/B comparison pairs.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { v4 as uuidv4 } from "uuid";
import { router, publicProcedure } from "../trpc";
import type { ComparisonPair, FeedbackItem, PreferenceFeedback, CorrectionFeedback } from "@/lib/types";
import { logger } from "@/lib/logger";

// =============================================================================
// In-memory stores (will be replaced with ClickHouse)
// =============================================================================

const feedbackStore = new Map<string, FeedbackItem>();
const comparisonStore = new Map<string, ComparisonPair>();

// Seed example comparison pairs for demo purposes
function seedExampleComparisons() {
  if (comparisonStore.size > 0) return;

  const examples: Omit<ComparisonPair, "id" | "created_at">[] = [
    {
      prompt: "Explain the concept of recursion in programming.",
      responseA: {
        id: uuidv4(),
        content: `Recursion is when a function calls itself to solve a problem. It breaks down a complex problem into smaller, simpler versions of the same problem.

**Key components:**
1. **Base case** - The condition that stops the recursion
2. **Recursive case** - The part where the function calls itself

**Example (factorial):**
\`\`\`python
def factorial(n):
    if n <= 1:  # Base case
        return 1
    return n * factorial(n - 1)  # Recursive case
\`\`\`

Think of it like Russian nesting dolls - each doll contains a smaller version of itself until you reach the smallest one.`,
        source: "model-a",
        metadata: { model: "gpt-4", temperature: "0.7" },
      },
      responseB: {
        id: uuidv4(),
        content: `Recursion is a programming technique where a function calls itself to solve a problem by breaking it into smaller subproblems.

Here's a simple way to think about it:
- A recursive function solves a tiny piece of the problem
- Then it calls itself to handle the rest
- It keeps going until it hits a stopping point (base case)

For example, calculating 5! (5 factorial):
- 5! = 5 x 4!
- 4! = 4 x 3!
- 3! = 3 x 2!
- 2! = 2 x 1!
- 1! = 1 (base case - stop here!)

Then we work back up: 1 -> 2 -> 6 -> 24 -> 120

**Warning:** Always include a base case, or your program will recurse forever and crash!`,
        source: "model-b",
        metadata: { model: "claude-3", temperature: "0.5" },
      },
      context: "User is learning programming basics",
      tags: ["programming", "concepts", "beginner"],
    },
    {
      prompt: "What are the best practices for error handling in a REST API?",
      responseA: {
        id: uuidv4(),
        content: `# REST API Error Handling Best Practices

1. **Use appropriate HTTP status codes**
   - 400 Bad Request - Invalid input
   - 401 Unauthorized - Authentication required
   - 403 Forbidden - Not allowed
   - 404 Not Found - Resource doesn't exist
   - 500 Internal Server Error - Server-side issues

2. **Return consistent error response format**
3. **Include request IDs for debugging**
4. **Don't expose sensitive information**
5. **Log errors server-side with full context**`,
        source: "model-a",
        metadata: { model: "gpt-4", temperature: "0.3" },
      },
      responseB: {
        id: uuidv4(),
        content: `Here are key error handling practices for REST APIs:

**HTTP Status Codes:**
- Use 4xx for client errors (bad input, unauthorized)
- Use 5xx for server errors (bugs, downtime)

**Error Response Structure:**
Always include:
- A machine-readable error code
- A human-readable message
- Optional: field-level validation errors
- Optional: documentation link

**Security Note:** Never expose stack traces, database errors, or internal paths in production responses.`,
        source: "model-b",
        metadata: { model: "claude-3", temperature: "0.3" },
      },
      context: "Developer building a production API",
      tags: ["api", "best-practices", "error-handling"],
    },
    {
      prompt: "Write a function to check if a string is a palindrome.",
      responseA: {
        id: uuidv4(),
        content: `\`\`\`python
def is_palindrome(s: str) -> bool:
    """Check if a string is a palindrome, ignoring case and non-alphanumeric characters."""
    cleaned = ''.join(c.lower() for c in s if c.isalnum())
    return cleaned == cleaned[::-1]
\`\`\`

This solution:
- Handles spaces and punctuation
- Is case-insensitive
- Uses Python's slice notation for efficient reversal
- Time complexity: O(n)
- Space complexity: O(n)`,
        source: "model-a",
        metadata: { model: "gpt-4", temperature: "0.2" },
      },
      responseB: {
        id: uuidv4(),
        content: `Here's a palindrome checker with multiple approaches:

**Simple approach:**
\`\`\`python
def is_palindrome(s):
    s = s.lower().replace(" ", "")
    return s == s[::-1]
\`\`\`

**Two-pointer approach (more efficient for large strings):**
\`\`\`python
def is_palindrome_efficient(s):
    s = ''.join(c.lower() for c in s if c.isalnum())
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True
\`\`\``,
        source: "model-b",
        metadata: { model: "claude-3", temperature: "0.2" },
      },
      context: "Coding interview preparation",
      tags: ["coding", "algorithms", "strings"],
    },
  ];

  for (const example of examples) {
    const id = uuidv4();
    comparisonStore.set(id, {
      ...example,
      id,
      created_at: new Date().toISOString(),
    });
  }
}

// Seed on module load
seedExampleComparisons();

// =============================================================================
// Zod schemas
// =============================================================================

const preferenceSchema = z.object({
  comparison_id: z.string(),
  choice: z.enum(["A", "B", "tie", "both_bad"]),
  reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  decision_time_ms: z.number().optional(),
});

const correctionSchema = z.object({
  response_id: z.string(),
  original_content: z.string(),
  corrected_content: z.string(),
  change_summary: z.string().optional(),
  correction_types: z.array(z.string()).optional(),
});

const createFeedbackInput = z.object({
  type: z.enum(["preference", "correction"]),
  preference: preferenceSchema.optional(),
  correction: correctionSchema.optional(),
  user_id: z.string().optional(),
  session_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const responseItemSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const createComparisonInput = z.object({
  prompt: z.string(),
  responseA: responseItemSchema,
  responseB: responseItemSchema,
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// =============================================================================
// Router
// =============================================================================

export const feedbackRouter = router({
  /**
   * Submit human feedback (preference or correction).
   * Maps from: POST /api/feedback
   */
  create: publicProcedure
    .input(createFeedbackInput)
    .mutation(async ({ input }) => {
      try {
        const feedbackId = uuidv4();
        const timestamp = new Date().toISOString();

        const feedbackItem: FeedbackItem = {
          id: feedbackId,
          type: input.type,
          preference: input.preference as PreferenceFeedback | undefined,
          correction: input.correction as CorrectionFeedback | undefined,
          user_id: input.user_id,
          session_id: input.session_id || uuidv4(),
          metadata: input.metadata,
          created_at: timestamp,
        };

        feedbackStore.set(feedbackId, feedbackItem);

        return {
          message: "Feedback submitted successfully",
          id: feedbackId,
          item: feedbackItem,
        };
      } catch (error) {
        logger.error({ err: error }, "Error submitting feedback");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit feedback",
          cause: error,
        });
      }
    }),

  /**
   * List feedback items with optional filters.
   * Maps from: GET /api/feedback
   */
  list: publicProcedure
    .input(
      z.object({
        type: z.enum(["preference", "correction"]).optional(),
        user_id: z.string().optional(),
        session_id: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().default(0),
      }),
    )
    .query(async ({ input }) => {
      try {
        let items = Array.from(feedbackStore.values());

        if (input.type) {
          items = items.filter((item) => item.type === input.type);
        }
        if (input.user_id) {
          items = items.filter((item) => item.user_id === input.user_id);
        }
        if (input.session_id) {
          items = items.filter((item) => item.session_id === input.session_id);
        }

        // Sort by created_at descending
        items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        );

        const total = items.length;
        items = items.slice(input.offset, input.offset + input.limit);

        return { items, total };
      } catch (error) {
        logger.error({ err: error }, "Error fetching feedback");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch feedback",
          cause: error,
        });
      }
    }),

  /**
   * List comparison pairs for A/B feedback collection.
   * Maps from: GET /api/feedback/comparisons
   */
  comparisons: publicProcedure
    .input(
      z.object({
        tag: z.string().optional(),
        limit: z.number().min(1).max(100).default(10),
        offset: z.number().default(0),
      }),
    )
    .query(async ({ input }) => {
      try {
        let items = Array.from(comparisonStore.values());

        if (input.tag) {
          items = items.filter((item) => item.tags?.includes(input.tag!));
        }

        // Sort by created_at descending
        items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        );

        const total = items.length;
        items = items.slice(input.offset, input.offset + input.limit);

        return { items, total };
      } catch (error) {
        logger.error({ err: error }, "Error fetching comparisons");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch comparisons",
          cause: error,
        });
      }
    }),

  /**
   * Create a new comparison pair.
   * Maps from: POST /api/feedback/comparisons
   */
  createComparison: publicProcedure
    .input(createComparisonInput)
    .mutation(async ({ input }) => {
      try {
        const id = uuidv4();
        const timestamp = new Date().toISOString();

        const comparison: ComparisonPair = {
          id,
          prompt: input.prompt,
          responseA: {
            id: input.responseA.id || uuidv4(),
            content: input.responseA.content,
            metadata: input.responseA.metadata,
            source: input.responseA.source,
          },
          responseB: {
            id: input.responseB.id || uuidv4(),
            content: input.responseB.content,
            metadata: input.responseB.metadata,
            source: input.responseB.source,
          },
          context: input.context,
          tags: input.tags || [],
          created_at: timestamp,
        };

        comparisonStore.set(id, comparison);

        return {
          message: "Comparison created successfully",
          id,
          item: comparison,
        };
      } catch (error) {
        logger.error({ err: error }, "Error creating comparison");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create comparison",
          cause: error,
        });
      }
    }),
});
