import { test, expect, describe, beforeEach } from 'bun:test'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from '../helpers/testDatabase'

/**
 * Test Suite: Extreme Values and Edge Cases
 * 
 * Tests handling of:
 * - Very large amounts
 * - Very small amounts
 * - Zero balances
 * - Rounding edge cases
 */

describe('Extreme Values and Edge Cases', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  describe('Zero and Near-Zero Balances', () => {
    test('Zero balance after complete withdrawal - no interest', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      await repository.addWithdrawal({ timeDepositId: td.id, amount: 1000, date: new Date() })
      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(0)
      expect(deposits[0].interestApplications.length).toBe(0)
    })

    test('$1 balance - interest rounds to zero', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 1,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 1 × (0.01 / 365) × 60 = 0.00164... rounds to 0.00
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1)
    })

    test('$10 balance - minimal interest', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 10,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 10 × (0.01 / 365) × 60 = 0.0164 rounds to 0.02
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeCloseTo(10.02, 2)
    })

    test('$0.01 balance - no interest', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 0.01,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(0.01)
    })
  })

  describe('Very Large Balances', () => {
    test('$1 million balance - precision maintained', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'premium', // 5% rate
        days: 60,
        balance: 1000000,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 1000000 × (0.05 / 365) × 60 = 8219.18
      expect(deposits[0].interestApplications[0].amount).toBeCloseTo(8219.18, 2)
      expect(deposits[0].balance).toBeCloseTo(1008219.18, 2)
    })

    test('$10 million balance - large interest amounts', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'premium',
        days: 60,
        balance: 10000000,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 10000000 × (0.05 / 365) × 60 = 82191.78
      expect(deposits[0].interestApplications[0].amount).toBeCloseTo(82191.78, 2)
      expect(deposits[0].balance).toBeCloseTo(10082191.78, 2)
    })

    test('$100 million balance - extreme precision', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'student', // 3% rate
        days: 60,
        balance: 100000000,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 100000000 × (0.03 / 365) × 60 = 493150.68
      expect(deposits[0].interestApplications[0].amount).toBeCloseTo(493150.68, 2)
      expect(deposits[0].balance).toBeCloseTo(100493150.68, 2)
    })
  })

  describe('Penny-Level Precision', () => {
    test('$100.99 - precise penny calculation', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 100.99,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 100.99 × (0.01 / 365) × 60 = 0.1662 rounds to 0.17
      expect(deposits[0].balance).toBeCloseTo(101.16, 2)
    })

    test('$99.99 - boundary near 100', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 99.99,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 99.99 × (0.01 / 365) × 60 = 0.1646 rounds to 0.16
      expect(deposits[0].balance).toBeCloseTo(100.15, 2)
    })

    test('$1000.01 - odd penny', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'student',
        days: 60,
        balance: 1000.01,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 1000.01 × (0.03 / 365) × 60 = 4.93 rounds to 4.93
      expect(deposits[0].balance).toBeCloseTo(1004.94, 2)
    })
  })

  describe('Multiple Small Withdrawals', () => {
    test('Bring balance from $100 to $10 through small withdrawals', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 100,
        openingDate: sixtyDaysAgo,
      })

      // 9 withdrawals of $10 each
      for (let i = 0; i < 9; i++) {
        await repository.addWithdrawal({ timeDepositId: td.id, amount: 10, date: new Date() })
      }

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Event replay: 100 - 90 + interest on 10: 10 × (0.01 / 365) × 60 = 0.02
      expect(deposits[0].balance).toBeCloseTo(10.02, 2)
    })

    test('Bring balance to near zero through many small withdrawals', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 100,
        openingDate: sixtyDaysAgo,
      })

      // 99 withdrawals of $1 each
      for (let i = 0; i < 99; i++) {
        await repository.addWithdrawal({ timeDepositId: td.id, amount: 1, date: new Date() })
      }

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Event replay: 100 - 99 + interest on 1 (rounds to 0)
      expect(deposits[0].balance).toBe(1)
    })
  })

  describe('Floating Point Precision Issues', () => {
    test('0.1 + 0.2 problem - ensure proper rounding', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      await repository.create({
        planType: 'basic',
        days: 60,
        balance: 33.33,
        openingDate: sixtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Should not have floating point errors: 33.33 × (0.01 / 365) × 60 = 0.05
      expect(deposits[0].balance).toBeCloseTo(33.38, 2)
    })

    test('Repeated small additions maintain precision', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 100.33,
        openingDate: sixtyDaysAgo,
      })

      // Multiple small deposits
      for (let i = 0; i < 10; i++) {
        await repository.db.insert(schema.deposits).values({
          timeDepositId: td.id,
          amount: 0.11,
          date: new Date(),
        })
      }

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 100.33 + 1.10 + interest on 101.43: 101.43 * 0.01 / 12 = 0.85 (rounds to 0.85)
      expect(deposits[0].balance).toBeGreaterThan(101.40)
      expect(deposits[0].balance).toBeLessThan(102.30)
    })
  })

  describe('Balance Transitions Through Zero', () => {
    test('Withdraw more than balance should be handled by constraints', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 100,
        openingDate: sixtyDaysAgo,
      })

      // Withdraw exactly the balance
      await repository.addWithdrawal({ timeDepositId: td.id, amount: 100, date: new Date() })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(0)
    })

    test('Deposit after complete withdrawal rebuilds balance', async () => {
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      const td = await repository.create({
        planType: 'student',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })

      // Withdraw everything
      await repository.addWithdrawal({ timeDepositId: td.id, amount: 1000, date: new Date() })
      
      // Deposit new funds
      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 500,
        date: new Date(),
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // 1000 - 1000 + 500 + interest on 500: 500 × (0.03 / 365) × 60 = 2.47
      expect(deposits[0].balance).toBeCloseTo(502.47, 2)
    })
  })
})
