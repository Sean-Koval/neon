/**
 * Comparisons API
 *
 * GET /api/feedback/comparisons - Get comparison pairs for feedback collection
 * POST /api/feedback/comparisons - Create a new comparison pair
 */

import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import type { ComparisonPair } from '@/lib/types'
import { logger } from '@/lib/logger'

// In-memory store for comparison pairs (will be replaced with ClickHouse)
const comparisonStore = new Map<string, ComparisonPair>()

// Seed some example comparison pairs for demo purposes
function seedExampleComparisons() {
  if (comparisonStore.size === 0) {
    const examples: Omit<ComparisonPair, 'id' | 'created_at'>[] = [
      {
        prompt: 'Explain the concept of recursion in programming.',
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
          source: 'model-a',
          metadata: { model: 'gpt-4', temperature: 0.7 },
        },
        responseB: {
          id: uuidv4(),
          content: `Recursion is a programming technique where a function calls itself to solve a problem by breaking it into smaller subproblems.

Here's a simple way to think about it:
- A recursive function solves a tiny piece of the problem
- Then it calls itself to handle the rest
- It keeps going until it hits a stopping point (base case)

For example, calculating 5! (5 factorial):
- 5! = 5 × 4!
- 4! = 4 × 3!
- 3! = 3 × 2!
- 2! = 2 × 1!
- 1! = 1 (base case - stop here!)

Then we work back up: 1 → 2 → 6 → 24 → 120

**Warning:** Always include a base case, or your program will recurse forever and crash!`,
          source: 'model-b',
          metadata: { model: 'claude-3', temperature: 0.5 },
        },
        context: 'User is learning programming basics',
        tags: ['programming', 'concepts', 'beginner'],
      },
      {
        prompt: 'What are the best practices for error handling in a REST API?',
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
\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email format is invalid",
    "details": [...]
  }
}
\`\`\`

3. **Include request IDs for debugging**

4. **Don't expose sensitive information**

5. **Log errors server-side with full context**`,
          source: 'model-a',
          metadata: { model: 'gpt-4', temperature: 0.3 },
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

**Example:**
\`\`\`json
{
  "status": 422,
  "code": "invalid_email",
  "message": "The email address provided is not valid.",
  "field": "email",
  "docs": "https://api.example.com/docs/errors#invalid_email"
}
\`\`\`

**Security Note:** Never expose stack traces, database errors, or internal paths in production responses.`,
          source: 'model-b',
          metadata: { model: 'claude-3', temperature: 0.3 },
        },
        context: 'Developer building a production API',
        tags: ['api', 'best-practices', 'error-handling'],
      },
      {
        prompt: 'Write a function to check if a string is a palindrome.',
        responseA: {
          id: uuidv4(),
          content: `\`\`\`python
def is_palindrome(s: str) -> bool:
    """Check if a string is a palindrome, ignoring case and non-alphanumeric characters."""
    # Clean the string
    cleaned = ''.join(c.lower() for c in s if c.isalnum())
    # Compare with reverse
    return cleaned == cleaned[::-1]

# Examples
print(is_palindrome("A man, a plan, a canal: Panama"))  # True
print(is_palindrome("race a car"))  # False
print(is_palindrome("Was it a car or a cat I saw?"))  # True
\`\`\`

This solution:
- Handles spaces and punctuation
- Is case-insensitive
- Uses Python's slice notation for efficient reversal
- Time complexity: O(n)
- Space complexity: O(n)`,
          source: 'model-a',
          metadata: { model: 'gpt-4', temperature: 0.2 },
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
\`\`\`

The two-pointer version can exit early if a mismatch is found, making it faster for non-palindromes.

Test cases:
- "radar" → True
- "hello" → False
- "A Santa at NASA" → True`,
          source: 'model-b',
          metadata: { model: 'claude-3', temperature: 0.2 },
        },
        context: 'Coding interview preparation',
        tags: ['coding', 'algorithms', 'strings'],
      },
    ]

    for (const example of examples) {
      const id = uuidv4()
      comparisonStore.set(id, {
        ...example,
        id,
        created_at: new Date().toISOString(),
      })
    }
  }
}

// Seed on module load
seedExampleComparisons()

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    const limit = limitParam ? parseInt(limitParam, 10) : 10
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0
    const tag = searchParams.get('tag')

    // Get all comparison pairs
    let items = Array.from(comparisonStore.values())

    // Filter by tag if provided
    if (tag) {
      items = items.filter((item) => item.tags?.includes(tag))
    }

    // Sort by created_at descending
    items.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )

    const total = items.length

    // Apply pagination
    items = items.slice(offset, offset + limit)

    return NextResponse.json({
      items,
      total,
    })
  } catch (error) {
    logger.error({ err: error }, 'Error fetching comparisons')
    return NextResponse.json(
      { error: 'Failed to fetch comparisons', details: String(error) },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    if (!body.responseA || !body.responseB) {
      return NextResponse.json(
        { error: 'Both responseA and responseB are required' },
        { status: 400 },
      )
    }

    const id = uuidv4()
    const timestamp = new Date().toISOString()

    const comparison: ComparisonPair = {
      id,
      prompt: body.prompt,
      responseA: {
        id: body.responseA.id || uuidv4(),
        content: body.responseA.content,
        metadata: body.responseA.metadata,
        source: body.responseA.source,
      },
      responseB: {
        id: body.responseB.id || uuidv4(),
        content: body.responseB.content,
        metadata: body.responseB.metadata,
        source: body.responseB.source,
      },
      context: body.context,
      tags: body.tags || [],
      created_at: timestamp,
    }

    comparisonStore.set(id, comparison)

    return NextResponse.json({
      message: 'Comparison created successfully',
      id,
      item: comparison,
    })
  } catch (error) {
    logger.error({ err: error }, 'Error creating comparison')
    return NextResponse.json(
      { error: 'Failed to create comparison', details: String(error) },
      { status: 500 },
    )
  }
}
