import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

/**
 * Migration runner
 * 
 * Run this script to apply pending migrations:
 * bun src/infrastructure/database/migrate.ts
 */

const DATABASE_URL = process.env.DATABASE_URL || './data/timedeposits.db'

async function runMigrations() {
  console.log('🔄 Running migrations...')
  
  const sqlite = new Database(DATABASE_URL, { create: true })
  const db = drizzle(sqlite)
  
  try {
    migrate(db, { migrationsFolder: './drizzle/migrations' })
    console.log('✅ Migrations completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
  
  sqlite.close()
}

runMigrations()
