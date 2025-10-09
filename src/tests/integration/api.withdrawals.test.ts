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
 * Integration Tests: Withdrawal Impact on Balances
 * 
 * Category 6: Withdrawal Testing
 * Tests how withdrawals affect balances and interest calculations
 */

describe('Withdrawal Impact on Balances', () => {
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

  describe('Balance After Withdrawals', () => {
    test('Scenario 6.1: Single withdrawal reduces balance', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 200,
        date: new Date('2024-01-15'),
      })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      const data = JSON.parse(response.body)
      expect(data[0].balance).toBe(800) // 1000 - 200
      expect(data[0].withdrawals).toHaveLength(1)
      expect(data[0].withdrawals[0].amount).toBe(200)
    })

    test('Scenario 6.2: Multiple withdrawals accumulate', async () => {
      const deposit = await repository.create({ 
        planType: 'student', 
        days: 100, 
        balance: 5000 
      })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date('2024-01-15'),
      })
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 500,
        date: new Date('2024-02-15'),
      })
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 200,
        date: new Date('2024-03-15'),
      })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      const data = JSON.parse(response.body)
      expect(data[0].balance).toBe(3300) // 5000 - 1000 - 500 - 200
      expect(data[0].withdrawals).toHaveLength(3)
    })

    test('Scenario 6.3: Withdrawal down to zero balance', async () => {
      const deposit = await repository.create({ 
        planType: 'premium', 
        days: 60, 
        balance: 1000 
      })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date(),
      })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(0)
    })
  })

  describe('Interest Calculation on Reduced Balance', () => {
    test('Scenario 6.4: Interest calculated on post-withdrawal balance', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      // Withdraw 500, leaving 500
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 500,
        date: new Date('2024-01-15'),
      })

      // Update balances
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const deposits = await repository.findAll()
      // Interest on 500: 500 * 0.01 / 12 = 0.416... rounds to 0.42
      expect(deposits[0].balance).toBeCloseTo(500.42, 2)
    })

    test('Scenario 6.5: Student plan with withdrawals', async () => {
      const deposit = await repository.create({ 
        planType: 'student', 
        days: 100, 
        balance: 5000 
      })

      // Multiple withdrawals
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date('2024-01-01'),
      })
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 500,
        date: new Date('2024-02-01'),
      })
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 200,
        date: new Date('2024-03-01'),
      })

      // Current balance: 5000 - 1700 = 3300
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const deposits = await repository.findAll()
      // Interest on 3300: 3300 * 0.03 / 12 = 8.25
      expect(deposits[0].balance).toBeCloseTo(3308.25, 2)
    })

    test('Scenario 6.6: Premium plan with large withdrawal', async () => {
      const deposit = await repository.create({ 
        planType: 'premium', 
        days: 100, 
        balance: 10000 
      })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 7000,
        date: new Date(),
      })

      // Balance now: 3000
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const deposits = await repository.findAll()
      // Interest on 3000: 3000 * 0.05 / 12 = 12.50
      expect(deposits[0].balance).toBeCloseTo(3012.50, 2)
    })

    test('Scenario 6.7: Zero balance after withdrawal - no interest', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date(),
      })

      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(0) // Still 0, no interest on 0
    })
  })

  describe('Withdrawal History Integrity', () => {
    test('Scenario 6.8: Withdrawal records persist after balance update', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 100,
        date: new Date('2024-01-15'),
      })

      // Update balances
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      // Check withdrawal still exists
      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      const data = JSON.parse(response.body)
      expect(data[0].withdrawals).toHaveLength(1)
      expect(data[0].withdrawals[0].amount).toBe(100)
    })

    test('Scenario 6.9: Multiple deposits with different withdrawal counts', async () => {
      const deposit1 = await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      const deposit2 = await repository.create({ planType: 'student', days: 100, balance: 2000 })
      const deposit3 = await repository.create({ planType: 'premium', days: 60, balance: 3000 })

      // deposit1: 2 withdrawals
      await repository.addWithdrawal({
        timeDepositId: deposit1.id,
        amount: 100,
        date: new Date('2024-01-15'),
      })
      await repository.addWithdrawal({
        timeDepositId: deposit1.id,
        amount: 50,
        date: new Date('2024-02-15'),
      })

      // deposit2: 1 withdrawal
      await repository.addWithdrawal({
        timeDepositId: deposit2.id,
        amount: 500,
        date: new Date('2024-01-20'),
      })

      // deposit3: no withdrawals

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      const data = JSON.parse(response.body)
      expect(data[0].withdrawals).toHaveLength(2)
      expect(data[1].withdrawals).toHaveLength(1)
      expect(data[2].withdrawals).toHaveLength(0)
    })
  })

  describe('Complex Withdrawal Scenarios', () => {
    test('Scenario 6.10: Withdrawal, interest, then another withdrawal', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      // First withdrawal
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 200,
        date: new Date('2024-01-01'),
      })

      // Balance now: 800
      // Apply interest
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      let deposits = await repository.findAll()
      // 800 + (800 * 0.01 / 12) = 800.67
      expect(deposits[0].balance).toBeCloseTo(800.67, 2)

      // Second withdrawal
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 100,
        date: new Date('2024-02-01'),
      })

      deposits = await repository.findAll()
      // 800.67 - 100 = 700.67
      expect(deposits[0].balance).toBeCloseTo(700.67, 2)
    })

    test('Scenario 6.11: Large withdrawal percentage', async () => {
      const deposit = await repository.create({ 
        planType: 'premium', 
        days: 100, 
        balance: 100000 
      })

      // Withdraw 95%
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 95000,
        date: new Date(),
      })

      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const deposits = await repository.findAll()
      // Interest on 5000: 5000 * 0.05 / 12 = 20.83
      expect(deposits[0].balance).toBeCloseTo(5020.83, 2)
    })

    test('Scenario 6.12: Small withdrawals over time', async () => {
      const deposit = await repository.create({ 
        planType: 'student', 
        days: 100, 
        balance: 10000 
      })

      // 10 small withdrawals
      for (let i = 1; i <= 10; i++) {
        await repository.addWithdrawal({
          timeDepositId: deposit.id,
          amount: 50 * i, // 50, 100, 150, ..., 500
          date: new Date(`2024-01-${i.toString().padStart(2, '0')}`),
        })
      }

      // Total withdrawn: 50+100+150+...+500 = 2750
      // Remaining: 10000 - 2750 = 7250

      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      const deposits = await repository.findAll()
      // Interest on 7250: 7250 * 0.03 / 12 = 18.125 rounds to 18.13
      expect(deposits[0].balance).toBeCloseTo(7268.13, 2)
      expect(deposits[0].withdrawals).toHaveLength(10)
    })
  })

  describe('Withdrawal Date Tracking', () => {
    test('Scenario 6.13: Withdrawal dates are preserved', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      const date1 = new Date('2024-01-15T10:30:00Z')
      const date2 = new Date('2024-02-20T14:45:00Z')

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 100,
        date: date1,
      })
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 200,
        date: date2,
      })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      const data = JSON.parse(response.body)
      const withdrawals = data[0].withdrawals

      expect(withdrawals[0].date).toContain('2024-01-15')
      expect(withdrawals[1].date).toContain('2024-02-20')
    })
  })
})
