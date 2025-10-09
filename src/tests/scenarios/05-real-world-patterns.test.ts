import { test, expect, describe, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'

/**
 * Test Suite: Real-World Usage Patterns
 * 
 * Tests realistic scenarios:
 * - Monthly savings plans
 * - Emergency withdrawals
 * - Compounding over time
 * - Account recovery
 * - Plan migrations
 */

describe('Real-World Usage Patterns', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const sqlite = new Database(':memory:', { create: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    const db = drizzle(sqlite, { schema })
    await migrate(db, { migrationsFolder: './drizzle/migrations' })

    repository = new DrizzleTimeDepositRepository(db)
    const calculator = new TimeDepositCalculator()
    updateUseCase = new UpdateAllTimeDepositBalances(repository, calculator)
  })

  describe('Monthly Savings Patterns', () => {
    test('Monthly $500 deposits over 6 months with monthly interest', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'student',
        days: 60,
        balance: 500,
        openingDate: sixtyDaysAgo,
      })

      let runningBalance = 500
      
      // Simulate 6 months: deposit then interest
      for (let month = 0; month < 6; month++) {
        // Add monthly deposit
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 500,
          date: new Date(),
        })
        runningBalance += 500
        
        // Apply interest
        await updateUseCase.execute()
        
        const deposits = await repository.findAll()
        const currentBalance = deposits[0].balance
        
        // Balance should increase each month
        expect(currentBalance).toBeGreaterThan(runningBalance)
        runningBalance = currentBalance
      }

      const deposits = await repository.findAll()
      // Initial 500 + 6 months of 500 = 3500 + compounded interest
      expect(deposits[0].balance).toBeGreaterThan(3500)
      expect(deposits[0].balance).toBeLessThan(3600)
      expect(deposits[0].interestApplications.length).toBe(6)
    })

    test('Bi-weekly $250 deposits simulating paycheck savings', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 250,
        openingDate: sixtyDaysAgo,
      })

      // 10 bi-weekly deposits
      for (let i = 0; i < 10; i++) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 250,
          date: new Date(),
        })
      }

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 11 deposits of 250 = 2750 + interest on total
      expect(deposits[0].balance).toBeGreaterThan(2750)
    })

    test('Variable monthly deposits reflecting income fluctuation', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'premium',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      const monthlyDeposits = [500, 300, 800, 200, 600, 400]
      
      for (const amount of monthlyDeposits) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount,
          date: new Date(),
        })
        await updateUseCase.execute()
      }

      const deposits = await repository.findAll()
      const totalDeposits = 1000 + monthlyDeposits.reduce((a, b) => a + b, 0)
      expect(deposits[0].balance).toBeGreaterThan(totalDeposits)
    })
  })

  describe('Emergency Withdrawal Scenarios', () => {
    test('Emergency: 80% withdrawal then gradual recovery', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'premium',
        days: 60,
        balance: 10000,
        openingDate: sixtyDaysAgo,
      })

      // Build up some interest first
      await updateUseCase.execute()
      
      let deposits = await repository.findAll()
      const beforeEmergency = deposits[0].balance

      // Emergency withdrawal
      await repository.addWithdrawal({
        timeDepositId: td.id,
        amount: beforeEmergency * 0.8,
        date: new Date(),
      })

      // Gradual recovery over 4 months
      for (let i = 0; i < 4; i++) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 2000,
          date: new Date(),
        })
        await updateUseCase.execute()
      }

      deposits = await repository.findAll()
      // Should have mostly recovered
      expect(deposits[0].balance).toBeGreaterThan(9000)
    })

    test('Multiple small emergency withdrawals', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'student',
        days: 60,
        balance: 5000,
        openingDate: sixtyDaysAgo,
      })

      // Initial interest
      await updateUseCase.execute()

      // Series of small withdrawals for expenses
      const withdrawals = [200, 150, 300, 250, 100]
      for (const amount of withdrawals) {
        await repository.addWithdrawal({
          timeDepositId: td.id,
          amount,
          date: new Date(),
        })
      }

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      const totalWithdrawn = withdrawals.reduce((a, b) => a + b, 0)
      expect(deposits[0].balance).toBeLessThan(5000)
      expect(deposits[0].balance).toBeGreaterThan(5000 - totalWithdrawn - 50)
    })
  })

  describe('Compound Interest Patterns', () => {
    test('Daily interest application over 30 days (aggressive compounding)', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'premium',
        days: 60,
        balance: 10000,
        openingDate: sixtyDaysAgo,
      })

      // Apply interest daily for 30 days
      for (let day = 0; day < 30; day++) {
        await updateUseCase.execute()
      }

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(30)
      
      // Compound effect should be significant
      // Each application adds interest on growing balance
      expect(deposits[0].balance).toBeGreaterThan(11200) // Much more than simple interest
    })

    test('Yearly interest application - minimal compounding', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 10000,
        openingDate: sixtyDaysAgo,
      })

      // Single interest application
      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeCloseTo(10008.33, 2) // 10000 * 0.01 / 12 = 8.33
    })

    test('Interest compounds differently with withdrawals in between', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      // Scenario A: No withdrawals
      const tdA = await repository.create({
        planType: 'student',
        days: 60,
        balance: 5000,
        openingDate: sixtyDaysAgo,
      })

      // Scenario B: Withdrawal after first interest
      const tdB = await repository.create({
        planType: 'student',
        days: 60,
        balance: 5000,
        openingDate: sixtyDaysAgo,
      })

      // First interest for both
      await updateUseCase.execute()
      
      // Withdrawal from B only
      await repository.addWithdrawal({
        timeDepositId: tdB.id,
        amount: 1000,
        date: new Date(),
      })

      // Second interest for both
      await updateUseCase.execute()

      const deposits = await repository.findAll()
      const balanceA = deposits.find(d => d.id === tdA.id)!.balance
      const balanceB = deposits.find(d => d.id === tdB.id)!.balance

      // A should be higher due to no withdrawal
      expect(balanceA).toBeGreaterThan(balanceB + 1000)
    })
  })

  describe('Account Recovery and Rebuilding', () => {
    test('Account depleted then rebuilt over time', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 3000,
        openingDate: sixtyDaysAgo,
      })

      // Apply interest
      await updateUseCase.execute()

      // Deplete account
      await repository.addWithdrawal({
        timeDepositId: td.id,
        amount: 3000,
        date: new Date(),
      })

      let deposits = await repository.findAll()
      const depleted = deposits[0].balance
      expect(depleted).toBeLessThan(50)

      // Rebuild with weekly deposits
      for (let week = 0; week < 12; week++) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 250,
          date: new Date(),
        })
      }

      await updateUseCase.execute()

      deposits = await repository.findAll()
      // 12 * 250 = 3000 + interest
      expect(deposits[0].balance).toBeGreaterThan(3000)
    })

    test('Partial recovery after major withdrawal', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'premium',
        days: 60,
        balance: 20000,
        openingDate: sixtyDaysAgo,
      })

      // Build interest
      await updateUseCase.execute()

      // Major withdrawal (50%)
      await repository.addWithdrawal({
        timeDepositId: td.id,
        amount: 10000,
        date: new Date(),
      })

      // Partial recovery deposits
      for (let i = 0; i < 3; i++) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 2000,
          date: new Date(),
        })
        await updateUseCase.execute()
      }

      const deposits = await repository.findAll()
      // 20000 - 10000 + 6000 + compounding interest
      expect(deposits[0].balance).toBeGreaterThan(16000)
      expect(deposits[0].balance).toBeLessThan(17000)
    })
  })

  describe('Long-Term Growth Patterns', () => {
    test('Set-and-forget account over simulated long period', async () => {
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

      await repository.create({
        planType: 'premium',
        days: 730, // 2 years
        balance: 10000,
        openingDate: twoYearsAgo,
      })

      // Apply interest (simulating quarterly updates)
      for (let quarter = 0; quarter < 8; quarter++) {
        await updateUseCase.execute()
      }

      const deposits = await repository.findAll()
      // Growth over 2 years with 8 interest applications (5% premium rate)
      // Each: balance * 0.05 / 12, compounding
      expect(deposits[0].balance).toBeGreaterThan(10200)
      expect(deposits[0].balance).toBeLessThan(11000)
    })

    test('Active vs passive growth strategies', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      // Passive: One large deposit
      const passive = await repository.create({
        planType: 'student',
        days: 60,
        balance: 5000,
        openingDate: sixtyDaysAgo,
      })

      // Active: Small initial + regular additions
      const active = await repository.create({
        planType: 'student',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      for (let month = 0; month < 4; month++) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: active.id,
          amount: 1000,
          date: new Date(),
        })
        await updateUseCase.execute()
      }

      const deposits = await repository.findAll()
      const passiveBalance = deposits.find(d => d.id === passive.id)!.balance
      const activeBalance = deposits.find(d => d.id === active.id)!.balance

      // Both strategies should grow but through different paths
      expect(passiveBalance).toBeGreaterThan(5000)
      expect(activeBalance).toBeGreaterThan(5000)
      
      // Both end at same total but passive had more time to compound on larger amount
      // Passive: 5000 base compounding 4 times
      // Active: smaller base growing over time
      expect(passiveBalance).toBeGreaterThan(activeBalance)
    })
  })

  describe('Edge Cases in Real Usage', () => {
    test('Account crosses student plan boundary during active use', async () => {
      const threeHundredSixtyDaysAgo = new Date()
      threeHundredSixtyDaysAgo.setDate(threeHundredSixtyDaysAgo.getDate() - 360)

      const td = await repository.create({
        planType: 'student',
        days: 360,
        balance: 3000,
        openingDate: threeHundredSixtyDaysAgo,
      })

      // At day 360 - should get interest
      await updateUseCase.execute()
      let deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)

      // Note: In reality, days would naturally increment past 365
      // For this test, we verify the account got interest while eligible
      expect(deposits[0].balance).toBeGreaterThan(3000)
    })

    test('Premium account with high activity maintains precision', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'premium',
        days: 60,
        balance: 50000,
        openingDate: sixtyDaysAgo,
      })

      // High activity: 20 transactions
      for (let i = 0; i < 10; i++) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 1000,
          date: new Date(),
        })
        
        await repository.addWithdrawal({
          timeDepositId: td.id,
          amount: 500,
          date: new Date(),
        })
      }

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 50000 + (10 * 1000) - (10 * 500) + interest = 55000 + interest
      expect(deposits[0].balance).toBeGreaterThan(55000)
      expect(deposits[0].balance).toBeLessThan(56000)
    })
  })
})
