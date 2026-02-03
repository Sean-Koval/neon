/**
 * Organization & Workspace Types
 *
 * Types for the multi-tenant organization/workspace model.
 */

// =============================================================================
// Role Types
// =============================================================================

/**
 * Organization-level roles
 */
export type OrgRole = "owner" | "admin" | "member";

/**
 * Workspace-level roles
 */
export type WorkspaceRole = "admin" | "member" | "viewer";

// =============================================================================
// User Types
// =============================================================================

/**
 * User account
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  authProvider?: string;
  authProviderId?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User with organization membership info
 */
export interface UserWithOrgMembership extends User {
  role: OrgRole;
  joinedAt?: Date;
}

/**
 * User with workspace membership info
 */
export interface UserWithWorkspaceMembership extends User {
  role: WorkspaceRole;
  isInherited: boolean;
  joinedAt?: Date;
}

// =============================================================================
// Organization Types
// =============================================================================

/**
 * Organization (tenant)
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  billingEmail?: string;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Organization with user's role
 */
export interface OrganizationWithRole extends Organization {
  userRole?: OrgRole;
}

/**
 * Organization member
 */
export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  invitedBy?: string;
  invitedAt?: Date;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Workspace Types
// =============================================================================

/**
 * Workspace environment type
 */
export type WorkspaceEnvironment = "development" | "staging" | "production";

/**
 * Workspace (project within an organization)
 */
export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  environment: WorkspaceEnvironment;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workspace with user's role
 */
export interface WorkspaceWithRole extends Workspace {
  userRole?: WorkspaceRole;
}

/**
 * Workspace member
 */
export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  inheritedFromOrg?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// API Key Types
// =============================================================================

/**
 * API key scope
 */
export type ApiKeyScope = "read" | "write" | "admin";

/**
 * API key (note: never includes the actual key, only metadata)
 */
export interface ApiKey {
  id: string;
  workspaceId: string;
  createdBy?: string;
  name?: string;
  keyPrefix: string; // First characters for identification
  scopes: ApiKeyScope[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

// =============================================================================
// Invitation Types
// =============================================================================

/**
 * Pending invitation
 */
export interface Invitation {
  id: string;
  email: string;
  organizationId: string;
  workspaceId?: string;
  role: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

// =============================================================================
// Permission Types
// =============================================================================

/**
 * Organization permission
 */
export type OrgPermission =
  | "org:read"
  | "org:update"
  | "org:delete"
  | "org:manage_billing"
  | "org:invite_members"
  | "org:remove_members"
  | "org:update_member_roles"
  | "org:create_workspace"
  | "org:delete_workspace";

/**
 * Workspace permission
 */
export type WorkspacePermission =
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:invite_members"
  | "workspace:remove_members"
  | "workspace:update_member_roles"
  | "workspace:read_traces"
  | "workspace:write_traces"
  | "workspace:read_evals"
  | "workspace:write_evals"
  | "workspace:manage_api_keys"
  | "workspace:view_analytics";

// =============================================================================
// Analytics Types
// =============================================================================

/**
 * Cross-workspace analytics summary
 */
export interface OrgAnalyticsSummary {
  totalWorkspaces: number;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  totalTokens: number;
  totalCost: number;
  avgDurationMs: number;
}

/**
 * Per-workspace analytics
 */
export interface WorkspaceAnalytics {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  totalTokens: number;
  totalCost: number;
  avgDurationMs: number;
}

// =============================================================================
// Input Types (for API calls)
// =============================================================================

/**
 * Create organization input
 */
export interface CreateOrganizationInput {
  name: string;
  slug: string;
  description?: string;
}

/**
 * Update organization input
 */
export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
}

/**
 * Create workspace input
 */
export interface CreateWorkspaceInput {
  name: string;
  slug: string;
  description?: string;
  environment?: WorkspaceEnvironment;
}

/**
 * Update workspace input
 */
export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  environment?: WorkspaceEnvironment;
  settings?: Record<string, unknown>;
}

/**
 * Invite member input
 */
export interface InviteMemberInput {
  email: string;
  role: OrgRole | WorkspaceRole;
}

/**
 * Update member role input
 */
export interface UpdateMemberRoleInput {
  userId: string;
  role: OrgRole | WorkspaceRole;
}
