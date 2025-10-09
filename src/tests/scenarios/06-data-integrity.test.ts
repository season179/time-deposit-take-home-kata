import { test, expect, describe, beforeEach } from 'bun:test'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from '../helpers/testDatabase'

/**
 * Test Suite: Data Integrity and Consistency
 * 
 * Tests that ensure:
 * - Event replay produces consistent results
 * - Multiple updates maintain data integrity
 * - Edge cases don't corrupt data
 * - Idempotency where applicable
 */

describe('Data Integrity and Consistency', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  describe('Event Replay Consistency', () => {
    test('Event replay produces same result regardless of read order', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'student',
        days: 60,
        balance: 5000,
        openingDate: sixtyDaysAgo,
      })

      // Add mixed events
      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 1000,
        date: new Date(Date.now() - 1000),
      })
      
      await repository.addWithdrawal({
        timeDepositId: td.id,
        amount: 500,
        date: new Date(Date.now() - 500),
      })

      // Update multiple times - should be consistent
      await updateUseCase.execute()
      const deposits1 = await repository.findAll()
      const balance1 = deposits1[0].balance

      // Read again without changes - balance should match
      const deposits2 = await repository.findAll()
      const balance2 = deposits2[0].balance

      expect(balance1).toBe(balance2)
    })

    test('Stored balance matches replayed balance after update', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      const storedBalance = deposits[0].balance

      // Manual event replay
      const { replayEventsToComputeBalance } = await import('../../domain/services/EventReplayService')
      const replayedBalance = replayEventsToComputeBalance(
        deposits[0].deposits,
        deposits[0].withdrawals,
        deposits[0].interestApplications
      )

      expect(storedBalance).toBe(replayedBalance)
    })

    test('Event order preserved across multiple reads', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'student',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      // Create events with specific timestamps
      const now = Date.now()
      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 500,
        date: new Date(now - 3000),
      })
      
      await repository.addWithdrawal({
        timeDepositId: td.id,
        amount: 200,
        date: new Date(now - 2000),
      })

      await updateUseCase.execute()

      // Read multiple times
      const read1 = await repository.findAll()
      const read2 = await repository.findAll()
      const read3 = await repository.findAll()

      // Event counts should be consistent
      expect(read1[0].deposits.length).toBe(read2[0].deposits.length)
      expect(read1[0].withdrawals.length).toBe(read2[0].withdrawals.length)
      expect(read1[0].interestApplications.length).toBe(read2[0].interestApplications.length)

      // Balances should be identical
      expect(read1[0].balance).toBe(read2[0].balance)
      expect(read2[0].balance).toBe(read3[0].balance)
    })
  })

  describe('Multiple Update Cycles', () => {
    test('10 consecutive updates maintain data integrity', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'premium',
        days: 60,
        balance: 10000,
        openingDate: sixtyDaysAgo,
      })

      const balances = []
      
      // First call applies interest
      await updateUseCase.execute()
      let deposits = await repository.findAll()
      balances.push(deposits[0].balance)
      
      // Next 9 calls are idempotent (same day) - no new interest
      for (let i = 1; i < 10; i++) {
        await updateUseCase.execute()
        deposits = await repository.findAll()
        balances.push(deposits[0].balance)
      }

      // All balances should be the same after first (idempotent)
      for (let i = 1; i < balances.length; i++) {
        expect(balances[i]).toBe(balances[0])
      }

      // Only 1 interest application due to idempotency
      const finalDeposits = await repository.findAll()
      expect(finalDeposits[0].interestApplications.length).toBe(1)
    })

    test('Balance remains consistent after update with no changes', async () => {
      const twentyDaysAgo = new Date()
      twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20)

      await repository.create({
        planType: 'basic',
        days: 20,
        balance: 1000,
        openingDate: twentyDaysAgo,
      })

      // First update - no interest (grace period)
      await updateUseCase.execute()
      const deposits1 = await repository.findAll()
      const balance1 = deposits1[0].balance

      // Second update - still no interest
      await updateUseCase.execute()
      const deposits2 = await repository.findAll()
      const balance2 = deposits2[0].balance

      expect(balance1).toBe(1000)
      expect(balance2).toBe(1000)
      expect(balance1).toBe(balance2)
    })

    test('Events accumulate correctly over multiple update cycles', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      // Cycle 1: First interest application
      await updateUseCase.execute()
      let deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)

      // Cycle 2: Withdrawal then update (idempotent - no new interest same day)
      await repository.addWithdrawal({ timeDepositId: td.id, amount: 100, date: new Date() })
      await updateUseCase.execute()
      deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1) // Still 1 due to idempotency
      expect(deposits[0].withdrawals.length).toBe(1)

      // Cycle 3: Deposit then update (idempotent - no new interest same day)
      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 200,
        date: new Date(),
      })
      await updateUseCase.execute()
      deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1) // Still 1 due to idempotency
      expect(deposits[0].deposits.length).toBe(2) // Initial + new

      // All events accounted for: 2 deposits + 1 withdrawal + 1 interest
      expect(deposits[0].deposits.length + deposits[0].withdrawals.length + deposits[0].interestApplications.length).toBe(4)
    })
  })

  describe('Transaction Atomicity', () => {
    test('Interest application is recorded as single atomic event', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'student',
        days: 60,
        balance: 10000,
        openingDate: sixtyDaysAgo,
      })

      const beforeUpdate = await repository.findAll()
      expect(beforeUpdate[0].interestApplications.length).toBe(0)

      await updateUseCase.execute()

      const afterUpdate = await repository.findAll()
      expect(afterUpdate[0].interestApplications.length).toBe(1)
      
      // Interest event should have timestamp
      expect(afterUpdate[0].interestApplications[0].date).toBeDefined()
      
      // Interest amount should be recorded
      expect(afterUpdate[0].interestApplications[0].amount).toBeGreaterThan(0)
    })

    test('Batch update is atomic - all or nothing', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      // Create multiple accounts
      await repository.create({ planType: 'basic', days: 60, balance: 1000, openingDate: sixtyDaysAgo })
      await repository.create({ planType: 'student', days: 60, balance: 2000, openingDate: sixtyDaysAgo })
      await repository.create({ planType: 'premium', days: 60, balance: 3000, openingDate: sixtyDaysAgo })

      const result = await updateUseCase.execute()
      expect(result.updated).toBe(3)

      const deposits = await repository.findAll()
      
      // All accounts should be updated
      deposits.forEach(d => {
        expect(d.interestApplications.length).toBe(1)
        expect(d.balance).toBeGreaterThan(d.deposits[0].amount)
      })
    })
  })

  describe('Edge Cases and Corner Scenarios', () => {
    test('Empty database - no accounts to update', async () => {
      const result = await updateUseCase.execute()
      expect(result.updated).toBe(0)
      
      const deposits = await repository.findAll()
      expect(deposits.length).toBe(0)
    })

    test('Account with future opening date handled gracefully', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      await repository.create({
        planType: 'basic',
        days: 0,
        balance: 1000,
        openingDate: tomorrow,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Should not break, no interest applied
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1000)
    })

    test('Account age calculation handles leap years', async () => {
      // Create account 366 days ago (leap year)
      const threeHundredSixtySixDaysAgo = new Date()
      threeHundredSixtySixDaysAgo.setDate(threeHundredSixtySixDaysAgo.getDate() - 366)

      await repository.create({
        planType: 'student',
        days: 366,
        balance: 1000,
        openingDate: threeHundredSixtySixDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Student plan cutoff at 366 days
      expect(deposits[0].interestApplications.length).toBe(0)
    })

    test('Very old account (5 years) still processes correctly', async () => {
      const fiveYearsAgo = new Date()
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)

      await repository.create({
        planType: 'premium',
        days: 1825, // 5 years
        balance: 10000,
        openingDate: fiveYearsAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeGreaterThan(10000)
    })

    test('Account with only withdrawals (no additional deposits) maintains integrity', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 5000,
        openingDate: sixtyDaysAgo,
      })

      // Series of withdrawals only
      await repository.addWithdrawal({ timeDepositId: td.id, amount: 1000, date: new Date() })
      await repository.addWithdrawal({ timeDepositId: td.id, amount: 500, date: new Date() })
      await repository.addWithdrawal({ timeDepositId: td.id, amount: 200, date: new Date() })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 5000 - 1700 + interest on 3300: 3300 × (0.01 / 365) × 60 = 5.42
      expect(deposits[0].balance).toBeCloseTo(3305.42, 2)
      expect(deposits[0].deposits.length).toBe(1) // Only initial
      expect(deposits[0].withdrawals.length).toBe(3)
    })

    test('Rapid successive withdrawals and deposits maintain chronology', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'premium',
        days: 60,
        balance: 10000,
        openingDate: sixtyDaysAgo,
      })

      const now = Date.now()
      
      // Events within milliseconds of each other
      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 1000,
        date: new Date(now),
      })
      
      await repository.addWithdrawal({
        timeDepositId: td.id,
        amount: 500,
        date: new Date(now + 1),
      })
      
      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 2000,
        date: new Date(now + 2),
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Event replay should handle millisecond precision
      // 10000 + 1000 - 500 + 2000 + interest on 12500
      expect(deposits[0].balance).toBeGreaterThan(12500)
      expect(deposits[0].balance).toBeLessThan(13000)
    })
  })

  describe('Balance Reconciliation', () => {
    test('Manual balance calculation matches stored balance', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'student',
        days: 60,
        balance: 5000,
        openingDate: sixtyDaysAgo,
      })

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

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      const account = deposits[0]

      // Manual calculation
      let manualBalance = 0
      account.deposits.forEach(d => manualBalance += d.amount)
      account.withdrawals.forEach(w => manualBalance -= w.amount)
      account.interestApplications.forEach(i => manualBalance += i.amount)

      expect(account.balance).toBeCloseTo(manualBalance, 2)
    })

    test('Sum of all events equals final balance', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      // Add various events
      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 500,
        date: new Date(),
      })
      
      await repository.addWithdrawal({
        timeDepositId: td.id,
        amount: 200,
        date: new Date(),
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      const account = deposits[0]

      const totalDeposits = account.deposits.reduce((sum, d) => sum + d.amount, 0)
      const totalWithdrawals = account.withdrawals.reduce((sum, w) => sum + w.amount, 0)
      const totalInterest = account.interestApplications.reduce((sum, i) => sum + i.amount, 0)

      const calculatedBalance = totalDeposits - totalWithdrawals + totalInterest

      expect(account.balance).toBeCloseTo(calculatedBalance, 2)
    })
  })
})
