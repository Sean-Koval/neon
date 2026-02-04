/**
 * Database Schema - Multi-tenant Organization/Workspace Model
 *
 * Hierarchy:
 *   Organization (tenant boundary)
 *     └── Workspaces (projects/environments)
 *           └── Resources (traces, evals, etc.)
 *
 * Permission Model:
 *   - Organization roles: owner, admin, member
 *   - Workspace roles: admin, member, viewer
 */

import { relations } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// =============================================================================
// Enums
// =============================================================================

export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member'])
export const workspaceRoleEnum = pgEnum('workspace_role', [
  'admin',
  'member',
  'viewer',
])

// =============================================================================
// Users Table
// =============================================================================

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }),
    avatarUrl: text('avatar_url'),
    // Auth provider info (for SSO integration later)
    authProvider: varchar('auth_provider', { length: 50 }),
    authProviderId: varchar('auth_provider_id', { length: 255 }),
    // Metadata
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_idx').on(table.email),
    index('users_auth_provider_idx').on(
      table.authProvider,
      table.authProviderId,
    ),
  ],
)

// =============================================================================
// Organizations Table
// =============================================================================

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    // Billing & limits (for neon-20 integration)
    billingEmail: varchar('billing_email', { length: 255 }),
    plan: varchar('plan', { length: 50 }).default('free'),
    // Settings stored as JSON
    settings: jsonb('settings').default({}),
    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('organizations_slug_idx').on(table.slug)],
)

// =============================================================================
// Workspaces Table (replaces projects conceptually)
// =============================================================================

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),
    // Environment type for separation
    environment: varchar('environment', { length: 50 }).default('development'),
    // Settings (retention, quotas, etc.)
    settings: jsonb('settings').default({}),
    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('workspaces_org_slug_idx').on(table.organizationId, table.slug),
    index('workspaces_org_id_idx').on(table.organizationId),
  ],
)

// =============================================================================
// Organization Members Table
// =============================================================================

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('member'),
    // Invitation tracking
    invitedBy: uuid('invited_by').references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('org_members_org_user_idx').on(
      table.organizationId,
      table.userId,
    ),
    index('org_members_user_id_idx').on(table.userId),
  ],
)

// =============================================================================
// Workspace Members Table
// =============================================================================

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('member'),
    // Inherited from org or explicitly set
    inheritedFromOrg: uuid('inherited_from_org').references(
      () => organizations.id,
    ),
    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_members_ws_user_idx').on(
      table.workspaceId,
      table.userId,
    ),
    index('workspace_members_user_id_idx').on(table.userId),
    index('workspace_members_ws_id_idx').on(table.workspaceId),
  ],
)

// =============================================================================
// API Keys Table (workspace-scoped)
// =============================================================================

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id),
    name: varchar('name', { length: 255 }),
    // Store hash only, never the raw key
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(), // First chars for identification
    // Permissions
    scopes: jsonb('scopes').default(['read', 'write']),
    // Expiration & usage
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('api_keys_hash_idx').on(table.keyHash),
    index('api_keys_workspace_id_idx').on(table.workspaceId),
    index('api_keys_prefix_idx').on(table.keyPrefix),
  ],
)

// =============================================================================
// Invitations Table (for pending invites)
// =============================================================================

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    role: varchar('role', { length: 50 }).notNull(),
    token: varchar('token', { length: 64 }).notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('invitations_token_idx').on(table.token),
    index('invitations_email_idx').on(table.email),
    index('invitations_org_id_idx').on(table.organizationId),
  ],
)

// =============================================================================
// Relations
// =============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  orgMemberships: many(orgMembers),
  workspaceMemberships: many(workspaceMembers),
  createdApiKeys: many(apiKeys),
  sentInvitations: many(invitations),
}))

export const organizationsRelations = relations(organizations, ({ many }) => ({
  workspaces: many(workspaces),
  members: many(orgMembers),
  invitations: many(invitations),
}))

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  members: many(workspaceMembers),
  apiKeys: many(apiKeys),
}))

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
  }),
  invitedByUser: one(users, {
    fields: [orgMembers.invitedBy],
    references: [users.id],
  }),
}))

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  }),
)

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [apiKeys.workspaceId],
    references: [workspaces.id],
  }),
  createdByUser: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
}))

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
  invitedByUser: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}))

// =============================================================================
// Type Exports
// =============================================================================

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert

export type Workspace = typeof workspaces.$inferSelect
export type NewWorkspace = typeof workspaces.$inferInsert

export type OrgMember = typeof orgMembers.$inferSelect
export type NewOrgMember = typeof orgMembers.$inferInsert

export type WorkspaceMember = typeof workspaceMembers.$inferSelect
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert

export type Invitation = typeof invitations.$inferSelect
export type NewInvitation = typeof invitations.$inferInsert

export type OrgRole = 'owner' | 'admin' | 'member'
export type WorkspaceRole = 'admin' | 'member' | 'viewer'
