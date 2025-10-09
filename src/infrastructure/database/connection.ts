import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

const DATABASE_URL = process.env.DATABASE_URL || './data/timedeposits.db'

let dbInstance: ReturnType<typeof createDatabase> | null = null

function createDatabase() {
  const sqlite = new Database(DATABASE_URL, { create: true })
  
  sqlite.run('PRAGMA foreign_keys = ON;')
  
  return drizzle(sqlite, { schema })
}

export function getDatabase() {
  if (!dbInstance) {
    dbInstance = createDatabase()
  }
  return dbInstance
}

export function createTestDatabase() {
  const sqlite = new Database(':memory:', { create: true })
  sqlite.run('PRAGMA foreign_keys = ON;')
  return drizzle(sqlite, { schema })
}

export const db = getDatabase()

export type DrizzleDatabase = ReturnType<typeof getDatabase>
