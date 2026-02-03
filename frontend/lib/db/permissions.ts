/**
 * Permission & Authorization Utilities
 *
 * Implements role-based access control (RBAC) for the multi-tenant model.
 *
 * Permission Hierarchy:
 *   Organization Level:
 *     - owner: Full control, can delete org, manage billing
 *     - admin: Can manage members, workspaces, settings
 *     - member: Can access workspaces they're added to
 *
 *   Workspace Level:
 *     - admin: Full workspace control, can manage members
 *     - member: Read/write access to resources
 *     - viewer: Read-only access
 */

import { and, eq } from 'drizzle-orm'
import { db, orgMembers, workspaceMembers, workspaces } from './index'
import type { OrgRole, WorkspaceRole } from './schema'

// =============================================================================
// Permission Definitions
// =============================================================================

export const ORG_PERMISSIONS = {
  // Organization management
  'org:read': ['owner', 'admin', 'member'],
  'org:update': ['owner', 'admin'],
  'org:delete': ['owner'],
  'org:manage_billing': ['owner'],

  // Member management
  'org:invite_members': ['owner', 'admin'],
  'org:remove_members': ['owner', 'admin'],
  'org:update_member_roles': ['owner', 'admin'],

  // Workspace management
  'org:create_workspace': ['owner', 'admin'],
  'org:delete_workspace': ['owner', 'admin'],
} as const

export const WORKSPACE_PERMISSIONS = {
  // Workspace access
  'workspace:read': ['admin', 'member', 'viewer'],
  'workspace:update': ['admin'],
  'workspace:delete': ['admin'],

  // Member management
  'workspace:invite_members': ['admin'],
  'workspace:remove_members': ['admin'],
  'workspace:update_member_roles': ['admin'],

  // Resource management (traces, evals, etc.)
  'workspace:read_traces': ['admin', 'member', 'viewer'],
  'workspace:write_traces': ['admin', 'member'],
  'workspace:read_evals': ['admin', 'member', 'viewer'],
  'workspace:write_evals': ['admin', 'member'],
  'workspace:manage_api_keys': ['admin'],

  // Analytics
  'workspace:view_analytics': ['admin', 'member', 'viewer'],
} as const

export type OrgPermission = keyof typeof ORG_PERMISSIONS
export type WorkspacePermission = keyof typeof WORKSPACE_PERMISSIONS

// =============================================================================
// Permission Checking Functions
// =============================================================================

/**
 * Get a user's role in an organization
 */
export async function getOrgRole(
  userId: string,
  organizationId: string,
): Promise<OrgRole | null> {
  const membership = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.userId, userId),
      eq(orgMembers.organizationId, organizationId),
    ),
  })
  return membership?.role ?? null
}

/**
 * Get a user's role in a workspace
 */
export async function getWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.workspaceId, workspaceId),
    ),
  })
  return membership?.role ?? null
}

/**
 * Check if a user has a specific organization permission
 */
export async function hasOrgPermission(
  userId: string,
  organizationId: string,
  permission: OrgPermission,
): Promise<boolean> {
  const role = await getOrgRole(userId, organizationId)
  if (!role) return false

  const allowedRoles = ORG_PERMISSIONS[permission] as readonly string[]
  return allowedRoles.includes(role)
}

/**
 * Check if a user has a specific workspace permission
 */
export async function hasWorkspacePermission(
  userId: string,
  workspaceId: string,
  permission: WorkspacePermission,
): Promise<boolean> {
  const role = await getWorkspaceRole(userId, workspaceId)
  if (!role) return false

  const allowedRoles = WORKSPACE_PERMISSIONS[permission] as readonly string[]
  return allowedRoles.includes(role)
}

/**
 * Check if user can access a workspace (either direct member or org admin)
 */
export async function canAccessWorkspace(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  // Check direct workspace membership
  const workspaceMembership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.workspaceId, workspaceId),
    ),
  })

  if (workspaceMembership) return true

  // Check if user is org admin/owner (they have implicit access to all workspaces)
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  })

  if (!workspace) return false

  const orgMembership = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.userId, userId),
      eq(orgMembers.organizationId, workspace.organizationId),
    ),
  })

  return orgMembership?.role === 'owner' || orgMembership?.role === 'admin'
}

/**
 * Get effective workspace role (considering org-level permissions)
 */
export async function getEffectiveWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  // Check direct workspace membership first
  const directRole = await getWorkspaceRole(userId, workspaceId)
  if (directRole) return directRole

  // Check org-level access
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  })

  if (!workspace) return null

  const orgRole = await getOrgRole(userId, workspace.organizationId)

  // Org owners and admins get admin access to all workspaces
  if (orgRole === 'owner' || orgRole === 'admin') {
    return 'admin'
  }

  return null
}

// =============================================================================
// Middleware Helpers
// =============================================================================

export interface AuthContext {
  userId: string
  organizationId?: string
  workspaceId?: string
}

/**
 * Require organization permission - throws if not authorized
 */
export async function requireOrgPermission(
  ctx: AuthContext,
  permission: OrgPermission,
): Promise<void> {
  if (!ctx.organizationId) {
    throw new Error('Organization context required')
  }

  const hasPermission = await hasOrgPermission(
    ctx.userId,
    ctx.organizationId,
    permission,
  )

  if (!hasPermission) {
    throw new Error(`Unauthorized: missing permission ${permission}`)
  }
}

/**
 * Require workspace permission - throws if not authorized
 */
export async function requireWorkspacePermission(
  ctx: AuthContext,
  permission: WorkspacePermission,
): Promise<void> {
  if (!ctx.workspaceId) {
    throw new Error('Workspace context required')
  }

  const hasPermission = await hasWorkspacePermission(
    ctx.userId,
    ctx.workspaceId,
    permission,
  )

  if (!hasPermission) {
    throw new Error(`Unauthorized: missing permission ${permission}`)
  }
}

// =============================================================================
// User's Accessible Resources
// =============================================================================

/**
 * Get all organizations a user belongs to
 */
export async function getUserOrganizations(userId: string) {
  const memberships = await db.query.orgMembers.findMany({
    where: eq(orgMembers.userId, userId),
    with: {
      organization: true,
    },
  })

  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
  }))
}

/**
 * Get all workspaces a user can access within an organization
 */
export async function getUserWorkspaces(
  userId: string,
  organizationId: string,
) {
  const orgRole = await getOrgRole(userId, organizationId)

  // Org admins/owners can see all workspaces
  if (orgRole === 'owner' || orgRole === 'admin') {
    const allWorkspaces = await db.query.workspaces.findMany({
      where: eq(workspaces.organizationId, organizationId),
    })
    return allWorkspaces.map((ws) => ({
      ...ws,
      role: 'admin' as WorkspaceRole,
    }))
  }

  // Regular members only see workspaces they're added to
  const memberships = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.userId, userId),
    with: {
      workspace: true,
    },
  })

  return memberships
    .filter((m) => m.workspace.organizationId === organizationId)
    .map((m) => ({
      ...m.workspace,
      role: m.role,
    }))
}
