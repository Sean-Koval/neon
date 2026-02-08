#!/usr/bin/env tsx
/**
 * ClickHouse Schema Migration Runner
 *
 * Tracks applied migrations in a `neon._migrations` table and
 * applies new .sql files from the `clickhouse/` directory in order.
 *
 * Usage:
 *   bun run scripts/migrations/run.ts              # Apply pending migrations
 *   bun run scripts/migrations/run.ts --status     # Show migration status
 *   bun run scripts/migrations/run.ts --dry-run    # Show what would be applied
 *
 * Environment:
 *   CLICKHOUSE_URL  - ClickHouse HTTP URL (default: http://localhost:8123)
 *   CLICKHOUSE_DB   - Database name (default: neon)
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123'
const CLICKHOUSE_DB = process.env.CLICKHOUSE_DB || 'neon'
const MIGRATIONS_DIR = join(__dirname, 'clickhouse')

interface Migration {
  version: string
  name: string
  filename: string
  sql: string
  checksum: string
}

interface AppliedMigration {
  version: string
  name: string
  checksum: string
  applied_at: string
}

/**
 * Execute a ClickHouse query via HTTP interface.
 */
async function query(sql: string): Promise<string> {
  const url = `${CLICKHOUSE_URL}/?database=${CLICKHOUSE_DB}`
  const response = await fetch(url, {
    method: 'POST',
    body: sql,
    headers: { 'Content-Type': 'text/plain' },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`ClickHouse query failed (${response.status}): ${body}`)
  }

  return response.text()
}

/**
 * Execute a multi-statement SQL file. Splits on semicolons that are
 * followed by a newline (to avoid splitting inside strings).
 */
async function execStatements(sql: string): Promise<void> {
  // Split on semicolons followed by newline, filter empties
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'))

  for (const stmt of statements) {
    await query(stmt)
  }
}

/**
 * Ensure the _migrations tracking table exists.
 */
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_DB}._migrations
    (
      version String,
      name String,
      checksum String,
      applied_at DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = MergeTree()
    ORDER BY (version)
  `)
}

/**
 * Get list of already applied migrations.
 */
async function getApplied(): Promise<AppliedMigration[]> {
  const result = await query(
    `SELECT version, name, checksum, toString(applied_at) as applied_at
     FROM ${CLICKHOUSE_DB}._migrations
     ORDER BY version FORMAT JSONEachRow`,
  )

  if (!result.trim()) return []

  return result
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}

/**
 * Discover migration files from the clickhouse/ directory.
 */
function discoverMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  return files.map((filename) => {
    // Expected format: 001_initial_schema.sql
    const match = filename.match(/^(\d+)_(.+)\.sql$/)
    if (!match) {
      throw new Error(`Invalid migration filename: ${filename}. Expected format: NNN_name.sql`)
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8')
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16)

    return {
      version: match[1],
      name: match[2],
      filename,
      sql,
      checksum,
    }
  })
}

/**
 * Apply a single migration.
 */
async function applyMigration(migration: Migration): Promise<void> {
  console.log(`  Applying ${migration.filename}...`)
  await execStatements(migration.sql)
  await query(
    `INSERT INTO ${CLICKHOUSE_DB}._migrations (version, name, checksum)
     VALUES ('${migration.version}', '${migration.name}', '${migration.checksum}')`,
  )
  console.log(`  Applied ${migration.filename} (checksum: ${migration.checksum})`)
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const isStatus = args.includes('--status')

  console.log(`ClickHouse Migration Runner`)
  console.log(`  URL: ${CLICKHOUSE_URL}`)
  console.log(`  Database: ${CLICKHOUSE_DB}`)
  console.log(`  Migrations: ${MIGRATIONS_DIR}`)
  console.log()

  // Ensure database exists
  await query(`CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DB}`)
  await ensureMigrationsTable()

  const applied = await getApplied()
  const migrations = discoverMigrations()
  const appliedVersions = new Set(applied.map((a) => a.version))

  // Check for checksum mismatches (modified migrations)
  for (const a of applied) {
    const local = migrations.find((m) => m.version === a.version)
    if (local && local.checksum !== a.checksum) {
      console.error(
        `ERROR: Checksum mismatch for migration ${a.version}_${a.name}`,
      )
      console.error(`  Applied: ${a.checksum}`)
      console.error(`  Local:   ${local.checksum}`)
      console.error(`  Do not modify already-applied migrations. Create a new one instead.`)
      process.exit(1)
    }
  }

  const pending = migrations.filter((m) => !appliedVersions.has(m.version))

  if (isStatus) {
    console.log(`Applied migrations (${applied.length}):`)
    for (const a of applied) {
      console.log(`  ${a.version}_${a.name} (applied: ${a.applied_at}, checksum: ${a.checksum})`)
    }
    console.log()
    console.log(`Pending migrations (${pending.length}):`)
    for (const p of pending) {
      console.log(`  ${p.filename} (checksum: ${p.checksum})`)
    }
    return
  }

  if (pending.length === 0) {
    console.log('No pending migrations.')
    return
  }

  console.log(`Pending migrations: ${pending.length}`)
  if (isDryRun) {
    console.log('Dry run - would apply:')
    for (const p of pending) {
      console.log(`  ${p.filename} (checksum: ${p.checksum})`)
    }
    return
  }

  for (const migration of pending) {
    await applyMigration(migration)
  }

  console.log()
  console.log(`Done. Applied ${pending.length} migration(s).`)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
