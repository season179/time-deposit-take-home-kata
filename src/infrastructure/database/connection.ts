import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

/**
 * Database configuration
 */
const DATABASE_URL = process.env.DATABASE_URL || './data/timedeposits.db'

/**
 * Singleton SQLite connection
 * 
 * Uses Bun's native SQLite driver for optimal performance
 */
let dbInstance: ReturnType<typeof createDatabase> | null = null

function createDatabase() {
  const sqlite = new Database(DATABASE_URL, { create: true })
  
  // Enable foreign key constraints (SQLite requires this to be set per connection)
  sqlite.run('PRAGMA foreign_keys = ON;')
  
  return drizzle(sqlite, { schema })
}

/**
 * Get the database instance (singleton pattern)
 */
export function getDatabase() {
  if (!dbInstance) {
    dbInstance = createDatabase()
  }
  return dbInstance
}

/**
 * Create a new database instance (useful for testing with in-memory DB)
 */
export function createTestDatabase() {
  const sqlite = new Database(':memory:', { create: true })
  sqlite.run('PRAGMA foreign_keys = ON;')
  return drizzle(sqlite, { schema })
}

// Export the database instance for convenience
export const db = getDatabase()

// Export type for dependency injection
export type DrizzleDatabase = ReturnType<typeof getDatabase>
