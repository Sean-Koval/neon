-- Initialize PostgreSQL databases for Neon platform

-- Create temporal database for Temporal server
CREATE DATABASE temporal;
CREATE DATABASE temporal_visibility;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE temporal TO neon;
GRANT ALL PRIVILEGES ON DATABASE temporal_visibility TO neon;

-- Neon metadata tables will be created by migrations
-- This file just ensures the databases exist
