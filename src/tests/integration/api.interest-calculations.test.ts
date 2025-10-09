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
 * Integration Tests: Plan-Specific Interest Calculations
 * 
 * Category 4: Interest Rate Accuracy
 * Tests the correct application of interest rates for each plan type
 */

describe('Plan-Specific Interest Calculations', () => {
  let server: FastifyInstance
  let repository: DrizzleTimeDepositRepository
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(async () => {
    const sqlite = new Database(':memory:', { create: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    db = drizzle(sqlite, { schema })
    await migrate(db, { migrationsFolder: './drizzle/migrations' })
    
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

  describe('Basic Plan - 1% Annual Interest', () => {
    test('Scenario 4.1: Standard interest calculation', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // Monthly interest: 1000 * 0.01 / 12 = 0.833... rounds to 0.83
      expect(deposits[0].balance).toBeCloseTo(1000.83, 2)
    })

    test('Scenario 4.2: Basic plan with large balance', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 100000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 100000 * 0.01 / 12 = 83.33
      expect(deposits[0].balance).toBeCloseTo(100083.33, 2)
    })

    test('Scenario 4.3: Basic plan with decimal balance', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1234.56 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 1234.56 * 0.01 / 12 = 1.0288 rounds to 1.03
      expect(deposits[0].balance).toBeCloseTo(1235.59, 2)
    })

    test('Scenario 4.4: Basic plan at day 31 (minimum)', async () => {
      await repository.create({ planType: 'basic', days: 31, balance: 5000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 5000 * 0.01 / 12 = 4.17
      expect(deposits[0].balance).toBeCloseTo(5004.17, 2)
    })
  })

  describe('Student Plan - 3% Annual Interest', () => {
    test('Scenario 4.5: Student plan standard calculation', async () => {
      await repository.create({ planType: 'student', days: 100, balance: 3000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 3000 * 0.03 / 12 = 7.50
      expect(deposits[0].balance).toBeCloseTo(3007.50, 2)
    })

    test('Scenario 4.6: Student plan with large balance', async () => {
      await repository.create({ planType: 'student', days: 100, balance: 50000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 50000 * 0.03 / 12 = 125.00
      expect(deposits[0].balance).toBeCloseTo(50125.00, 2)
    })

    test('Scenario 4.7: Student plan with decimal balance', async () => {
      await repository.create({ planType: 'student', days: 100, balance: 3333.33 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 3333.33 * 0.03 / 12 = 8.333325 rounds to 8.33
      expect(deposits[0].balance).toBeCloseTo(3341.66, 2)
    })

    test('Scenario 4.8: Student plan at day 365 (last eligible day)', async () => {
      await repository.create({ planType: 'student', days: 365, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 10000 * 0.03 / 12 = 25.00
      expect(deposits[0].balance).toBeCloseTo(10025.00, 2)
    })
  })

  describe('Premium Plan - 5% Annual Interest', () => {
    test('Scenario 4.9: Premium plan standard calculation', async () => {
      await repository.create({ planType: 'premium', days: 100, balance: 10000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 10000 * 0.05 / 12 = 41.666... rounds to 41.67
      expect(deposits[0].balance).toBeCloseTo(10041.67, 2)
    })

    test('Scenario 4.10: Premium plan with large balance', async () => {
      await repository.create({ planType: 'premium', days: 100, balance: 1000000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 1000000 * 0.05 / 12 = 4166.67
      expect(deposits[0].balance).toBeCloseTo(1004166.67, 2)
    })

    test('Scenario 4.11: Premium plan with decimal balance', async () => {
      await repository.create({ planType: 'premium', days: 100, balance: 7777.77 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 7777.77 * 0.05 / 12 = 32.407375 rounds to 32.41
      expect(deposits[0].balance).toBeCloseTo(7810.18, 2)
    })

    test('Scenario 4.12: Premium plan at day 46 (minimum)', async () => {
      await repository.create({ planType: 'premium', days: 46, balance: 15000 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 15000 * 0.05 / 12 = 62.50
      expect(deposits[0].balance).toBeCloseTo(15062.50, 2)
    })
  })

  describe('Plan Comparison - Same Conditions', () => {
    test('Scenario 4.13: All plans with same balance and days', async () => {
      const balance = 10000
      const days = 100

      await repository.create({ planType: 'basic', days, balance })
      await repository.create({ planType: 'student', days, balance })
      await repository.create({ planType: 'premium', days, balance })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()

      // Basic: 1% → 10000 * 0.01 / 12 = 8.33
      expect(deposits[0].balance).toBeCloseTo(10008.33, 2)
      
      // Student: 3% → 10000 * 0.03 / 12 = 25.00
      expect(deposits[1].balance).toBeCloseTo(10025.00, 2)
      
      // Premium: 5% → 10000 * 0.05 / 12 = 41.67
      expect(deposits[2].balance).toBeCloseTo(10041.67, 2)

      // Verify premium > student > basic
      expect(deposits[2].balance).toBeGreaterThan(deposits[1].balance)
      expect(deposits[1].balance).toBeGreaterThan(deposits[0].balance)
    })

    test('Scenario 4.14: Interest rate differences with small balance', async () => {
      const balance = 100
      const days = 100

      await repository.create({ planType: 'basic', days, balance })
      await repository.create({ planType: 'student', days, balance })
      await repository.create({ planType: 'premium', days, balance })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()

      // Basic: 100 * 0.01 / 12 = 0.083... rounds to 0.08
      expect(deposits[0].balance).toBeCloseTo(100.08, 2)
      
      // Student: 100 * 0.03 / 12 = 0.25
      expect(deposits[1].balance).toBeCloseTo(100.25, 2)
      
      // Premium: 100 * 0.05 / 12 = 0.416... rounds to 0.42
      expect(deposits[2].balance).toBeCloseTo(100.42, 2)
    })
  })

  describe('Rounding and Precision', () => {
    test('Scenario 4.15: Rounding down case', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1234.56 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 1234.56 * 0.01 / 12 = 1.0288 → rounds to 1.03
      expect(deposits[0].balance).toBeCloseTo(1235.59, 2)
    })

    test('Scenario 4.16: Rounding up case', async () => {
      await repository.create({ planType: 'student', days: 100, balance: 3333.33 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 3333.33 * 0.03 / 12 = 8.333325 → rounds to 8.33
      expect(deposits[0].balance).toBeCloseTo(3341.66, 2)
    })

    test('Scenario 4.17: Very small interest amount', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 10 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 10 * 0.01 / 12 = 0.008333... → rounds to 0.01
      expect(deposits[0].balance).toBeCloseTo(10.01, 2)
    })

    test('Scenario 4.18: Interest rounds to zero', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 0.50 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 0.50 * 0.01 / 12 = 0.000416... → rounds to 0.00
      expect(deposits[0].balance).toBeCloseTo(0.50, 2) // No change
    })

    test('Scenario 4.19: Exact half cent rounding', async () => {
      // Find a balance that produces exactly 0.5 cent interest
      // For basic: x * 0.01 / 12 = 0.005 → x = 6
      await repository.create({ planType: 'basic', days: 60, balance: 6 })

      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      const deposits = await repository.findAll()
      // 6 * 0.01 / 12 = 0.005 → rounds to 0.01 (round half up)
      expect(deposits[0].balance).toBeCloseTo(6.01, 2)
    })
  })

  describe('Multiple Deposits Mixed Plans', () => {
    test('Scenario 4.20: Complex scenario with all plan types', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      await repository.create({ planType: 'basic', days: 90, balance: 2000 })
      await repository.create({ planType: 'student', days: 100, balance: 3000 })
      await repository.create({ planType: 'student', days: 200, balance: 4000 })
      await repository.create({ planType: 'premium', days: 60, balance: 5000 })
      await repository.create({ planType: 'premium', days: 100, balance: 6000 })

      const response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      expect(response.statusCode).toBe(200)
      const updateData = JSON.parse(response.body)
      expect(updateData.updated).toBe(6)

      const deposits = await repository.findAll()

      // Verify each calculation
      expect(deposits[0].balance).toBeCloseTo(1000.83, 2)  // Basic 1000
      expect(deposits[1].balance).toBeCloseTo(2001.67, 2)  // Basic 2000
      expect(deposits[2].balance).toBeCloseTo(3007.50, 2)  // Student 3000
      expect(deposits[3].balance).toBeCloseTo(4010.00, 2)  // Student 4000
      expect(deposits[4].balance).toBeCloseTo(5020.83, 2)  // Premium 5000
      expect(deposits[5].balance).toBeCloseTo(6025.00, 2)  // Premium 6000
    })
  })
})
