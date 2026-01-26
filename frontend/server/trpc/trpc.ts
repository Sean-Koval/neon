/**
 * tRPC Server Configuration
 *
 * Sets up the tRPC router and procedures.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

/**
 * Context passed to every tRPC procedure
 */
export interface Context {
  projectId: string;
  userId?: string;
  headers: Headers;
}

/**
 * Create context from request
 */
export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<Context> {
  // Get project ID from header or query
  const projectId =
    opts.req.headers.get("x-project-id") ||
    new URL(opts.req.url).searchParams.get("projectId") ||
    "default";

  // Get user ID from auth header (simplified for now)
  const authHeader = opts.req.headers.get("authorization");
  const userId = authHeader ? extractUserId(authHeader) : undefined;

  return {
    projectId,
    userId,
    headers: opts.req.headers,
  };
}

/**
 * Extract user ID from auth header (placeholder)
 */
function extractUserId(authHeader: string): string | undefined {
  // In a real implementation, this would validate the token
  if (authHeader.startsWith("Bearer ")) {
    return "user-from-token";
  }
  return undefined;
}

/**
 * Initialize tRPC
 */
const t = initTRPC.context<Context>().create();

/**
 * Router factory
 */
export const router = t.router;

/**
 * Public procedure (no auth required)
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure (requires auth)
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});
