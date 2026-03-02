-- PostgreSQL initialization for Neon platform
-- Creates databases and base tables for metadata storage

-- Create databases for Temporal (required by temporalio/auto-setup)
-- Owner is set to 'neon' so Temporal can create its schema tables
CREATE DATABASE temporal OWNER neon;
CREATE DATABASE temporal_visibility OWNER neon;

-- Grant ALL privileges to neon user (belt and suspenders)
GRANT ALL PRIVILEGES ON DATABASE temporal TO neon;
GRANT ALL PRIVILEGES ON DATABASE temporal_visibility TO neon;

-- Connect to temporal database and grant schema permissions
\c temporal;
GRANT ALL ON SCHEMA public TO neon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO neon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO neon;

-- Connect to temporal_visibility database and grant schema permissions
\c temporal_visibility;
GRANT ALL ON SCHEMA public TO neon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO neon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO neon;

-- Switch to neon database for metadata tables
\c neon;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255),
    scopes TEXT[] DEFAULT ARRAY['read', 'write'],
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Eval Suites table
CREATE TABLE IF NOT EXISTS suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    agent_module_path VARCHAR(500),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Eval Cases table
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    input JSONB NOT NULL,
    expected JSONB,
    scorers JSONB DEFAULT '[]',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Eval Runs table (metadata only, results in ClickHouse)
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    suite_id UUID REFERENCES suites(id) ON DELETE SET NULL,
    workflow_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    agent_version VARCHAR(100),
    config JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Score Configs table (reusable scorer definitions)
CREATE TABLE IF NOT EXISTS score_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_type VARCHAR(50) DEFAULT 'numeric',
    evaluator_type VARCHAR(50) DEFAULT 'rule_based',
    evaluator_config JSONB DEFAULT '{}',
    threshold DECIMAL(5, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_api_keys_project ON api_keys(project_id);
CREATE INDEX idx_suites_project ON suites(project_id);
CREATE INDEX idx_cases_suite ON cases(suite_id);
CREATE INDEX idx_runs_project ON runs(project_id);
CREATE INDEX idx_runs_suite ON runs(suite_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_score_configs_project ON score_configs(project_id);

-- Users table (for NextAuth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    email_verified TIMESTAMPTZ,
    auth_provider VARCHAR(50),
    auth_provider_id VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- NextAuth accounts table (OAuth provider links)
CREATE TABLE IF NOT EXISTS accounts (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(255) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type VARCHAR(255),
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);

-- NextAuth verification tokens
CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- Insert default project for development
INSERT INTO projects (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000001', 'default', 'Default development project')
ON CONFLICT (id) DO NOTHING;
