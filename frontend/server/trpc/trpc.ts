/**
 * tRPC Server Configuration
 *
 * Sets up the tRPC router and procedures with multi-tenant context.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq, and } from "drizzle-orm";
import { getToken } from "next-auth/jwt";
import { db, orgMembers, workspaceMembers, workspaces } from "@/lib/db";
import {
  hasOrgPermission,
  hasWorkspacePermission,
  canAccessWorkspace,
  type OrgPermission,
  type WorkspacePermission,
} from "@/lib/db/permissions";

/**
 * Context passed to every tRPC procedure
 */
export interface Context {
  // Legacy project ID (for backward compatibility with existing routes)
  projectId: string;
  // Multi-tenant context
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  headers: Headers;
}

/**
 * Context with required userId (for protected procedures)
 */
export interface AuthenticatedContext extends Context {
  userId: string;
}

/**
 * Context with required org context
 */
export interface OrgContext extends AuthenticatedContext {
  organizationId: string;
}

/**
 * Context with required workspace context
 */
export interface WorkspaceContext extends AuthenticatedContext {
  workspaceId: string;
  organizationId: string;
}

/**
 * Create context from request
 */
export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<Context> {
  const url = new URL(opts.req.url);

  // Get project ID from header or query (legacy support)
  const projectId =
    opts.req.headers.get("x-project-id") ||
    url.searchParams.get("projectId") ||
    "default";

  // Get organization ID from header or query
  let organizationId: string | undefined =
    opts.req.headers.get("x-organization-id") ||
    url.searchParams.get("organizationId") ||
    undefined;

  // Get workspace ID from header or query
  let workspaceId: string | undefined =
    opts.req.headers.get("x-workspace-id") ||
    url.searchParams.get("workspaceId") ||
    undefined;

  // Dev auth bypass — matches withAuth middleware behavior
  if (
    process.env.NODE_ENV === "development" &&
    process.env.AUTH_DEV_BYPASS === "true"
  ) {
    return {
      projectId,
      organizationId: organizationId || "dev-org-001",
      workspaceId:
        workspaceId ||
        process.env.DEV_WORKSPACE_ID ||
        "00000000-0000-0000-0000-000000000001",
      userId: "dev-user-001",
      headers: opts.req.headers,
    };
  }

  // Authenticate via NextAuth JWT session cookie
  let userId: string | undefined;
  try {
    const token = await getToken({
      req: opts.req,
      secret: process.env.AUTH_SECRET,
    });
    if (token?.userId) {
      userId = token.userId as string;
      // Use org/workspace from session token if not provided in headers
      if (!organizationId && token.organizationId) {
        organizationId = token.organizationId as string;
      }
      if (!workspaceId && token.workspaceId) {
        workspaceId = token.workspaceId as string;
      }
    }
  } catch {
    // Token extraction failed — continue without auth
  }

  return {
    projectId,
    organizationId,
    workspaceId,
    userId,
    headers: opts.req.headers,
  };
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
    } as AuthenticatedContext,
  });
});

/**
 * Organization procedure (requires auth + org context + membership verification)
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.organizationId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Organization context required (x-organization-id header)",
    });
  }

  // Verify user is a member of this organization
  const membership = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.userId, ctx.userId),
      eq(orgMembers.organizationId, ctx.organizationId)
    ),
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this organization",
    });
  }

  return next({
    ctx: {
      ...ctx,
      organizationId: ctx.organizationId,
    } as OrgContext,
  });
});

/**
 * Workspace procedure (requires auth + workspace context + access verification)
 */
export const workspaceProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.workspaceId || !ctx.organizationId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Workspace context required (x-workspace-id and x-organization-id headers)",
      });
    }

    // Verify user can access this workspace (direct member or org admin)
    const hasAccess = await canAccessWorkspace(ctx.userId, ctx.workspaceId);

    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Not authorized to access this workspace",
      });
    }

    return next({
      ctx: {
        ...ctx,
        workspaceId: ctx.workspaceId,
        organizationId: ctx.organizationId,
      } as WorkspaceContext,
    });
  }
);

/**
 * Create a procedure that requires a specific organization permission
 */
export function withOrgPermission(permission: OrgPermission) {
  return orgProcedure.use(async ({ ctx, next }) => {
    const hasPermission = await hasOrgPermission(
      ctx.userId,
      ctx.organizationId,
      permission
    );

    if (!hasPermission) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing permission: ${permission}`,
      });
    }

    return next({ ctx });
  });
}

/**
 * Create a procedure that requires a specific workspace permission
 */
export function withWorkspacePermission(permission: WorkspacePermission) {
  return workspaceProcedure.use(async ({ ctx, next }) => {
    const hasPermission = await hasWorkspacePermission(
      ctx.userId,
      ctx.workspaceId,
      permission
    );

    if (!hasPermission) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing permission: ${permission}`,
      });
    }

    return next({ ctx });
  });
}
