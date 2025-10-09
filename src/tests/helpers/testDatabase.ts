import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'

/**
 * Test Database Helpers
 * 
 * Shared utilities for setting up test databases across all test files.
 * This eliminates duplication of database setup logic.
 */

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>

/**
 * Create and configure an in-memory SQLite database for testing.
 * Runs migrations and enables foreign key constraints.
 * 
 * @returns A configured Drizzle database instance
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const sqlite = new Database(':memory:', { create: true })
  sqlite.run('PRAGMA foreign_keys = ON;')
  const db = drizzle(sqlite, { schema })
  await migrate(db, { migrationsFolder: './drizzle/migrations' })
  return db
}

/**
 * Create a test context with database, repository, and use case instances.
 * This is the most common setup needed across scenario tests.
 * 
 * @returns Object containing repository and updateUseCase ready for testing
 */
export async function createTestContext() {
  const db = await createTestDatabase()
  const repository = new DrizzleTimeDepositRepository(db)
  const calculator = new TimeDepositCalculator()
  const updateUseCase = new UpdateAllTimeDepositBalances(repository, calculator)
  
  return {
    db,
    repository,
    calculator,
    updateUseCase,
  }
}
