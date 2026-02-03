/**
 * PostgreSQL Database Client (Drizzle ORM)
 *
 * Manages connections to the PostgreSQL database for multi-tenant
 * organization/workspace data.
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Singleton pattern for connection pool
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL || 'postgresql://neon:neon@localhost:5432/neon'

    pool = new Pool({
      connectionString,
      max: 20, // Maximum connections in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err)
    })
  }
  return pool
}

// Create Drizzle instance with schema
export const db = drizzle(getPool(), { schema })

// Export schema for use in queries
export * from './schema'

// Export type for the database instance
export type Database = typeof db

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await getPool().query('SELECT 1')
    return result.rows.length > 0
  } catch (error) {
    console.error('Database health check failed:', error)
    return false
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
