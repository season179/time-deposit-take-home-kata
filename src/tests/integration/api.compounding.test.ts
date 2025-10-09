import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { FastifyInstance } from 'fastify'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { eq } from 'drizzle-orm'
import { createServer } from '../../api/server'
import { timeDepositRoutes } from '../../api/routes/timeDeposits'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { GetAllTimeDeposits } from '../../application/usecases/GetAllTimeDeposits'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import * as schema from '../../infrastructure/database/schema'

/**
 * Integration Tests: Interest Compounding
 * 
 * Category 7: Compounding Behavior
 * Tests how multiple balance updates compound interest
 */

describe('Interest Compounding', () => {
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

  describe('Single vs Multiple Updates', () => {
    test('Scenario 7.1: Single update calculation', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const deposits = await repository.findAll()
      // First update: 1000 + (1000 * 0.01 / 12) = 1000.83
      expect(deposits[0].balance).toBeCloseTo(1000.83, 2)
    })

    test('Scenario 7.2: Double update - compounding effect', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      // First update
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      let deposits = await repository.findAll()
      const balanceAfterFirst = deposits[0].balance
      expect(balanceAfterFirst).toBeCloseTo(1000.83, 2)

      // Second update - compounds on new balance
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      deposits = await repository.findAll()
      // Second update: 1000.83 + (1000.83 * 0.01 / 12) = 1000.83 + 0.83 = 1001.66
      expect(deposits[0].balance).toBeCloseTo(1001.66, 1)
      expect(deposits[0].balance).toBeGreaterThan(balanceAfterFirst)
    })

    test('Scenario 7.3: Triple update - compounding chain', async () => {
      await repository.create({ planType: 'premium', days: 100, balance: 10000 })

      // First update
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      let deposits = await repository.findAll()
      // 10000 + (10000 * 0.05 / 12) = 10041.67
      expect(deposits[0].balance).toBeCloseTo(10041.67, 2)

      // Second update
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      deposits = await repository.findAll()
      // 10041.67 + (10041.67 * 0.05 / 12) = 10083.51
      expect(deposits[0].balance).toBeCloseTo(10083.51, 2)

      // Third update
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      deposits = await repository.findAll()
      // 10083.51 + (10083.51 * 0.05 / 12) = 10125.52
      expect(deposits[0].balance).toBeCloseTo(10125.52, 2)
    })

    test('Scenario 7.4: Five updates - verify progressive compounding', async () => {
      await repository.create({ planType: 'student', days: 100, balance: 5000 })

      const balances: number[] = [5000]

      for (let i = 0; i < 5; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
        const deposits = await repository.findAll()
        balances.push(deposits[0].balance)
      }

      // Each balance should be greater than the previous
      for (let i = 1; i < balances.length; i++) {
        expect(balances[i]).toBeGreaterThan(balances[i - 1])
      }

      // Final balance should be noticeably higher
      // 5 updates with 3% rate: approximately 5000 * (1 + 0.03/12)^5 ≈ 5062.53
      expect(balances[5]).toBeGreaterThan(5060)
      expect(balances[5]).toBeLessThan(5065)
    })
  })

  describe('Compounding Across Plan Types', () => {
    test('Scenario 7.5: Basic plan compounding rate', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 10000 })

      const balances: number[] = []
      
      for (let i = 0; i < 3; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
        const deposits = await repository.findAll()
        balances.push(deposits[0].balance)
      }

      // With 1% rate, each update adds about 8.33
      expect(balances[0]).toBeCloseTo(10008.33, 2)  // First
      expect(balances[1]).toBeCloseTo(10016.67, 2)  // Second
      expect(balances[2]).toBeCloseTo(10025.02, 1)  // Third (accumulated rounding)
    })

    test('Scenario 7.6: Student plan compounding rate', async () => {
      await repository.create({ planType: 'student', days: 100, balance: 10000 })

      const balances: number[] = []
      
      for (let i = 0; i < 3; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
        const deposits = await repository.findAll()
        balances.push(deposits[0].balance)
      }

      // With 3% rate, each update adds about 25.00
      expect(balances[0]).toBeCloseTo(10025.00, 2)  // First
      expect(balances[1]).toBeCloseTo(10050.06, 2)  // Second
      expect(balances[2]).toBeCloseTo(10075.19, 2)  // Third
    })

    test('Scenario 7.7: Premium plan compounding rate', async () => {
      await repository.create({ planType: 'premium', days: 100, balance: 10000 })

      const balances: number[] = []
      
      for (let i = 0; i < 3; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
        const deposits = await repository.findAll()
        balances.push(deposits[0].balance)
      }

      // With 5% rate, each update adds about 41.67
      expect(balances[0]).toBeCloseTo(10041.67, 2)  // First
      expect(balances[1]).toBeCloseTo(10083.51, 2)  // Second
      expect(balances[2]).toBeCloseTo(10125.52, 2)  // Third
    })
  })

  describe('Compounding with Withdrawals', () => {
    test('Scenario 7.8: Interest, withdrawal, then more interest', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      // First interest update
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      let deposits = await repository.findAll()
      expect(deposits[0].balance).toBeCloseTo(1000.83, 2)

      // Withdrawal
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 500,
        date: new Date(),
      })

      deposits = await repository.findAll()
      expect(deposits[0].balance).toBeCloseTo(500.83, 2)

      // Second interest update on reduced balance
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      deposits = await repository.findAll()
      // 500.83 + (500.83 * 0.01 / 12) = 501.25
      expect(deposits[0].balance).toBeCloseTo(501.25, 2)
    })

    test('Scenario 7.9: Multiple interest updates interrupted by withdrawals', async () => {
      const deposit = await repository.create({ 
        planType: 'student', 
        days: 100, 
        balance: 10000 
      })

      // Update 1
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      let deposits = await repository.findAll()
      expect(deposits[0].balance).toBeCloseTo(10025.00, 2)

      // Withdrawal 1
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 2000,
        date: new Date(),
      })

      // Update 2
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      deposits = await repository.findAll()
      // (10025 - 2000) = 8025, then 8025 + (8025 * 0.03 / 12) = 8045.06
      expect(deposits[0].balance).toBeCloseTo(8045.06, 2)

      // Withdrawal 2
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date(),
      })

      // Update 3
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      deposits = await repository.findAll()
      // (8045.06 - 1000) = 7045.06, then 7045.06 + (7045.06 * 0.03 / 12) = 7062.67
      expect(deposits[0].balance).toBeCloseTo(7062.67, 2)
    })
  })

  describe('Compounding Edge Cases', () => {
    test('Scenario 7.10: Compounding stops after student plan cutoff', async () => {
      // Create deposit that is 366 days old (beyond student plan cutoff)
      await repository.create({ planType: 'student', days: 366, balance: 5000 })

      // First update - should NOT get interest (day 366, beyond cutoff)
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      let deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(5000) // No change

      // Second update - still no interest
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(5000) // Still no change
    })

    test('Scenario 7.11: Compounding with very small balances', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1 })

      for (let i = 0; i < 5; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      }

      const deposits = await repository.findAll()
      // With balance of 1, interest is tiny: 1 * 0.01 / 12 = 0.000833, rounds to 0.00
      // So balance stays at 1 (no compounding with such small amounts)
      expect(deposits[0].balance).toBe(1)
    })

    test('Scenario 7.12: Compounding with large balances', async () => {
      await repository.create({ planType: 'premium', days: 100, balance: 1000000 })

      const initialBalance = 1000000

      for (let i = 0; i < 3; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      }

      const deposits = await repository.findAll()
      
      // After 3 updates with 5% rate:
      // Update 1: +4166.67 = 1004166.67
      // Update 2: +4183.59 = 1008350.26
      // Update 3: +4201.46 = 1012551.72
      expect(deposits[0].balance).toBeGreaterThan(1012500)
      expect(deposits[0].balance).toBeLessThan(1012600)
    })
  })

  describe('Compounding Verification', () => {
    test('Scenario 7.13: Verify compounding vs simple interest', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      // Perform 12 monthly updates
      const balances: number[] = [1000]
      
      for (let i = 0; i < 12; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
        const deposits = await repository.findAll()
        balances.push(deposits[0].balance)
      }

      // Simple interest would be: 1000 + (1000 * 0.01) = 1010
      const simpleInterest = 1010

      // Compound interest should be slightly higher
      const finalBalance = balances[12]
      
      // Compound: 1000 * (1 + 0.01/12)^12 ≈ 1010.05
      expect(finalBalance).toBeGreaterThan(simpleInterest)
      expect(finalBalance).toBeCloseTo(1010.05, 2)
    })

    test('Scenario 7.14: Multiple deposits compound independently', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      await repository.create({ planType: 'student', days: 100, balance: 2000 })
      await repository.create({ planType: 'premium', days: 100, balance: 3000 })

      // Update twice
      for (let i = 0; i < 2; i++) {
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      }

      const deposits = await repository.findAll()

      // Each should have compounded twice independently
      expect(deposits[0].balance).toBeCloseTo(1001.66, 1)  // Basic
      expect(deposits[1].balance).toBeCloseTo(2010.01, 1)  // Student
      expect(deposits[2].balance).toBeCloseTo(3025.09, 1)  // Premium
    })
  })
})
