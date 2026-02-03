-- Multi-tenant Organization/Workspace Model Migration
-- Creates the core tables for organizations, workspaces, and RBAC

-- =============================================================================
-- Enums
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE workspace_role AS ENUM ('admin', 'member', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- Users Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    -- Auth provider info (for SSO integration)
    auth_provider VARCHAR(50),
    auth_provider_id VARCHAR(255),
    -- Metadata
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_auth_provider_idx ON users(auth_provider, auth_provider_id);

-- =============================================================================
-- Organizations Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    logo_url TEXT,
    -- Billing & limits (for usage-based billing integration)
    billing_email VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'free',
    -- Settings stored as JSON
    settings JSONB DEFAULT '{}',
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_idx ON organizations(slug);

-- =============================================================================
-- Workspaces Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    -- Environment type for separation
    environment VARCHAR(50) DEFAULT 'development',
    -- Settings (retention, quotas, etc.)
    settings JSONB DEFAULT '{}',
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_org_slug_idx ON workspaces(organization_id, slug);
CREATE INDEX IF NOT EXISTS workspaces_org_id_idx ON workspaces(organization_id);

-- =============================================================================
-- Organization Members Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role org_role NOT NULL DEFAULT 'member',
    -- Invitation tracking
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS org_members_org_user_idx ON org_members(organization_id, user_id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON org_members(user_id);

-- =============================================================================
-- Workspace Members Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role workspace_role NOT NULL DEFAULT 'member',
    -- Inherited from org or explicitly set
    inherited_from_org UUID REFERENCES organizations(id),
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_ws_user_idx ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS workspace_members_ws_id_idx ON workspace_members(workspace_id);

-- =============================================================================
-- API Keys Table (workspace-scoped, replaces old project-scoped version)
-- =============================================================================

-- First, check if old api_keys table exists and needs migration
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'api_keys' AND column_name = 'project_id') THEN
        -- Rename old table for migration
        ALTER TABLE api_keys RENAME TO api_keys_legacy;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    name VARCHAR(255),
    -- Store hash only, never the raw key
    key_hash VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(12) NOT NULL, -- First chars for identification
    -- Permissions
    scopes JSONB DEFAULT '["read", "write"]',
    -- Expiration & usage
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_keys_workspace_id_idx ON api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys(key_prefix);

-- =============================================================================
-- Invitations Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    token VARCHAR(64) NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_idx ON invitations(token);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email);
CREATE INDEX IF NOT EXISTS invitations_org_id_idx ON invitations(organization_id);

-- =============================================================================
-- Update Triggers for updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_organizations_updated_at') THEN
        CREATE TRIGGER update_organizations_updated_at
            BEFORE UPDATE ON organizations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_workspaces_updated_at') THEN
        CREATE TRIGGER update_workspaces_updated_at
            BEFORE UPDATE ON workspaces
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_org_members_updated_at') THEN
        CREATE TRIGGER update_org_members_updated_at
            BEFORE UPDATE ON org_members
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_workspace_members_updated_at') THEN
        CREATE TRIGGER update_workspace_members_updated_at
            BEFORE UPDATE ON workspace_members
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- =============================================================================
-- Seed Default Organization (for development)
-- =============================================================================

-- Create a default user
INSERT INTO users (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@neon.local', 'Development User')
ON CONFLICT (email) DO NOTHING;

-- Create a default organization
INSERT INTO organizations (id, name, slug, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', 'Default development organization')
ON CONFLICT (slug) DO NOTHING;

-- Add default user as owner
INSERT INTO org_members (organization_id, user_id, role, accepted_at)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner', NOW())
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Create a default workspace
INSERT INTO workspaces (id, organization_id, name, slug, description, environment)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Default Workspace',
    'default',
    'Default development workspace',
    'development'
)
ON CONFLICT (organization_id, slug) DO NOTHING;

-- Add default user as workspace admin
INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- =============================================================================
-- Migration from legacy projects table
-- =============================================================================

-- If the old projects table exists, migrate data to workspaces
DO $$
DECLARE
    default_org_id UUID := '00000000-0000-0000-0000-000000000001';
    project_record RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
        FOR project_record IN SELECT * FROM projects LOOP
            -- Insert project as workspace if not already migrated
            INSERT INTO workspaces (id, organization_id, name, slug, description, created_at, updated_at)
            VALUES (
                project_record.id,
                default_org_id,
                project_record.name,
                LOWER(REGEXP_REPLACE(project_record.name, '[^a-zA-Z0-9-]', '-', 'g')),
                project_record.description,
                project_record.created_at,
                project_record.updated_at
            )
            ON CONFLICT (organization_id, slug) DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- =============================================================================
-- Helpful Views
-- =============================================================================

-- View for user's accessible workspaces with roles
CREATE OR REPLACE VIEW user_workspace_access AS
SELECT
    u.id as user_id,
    u.email,
    ws.id as workspace_id,
    ws.name as workspace_name,
    ws.slug as workspace_slug,
    ws.organization_id,
    o.name as organization_name,
    o.slug as organization_slug,
    COALESCE(wm.role::text,
        CASE
            WHEN om.role IN ('owner', 'admin') THEN 'admin'
            ELSE NULL
        END
    ) as effective_role,
    wm.id IS NOT NULL as has_direct_access,
    om.role as org_role
FROM users u
LEFT JOIN org_members om ON u.id = om.user_id
LEFT JOIN organizations o ON om.organization_id = o.id
LEFT JOIN workspaces ws ON o.id = ws.organization_id
LEFT JOIN workspace_members wm ON ws.id = wm.workspace_id AND u.id = wm.user_id
WHERE om.role IS NOT NULL OR wm.role IS NOT NULL;

COMMENT ON VIEW user_workspace_access IS 'Shows all workspaces a user can access with their effective role';
