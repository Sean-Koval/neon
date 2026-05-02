/**
 * Workspaces Router
 *
 * Handles workspace CRUD operations and member management.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import {
  router,
  orgProcedure,
  workspaceProcedure,
  withOrgPermission,
  withWorkspacePermission,
} from "../trpc";
import {
  db,
  workspaces,
  workspaceMembers,
  users,
  orgMembers,
  type NewWorkspace,
  type WorkspaceRole,
} from "@/lib/db";
import { getUserWorkspaces } from "@/lib/db/permissions";

// =============================================================================
// Input Schemas
// =============================================================================

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
  environment: z
    .enum(["development", "staging", "production"])
    .default("development"),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  environment: z
    .enum(["development", "staging", "production"])
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "member", "viewer"]),
});

const updateMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "member", "viewer"]),
});

// =============================================================================
// Router
// =============================================================================

export const workspacesRouter = router({
  /**
   * List workspaces in the current organization
   */
  list: orgProcedure.query(async ({ ctx }) => {
    return getUserWorkspaces(ctx.userId, ctx.organizationId);
  }),

  /**
   * Get workspace by ID
   */
  get: workspaceProcedure.query(async ({ ctx }) => {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, ctx.workspaceId),
      with: {
        organization: true,
      },
    });

    if (!workspace) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Workspace not found",
      });
    }

    // Get user's role in this workspace
    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.userId, ctx.userId),
        eq(workspaceMembers.workspaceId, ctx.workspaceId)
      ),
    });

    // Check if user has implicit access through org role
    let userRole = membership?.role;
    if (!userRole) {
      const orgMembership = await db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.userId, ctx.userId),
          eq(orgMembers.organizationId, workspace.organizationId)
        ),
      });
      if (
        orgMembership?.role === "owner" ||
        orgMembership?.role === "admin"
      ) {
        userRole = "admin";
      }
    }

    return {
      ...workspace,
      userRole,
    };
  }),

  /**
   * Create a new workspace
   */
  create: withOrgPermission("org:create_workspace")
    .input(createWorkspaceSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if slug is already taken in this org
      const existing = await db.query.workspaces.findFirst({
        where: and(
          eq(workspaces.organizationId, ctx.organizationId),
          eq(workspaces.slug, input.slug)
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Workspace slug already exists in this organization",
        });
      }

      // Create workspace
      const newWorkspace: NewWorkspace = {
        organizationId: ctx.organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        environment: input.environment,
      };

      const [workspace] = await db
        .insert(workspaces)
        .values(newWorkspace)
        .returning();

      // Add creator as admin
      await db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: ctx.userId,
        role: "admin" as WorkspaceRole,
      });

      return workspace;
    }),

  /**
   * Update workspace
   */
  update: withWorkspacePermission("workspace:update")
    .input(updateWorkspaceSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(workspaces)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, ctx.workspaceId))
        .returning();

      return updated;
    }),

  /**
   * Delete workspace
   */
  delete: withWorkspacePermission("workspace:delete").mutation(
    async ({ ctx }) => {
      // Prevent deleting the last workspace
      const orgWorkspaces = await db.query.workspaces.findMany({
        where: eq(workspaces.organizationId, ctx.organizationId),
      });

      if (orgWorkspaces.length <= 1) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete the last workspace in an organization",
        });
      }

      await db.delete(workspaces).where(eq(workspaces.id, ctx.workspaceId));

      return { success: true };
    }
  ),

  /**
   * List workspace members
   */
  listMembers: workspaceProcedure.query(async ({ ctx }) => {
    const members = await db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspaceId, ctx.workspaceId),
      with: {
        user: true,
      },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      name: m.user.name,
      avatarUrl: m.user.image,
      isInherited: !!m.inheritedFromOrg,
      joinedAt: m.createdAt,
    }));
  }),

  /**
   * Add a member to the workspace
   */
  addMember: withWorkspacePermission("workspace:invite_members")
    .input(addMemberSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user is a member of the organization
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, ctx.workspaceId),
      });

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      const orgMembership = await db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.organizationId, workspace.organizationId),
          eq(orgMembers.userId, input.userId)
        ),
      });

      if (!orgMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User must be a member of the organization first",
        });
      }

      // Check if already a member
      const existingMember = await db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.userId, input.userId)
        ),
      });

      if (existingMember) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this workspace",
        });
      }

      // Add member
      const [member] = await db
        .insert(workspaceMembers)
        .values({
          workspaceId: ctx.workspaceId,
          userId: input.userId,
          role: input.role as WorkspaceRole,
        })
        .returning();

      return member;
    }),

  /**
   * Update a member's role
   */
  updateMemberRole: withWorkspacePermission("workspace:update_member_roles")
    .input(updateMemberRoleSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(workspaceMembers)
        .set({
          role: input.role as WorkspaceRole,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            eq(workspaceMembers.userId, input.userId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      return updated;
    }),

  /**
   * Remove a member from the workspace
   */
  removeMember: withWorkspacePermission("workspace:remove_members")
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            eq(workspaceMembers.userId, input.userId)
          )
        )
        .returning();

      if (deleted.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      return { success: true };
    }),

  /**
   * Leave workspace (for non-admins or if there are other admins)
   */
  leave: workspaceProcedure.mutation(async ({ ctx }) => {
    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, ctx.workspaceId),
        eq(workspaceMembers.userId, ctx.userId)
      ),
    });

    if (!member) {
      // User might have implicit access through org role
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "You have implicit access through your organization role. " +
          "You can only leave by leaving the organization.",
      });
    }

    // Check if user is the only admin
    if (member.role === "admin") {
      const adminCount = await db.query.workspaceMembers.findMany({
        where: and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.role, "admin")
        ),
      });

      if (adminCount.length <= 1) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Cannot leave. You are the only admin. " +
            "Promote another member to admin first.",
        });
      }
    }

    await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, ctx.workspaceId),
          eq(workspaceMembers.userId, ctx.userId)
        )
      );

    return { success: true };
  }),
});
