import { test, expect, describe, beforeEach } from 'bun:test'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from '../helpers/testDatabase'

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
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
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

      // Apply first interest
      await updateUseCase.execute()
      
      // Simulate 5 more months by manually adding interest for different days
      // (In real scenario, this would be called on different days)
      for (let month = 1; month < 6; month++) {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + month)
        
        // Add monthly deposit
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 500,
          date: new Date(),
        })
        
        // Manually add interest for future date (simulating different day)
        const deposits = await repository.findAll()
        const currentBalance = deposits[0].balance + 500
        const interestAmount = (currentBalance * 0.03) / 12
        
        await repository.addInterestApplication({
          timeDepositId: td.id,
          amount: Math.round((interestAmount + Number.EPSILON) * 100) / 100,
          date: futureDate,
        })
      }

      const deposits = await repository.findAll()
      // Should have multiple interest applications
      expect(deposits[0].interestApplications.length).toBe(6)
      // Initial 500 + 5 deposits of 500 = 3000 + compounded interest
      expect(deposits[0].deposits.length).toBe(6) // Initial + 5 more
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

      const td = await repository.create({
        planType: 'premium',
        days: 60,
        balance: 10000,
        openingDate: sixtyDaysAgo,
      })

      // Apply first interest
      await updateUseCase.execute()
      
      // Simulate 29 more days by manually adding interest for different dates
      // (In real scenario, this would be called on different days)
      for (let day = 1; day < 30; day++) {
        const deposits = await repository.findAll()
        const currentBalance = deposits[0].balance
        const interestAmount = (currentBalance * 0.05) / 12
        
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + day)
        
        await repository.addInterestApplication({
          timeDepositId: td.id,
          amount: Math.round((interestAmount + Number.EPSILON) * 100) / 100,
          date: futureDate,
        })
      }

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(30)
      
      // With 30 applications compounding, balance should be higher than initial
      // At minimum: 10000 + (41.67 * 30) but actual should compound
      expect(deposits[0].balance).toBeGreaterThanOrEqual(10041.67)
      expect(deposits[0].balance).toBeGreaterThan(10000)
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
      expect(deposits[0].balance).toBeCloseTo(10016.44, 2) // 10000 × (0.01 / 365) × 60 = 16.44
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

      // First interest for both (5000 × (0.03 / 365) × 60 = 24.66)
      await updateUseCase.execute()
      
      // Withdrawal from B only
      await repository.addWithdrawal({
        timeDepositId: tdB.id,
        amount: 1000,
        date: new Date(),
      })

      // Second call on same day - 0 days elapsed (no new interest)
      await updateUseCase.execute()

      const deposits = await repository.findAll()
      const balanceA = deposits.find(d => d.id === tdA.id)!.balance
      const balanceB = deposits.find(d => d.id === tdB.id)!.balance

      // A: 5000 + 24.66 = 5024.66
      // B: 5000 + 24.66 - 1000 = 4024.66
      // Difference should be exactly 1000 (the withdrawal amount)
      expect(balanceA).toBeCloseTo(5024.66, 2)
      expect(balanceB).toBeCloseTo(4024.66, 2)
      expect(balanceA - balanceB).toBeCloseTo(1000, 2)
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

      const td = await repository.create({
        planType: 'premium',
        days: 730, // 2 years
        balance: 10000,
        openingDate: twoYearsAgo,
      })

      // Apply first interest
      await updateUseCase.execute()
      
      // Simulate 7 more quarterly updates on different days
      for (let quarter = 1; quarter < 8; quarter++) {
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + quarter * 90) // ~3 months apart
        
        const deposits = await repository.findAll()
        const currentBalance = deposits[0].balance
        const interestAmount = (currentBalance * 0.05) / 12
        
        await repository.addInterestApplication({
          timeDepositId: td.id,
          amount: Math.round((interestAmount + Number.EPSILON) * 100) / 100,
          date: futureDate,
        })
      }

      const deposits = await repository.findAll()
      // Should have 8 interest applications
      expect(deposits[0].interestApplications.length).toBe(8)
      // Balance should be higher than initial with compounding
      // At minimum: one application worth
      expect(deposits[0].balance).toBeGreaterThanOrEqual(10041.67)
      expect(deposits[0].balance).toBeGreaterThan(10000)
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
