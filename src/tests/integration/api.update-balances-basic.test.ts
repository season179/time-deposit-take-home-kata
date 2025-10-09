import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { FastifyInstance } from 'fastify'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createServer } from '../../api/server'
import { timeDepositRoutes } from '../../api/routes/timeDeposits'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { GetAllTimeDeposits } from '../../application/usecases/GetAllTimeDeposits'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import * as schema from '../../infrastructure/database/schema'

/**
 * Integration Tests: POST /time-deposits/update-balances
 * 
 * Category 2: Basic Balance Update Tests
 * Tests the endpoint that calculates and applies interest to all deposits
 */

describe('POST /time-deposits/update-balances - Basic Tests', () => {
  let server: FastifyInstance
  let repository: DrizzleTimeDepositRepository
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(async () => {
    // Setup in-memory database
    const sqlite = new Database(':memory:', { create: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    db = drizzle(sqlite, { schema })
    await migrate(db, { migrationsFolder: './drizzle/migrations' })
    
    // Setup repository and use cases
    repository = new DrizzleTimeDepositRepository(db)
    const calculator = new TimeDepositCalculator()
    const getAllTimeDeposits = new GetAllTimeDeposits(repository)
    const updateAllTimeDepositBalances = new UpdateAllTimeDepositBalances(repository, calculator)

    // Setup server
    server = await createServer()
    await server.register(timeDepositRoutes, {
      getAllTimeDeposits,
      updateAllTimeDepositBalances,
    })
  })

  afterEach(async () => {
    await server.close()
  })

  describe('Scenario 2.1: Happy Path - Update All Balances', () => {
    test('should update balances for all deposits and return count', async () => {
      // Setup: Create 3 deposits with different plans, all > 30 days
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      await repository.create({ planType: 'student', days: 100, balance: 2000 })
      await repository.create({ planType: 'premium', days: 60, balance: 3000 })

      // Get initial balances
      const beforeResponse = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      const beforeData = JSON.parse(beforeResponse.body)
      const beforeBalances = beforeData.map((d: any) => d.balance)

      // Action: Update balances
      const updateResponse = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      // Assertions on update response
      expect(updateResponse.statusCode).toBe(200)
      
      const updateData = JSON.parse(updateResponse.body)
      expect(updateData).toHaveProperty('updated')
      expect(updateData.updated).toBe(3)

      // Get updated balances
      const afterResponse = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      const afterData = JSON.parse(afterResponse.body)
      const afterBalances = afterData.map((d: any) => d.balance)

      // All balances should have increased
      afterBalances.forEach((balance: number, index: number) => {
        expect(balance).toBeGreaterThan(beforeBalances[index])
      })
    })
  })

  describe('Scenario 2.2: Empty Database', () => {
    test('should handle empty database gracefully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data.updated).toBe(0)
    })
  })

  describe('Scenario 2.3: Zero Balance Deposits', () => {
    test('should handle zero balance without errors', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 0 })

      const response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data.updated).toBe(1)

      // Verify balance is still 0 (0 * rate = 0)
      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(0)
    })
  })

  describe('Scenario 2.4: Response Schema Validation', () => {
    test('should return valid response schema', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      const response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')
      
      const data = JSON.parse(response.body)
      
      // Verify schema exactly matches UpdateBalancesResponseSchema
      expect(Object.keys(data)).toEqual(['updated'])
      expect(typeof data.updated).toBe('number')
      expect(Number.isInteger(data.updated)).toBe(true)
      expect(data.updated).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Scenario 2.5: Multiple Deposits of Same Plan', () => {
    test('should update all deposits of the same plan type', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      await repository.create({ planType: 'basic', days: 45, balance: 2000 })
      await repository.create({ planType: 'basic', days: 90, balance: 3000 })

      const response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data.updated).toBe(3)

      // Verify all balances increased
      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBeGreaterThan(1000)
      expect(deposits[1].balance).toBeGreaterThan(2000)
      expect(deposits[2].balance).toBeGreaterThan(3000)
    })
  })

  describe('Scenario 2.6: Large Dataset', () => {
    test('should handle many deposits efficiently', async () => {
      // Create 50 deposits
      const promises = []
      for (let i = 0; i < 50; i++) {
        promises.push(
          repository.create({
            planType: i % 3 === 0 ? 'basic' : i % 3 === 1 ? 'student' : 'premium',
            days: 60 + i,
            balance: 1000 + i * 100,
          })
        )
      }
      await Promise.all(promises)

      const startTime = Date.now()
      
      const response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const duration = Date.now() - startTime

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data.updated).toBe(50)
      
      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000)
    })
  })

  describe('Scenario 2.7: Persistence Verification', () => {
    test('should persist balance updates to database', async () => {
      const deposit = await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      const depositId = deposit.id

      // Update balances via API
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      // Verify by querying repository directly (not via API)
      const updatedDeposit = await repository.findById(depositId)
      expect(updatedDeposit).not.toBeNull()
      expect(updatedDeposit!.balance).toBeGreaterThan(1000)
      
      // Expected: 1000 + (1000 * 0.01 / 12) = 1000.83
      expect(updatedDeposit!.balance).toBeCloseTo(1000.83, 2)
    })
  })
})
