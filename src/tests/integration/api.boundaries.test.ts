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
 * Integration Tests: Interest Calculation Boundaries
 * 
 * Category 3: CRITICAL Business Rule Testing
 * Tests the precise boundary conditions for interest calculation:
 * - 30-day threshold (all plans)
 * - 45-day threshold (premium plan)
 * - 365-day cutoff (student plan)
 */

describe('Interest Calculation Boundaries - CRITICAL', () => {
  let server: FastifyInstance
  let repository: DrizzleTimeDepositRepository
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(async () => {
    const sqlite = new Database(':memory:', { create: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder: './drizzle/migrations' })
    
    repository = new DrizzleTimeDepositRepository(db)
    const calculator = new TimeDepositCalculator()
    const getAllTimeDeposits = new GetAllTimeDeposits(repository)
    const updateAllTimeDepositBalances = new UpdateAllTimeDepositBalances(repository, calculator)

    server = await createServer()
    await server.register(timeDepositRoutes, {
      getAllTimeDeposits,
      updateAllTimeDepositBalances,
    })
  })

  afterEach(async () => {
    await server.close()
  })

  describe('30-Day Threshold - All Plans', () => {
    test('Scenario 3.1: Day 29 - NO interest (below threshold)', async () => {
      await repository.create({ planType: 'basic', days: 29, balance: 1000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(1000) // No change
    })

    test('Scenario 3.2: Day 30 - NO interest (at threshold)', async () => {
      await repository.create({ planType: 'basic', days: 30, balance: 1000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(1000) // No change - threshold is exclusive
    })

    test('Scenario 3.3: Day 31 - Interest applied (above threshold)', async () => {
      await repository.create({ planType: 'basic', days: 31, balance: 1000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // Expected: 1000 + (1000 * 0.01 / 12) = 1000.83
      expect(deposits[0].balance).toBeCloseTo(1000.83, 2)
    })

    test('Scenario 3.4: Student plan at day 30 - NO interest', async () => {
      await repository.create({ planType: 'student', days: 30, balance: 5000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(5000)
    })

    test('Scenario 3.5: Premium plan at day 30 - NO interest (needs 45 days)', async () => {
      await repository.create({ planType: 'premium', days: 30, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(10000)
    })
  })

  describe('Premium Plan 45-Day Threshold', () => {
    test('Scenario 3.6: Day 44 - NO interest (below threshold)', async () => {
      await repository.create({ planType: 'premium', days: 44, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(10000)
    })

    test('Scenario 3.7: Day 45 - NO interest (at threshold)', async () => {
      await repository.create({ planType: 'premium', days: 45, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(10000)
    })

    test('Scenario 3.8: Day 46 - Interest applied (above threshold)', async () => {
      await repository.create({ planType: 'premium', days: 46, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // Expected: 10000 + (10000 * 0.05 / 12) = 10041.67
      expect(deposits[0].balance).toBeCloseTo(10041.67, 2)
    })

    test('Scenario 3.9: Premium day 40 - Still NO interest', async () => {
      await repository.create({ planType: 'premium', days: 40, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(10000)
    })

    test('Scenario 3.10: Premium day 100 - Interest applied', async () => {
      await repository.create({ planType: 'premium', days: 100, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBeCloseTo(10041.67, 2)
    })
  })

  describe('Student Plan 365-Day Cutoff', () => {
    test('Scenario 3.11: Day 100 - Interest applied (within 1 year)', async () => {
      await repository.create({ planType: 'student', days: 100, balance: 5000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // Expected: 5000 + (5000 * 0.03 / 12) = 5012.50
      expect(deposits[0].balance).toBeCloseTo(5012.50, 2)
    })

    test('Scenario 3.12: Day 365 - Interest applied (last day)', async () => {
      await repository.create({ planType: 'student', days: 365, balance: 5000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // Expected: 5000 + (5000 * 0.03 / 12) = 5012.50
      expect(deposits[0].balance).toBeCloseTo(5012.50, 2)
    })

    test('Scenario 3.13: Day 366 - NO interest (after cutoff)', async () => {
      await repository.create({ planType: 'student', days: 366, balance: 5000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(5000) // No change
    })

    test('Scenario 3.14: Day 400 - NO interest (well after cutoff)', async () => {
      await repository.create({ planType: 'student', days: 400, balance: 5000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(5000)
    })

    test('Scenario 3.15: Day 1000 - NO interest (far beyond cutoff)', async () => {
      await repository.create({ planType: 'student', days: 1000, balance: 5000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(5000)
    })
  })

  describe('Multiple Plans at Critical Boundaries', () => {
    test('Scenario 3.16: All plans at day 30 - NO interest for any', async () => {
      await repository.create({ planType: 'basic', days: 30, balance: 1000 })
      await repository.create({ planType: 'student', days: 30, balance: 2000 })
      await repository.create({ planType: 'premium', days: 30, balance: 3000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(1000)
      expect(deposits[1].balance).toBe(2000)
      expect(deposits[2].balance).toBe(3000)
    })

    test('Scenario 3.17: All plans at day 31 - Basic and Student get interest', async () => {
      await repository.create({ planType: 'basic', days: 31, balance: 1000 })
      await repository.create({ planType: 'student', days: 31, balance: 2000 })
      await repository.create({ planType: 'premium', days: 31, balance: 3000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBeCloseTo(1000.83, 2) // Basic: 1%
      expect(deposits[1].balance).toBeCloseTo(2005.00, 2) // Student: 3%
      expect(deposits[2].balance).toBe(3000) // Premium: needs day 46
    })

    test('Scenario 3.18: All plans at day 46 - All get interest', async () => {
      await repository.create({ planType: 'basic', days: 46, balance: 1000 })
      await repository.create({ planType: 'student', days: 46, balance: 2000 })
      await repository.create({ planType: 'premium', days: 46, balance: 3000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBeCloseTo(1000.83, 2) // Basic: 1%
      expect(deposits[1].balance).toBeCloseTo(2005.00, 2) // Student: 3%
      expect(deposits[2].balance).toBeCloseTo(3012.50, 2) // Premium: 5%
    })

    test('Scenario 3.19: Student at 366, others normal - Only student gets NO interest', async () => {
      await repository.create({ planType: 'basic', days: 100, balance: 1000 })
      await repository.create({ planType: 'student', days: 366, balance: 2000 })
      await repository.create({ planType: 'premium', days: 100, balance: 3000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBeGreaterThan(1000) // Basic gets interest
      expect(deposits[1].balance).toBe(2000) // Student NO interest
      expect(deposits[2].balance).toBeGreaterThan(3000) // Premium gets interest
    })
  })

  describe('Edge Cases Near Boundaries', () => {
    test('Scenario 3.20: Multiple deposits at exact boundaries', async () => {
      await repository.create({ planType: 'basic', days: 30, balance: 1000 })
      await repository.create({ planType: 'basic', days: 31, balance: 1000 })
      await repository.create({ planType: 'premium', days: 45, balance: 1000 })
      await repository.create({ planType: 'premium', days: 46, balance: 1000 })
      await repository.create({ planType: 'student', days: 365, balance: 1000 })
      await repository.create({ planType: 'student', days: 366, balance: 1000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      
      // At boundaries - NO interest
      expect(deposits[0].balance).toBe(1000) // Basic day 30
      expect(deposits[2].balance).toBe(1000) // Premium day 45
      
      // Above boundaries - Interest applied
      expect(deposits[1].balance).toBeCloseTo(1000.83, 2) // Basic day 31: 1000 * 0.01 / 12 = 0.83
      expect(deposits[3].balance).toBeCloseTo(1004.17, 2) // Premium day 46: 1000 * 0.05 / 12 = 4.17
      expect(deposits[4].balance).toBeCloseTo(1002.50, 2) // Student day 365: 1000 * 0.03 / 12 = 2.50
      
      // After cutoff - NO interest
      expect(deposits[5].balance).toBe(1000) // Student day 366
    })
  })
})
