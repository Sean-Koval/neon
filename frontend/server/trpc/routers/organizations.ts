/**
 * Organizations Router
 *
 * Handles organization CRUD operations and member management.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import {
  router,
  protectedProcedure,
  orgProcedure,
  withOrgPermission,
} from "../trpc";
import {
  db,
  organizations,
  orgMembers,
  workspaces,
  users,
  type NewOrganization,
  type OrgRole,
} from "@/lib/db";
import { getUserOrganizations } from "@/lib/db/permissions";

// =============================================================================
// Input Schemas
// =============================================================================

const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});

const updateMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

// =============================================================================
// Router
// =============================================================================

export const organizationsRouter = router({
  /**
   * List organizations the current user belongs to
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return getUserOrganizations(ctx.userId);
  }),

  /**
   * Get organization by ID
   */
  get: orgProcedure.query(async ({ ctx }) => {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, ctx.organizationId),
      with: {
        workspaces: true,
      },
    });

    if (!org) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    // Get user's role in this org
    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.userId, ctx.userId),
        eq(orgMembers.organizationId, ctx.organizationId)
      ),
    });

    return {
      ...org,
      userRole: membership?.role,
    };
  }),

  /**
   * Create a new organization
   */
  create: protectedProcedure
    .input(createOrgSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if slug is already taken
      const existing = await db.query.organizations.findFirst({
        where: eq(organizations.slug, input.slug),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Organization slug already exists",
        });
      }

      // Create organization
      const newOrg: NewOrganization = {
        name: input.name,
        slug: input.slug,
        description: input.description,
      };

      const [org] = await db.insert(organizations).values(newOrg).returning();

      // Add creator as owner
      await db.insert(orgMembers).values({
        organizationId: org.id,
        userId: ctx.userId,
        role: "owner" as OrgRole,
        acceptedAt: new Date(),
      });

      // Create default workspace
      const [defaultWorkspace] = await db
        .insert(workspaces)
        .values({
          organizationId: org.id,
          name: "Default",
          slug: "default",
          description: "Default workspace",
          environment: "development",
        })
        .returning();

      return {
        organization: org,
        defaultWorkspace,
      };
    }),

  /**
   * Update organization
   */
  update: withOrgPermission("org:update")
    .input(updateOrgSchema)
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(organizations)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, ctx.organizationId))
        .returning();

      return updated;
    }),

  /**
   * Delete organization
   */
  delete: withOrgPermission("org:delete").mutation(async ({ ctx }) => {
    await db
      .delete(organizations)
      .where(eq(organizations.id, ctx.organizationId));

    return { success: true };
  }),

  /**
   * List organization members
   */
  listMembers: orgProcedure.query(async ({ ctx }) => {
    const members = await db.query.orgMembers.findMany({
      where: eq(orgMembers.organizationId, ctx.organizationId),
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
      avatarUrl: m.user.avatarUrl,
      joinedAt: m.acceptedAt || m.createdAt,
    }));
  }),

  /**
   * Invite a member to the organization
   */
  inviteMember: withOrgPermission("org:invite_members")
    .input(inviteMemberSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if user exists
      let user = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      // Create user if doesn't exist (for invitation)
      if (!user) {
        [user] = await db
          .insert(users)
          .values({
            email: input.email,
          })
          .returning();
      }

      // Check if already a member
      const existingMember = await db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.organizationId, ctx.organizationId),
          eq(orgMembers.userId, user.id)
        ),
      });

      if (existingMember) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this organization",
        });
      }

      // Add as member
      const [member] = await db
        .insert(orgMembers)
        .values({
          organizationId: ctx.organizationId,
          userId: user.id,
          role: input.role as OrgRole,
          invitedBy: ctx.userId,
          invitedAt: new Date(),
        })
        .returning();

      return {
        memberId: member.id,
        userId: user.id,
        email: input.email,
        role: input.role,
      };
    }),

  /**
   * Update a member's role
   */
  updateMemberRole: withOrgPermission("org:update_member_roles")
    .input(updateMemberRoleSchema)
    .mutation(async ({ ctx, input }) => {
      // Can't change owner role through this endpoint
      const member = await db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.organizationId, ctx.organizationId),
          eq(orgMembers.userId, input.userId)
        ),
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      if (member.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot change owner role",
        });
      }

      const [updated] = await db
        .update(orgMembers)
        .set({
          role: input.role as OrgRole,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orgMembers.organizationId, ctx.organizationId),
            eq(orgMembers.userId, input.userId)
          )
        )
        .returning();

      return updated;
    }),

  /**
   * Remove a member from the organization
   */
  removeMember: withOrgPermission("org:remove_members")
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Can't remove yourself if you're the owner
      const member = await db.query.orgMembers.findFirst({
        where: and(
          eq(orgMembers.organizationId, ctx.organizationId),
          eq(orgMembers.userId, input.userId)
        ),
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      if (member.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot remove the organization owner",
        });
      }

      await db
        .delete(orgMembers)
        .where(
          and(
            eq(orgMembers.organizationId, ctx.organizationId),
            eq(orgMembers.userId, input.userId)
          )
        );

      return { success: true };
    }),

  /**
   * Leave organization (for non-owners)
   */
  leave: orgProcedure.mutation(async ({ ctx }) => {
    const member = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.organizationId, ctx.organizationId),
        eq(orgMembers.userId, ctx.userId)
      ),
    });

    if (!member) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Not a member of this organization",
      });
    }

    if (member.role === "owner") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Owner cannot leave. Transfer ownership first.",
      });
    }

    await db
      .delete(orgMembers)
      .where(
        and(
          eq(orgMembers.organizationId, ctx.organizationId),
          eq(orgMembers.userId, ctx.userId)
        )
      );

    return { success: true };
  }),
});
