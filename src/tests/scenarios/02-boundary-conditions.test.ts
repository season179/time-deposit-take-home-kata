import { test, expect, describe, beforeEach } from 'bun:test'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from '../helpers/testDatabase'

/**
 * Test Suite: Boundary Conditions
 * 
 * Tests day threshold boundaries for all plan types.
 * Critical: Off-by-one errors in day calculations.
 */

describe('Boundary Conditions - Day Thresholds', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  describe('Basic Plan - 30 day threshold', () => {
    test('Day 29: No interest', async () => {
      const twentyNineDaysAgo = new Date()
      twentyNineDaysAgo.setDate(twentyNineDaysAgo.getDate() - 29)

      await repository.create({
        planType: 'basic',
        days: 29,
        balance: 1000,
        openingDate: twentyNineDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1000)
    })

    test('Day 30: No interest (boundary)', async () => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      await repository.create({
        planType: 'basic',
        days: 30,
        balance: 1000,
        openingDate: thirtyDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1000)
    })

    test('Day 31: First interest applies', async () => {
      const thirtyOneDaysAgo = new Date()
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31)

      await repository.create({
        planType: 'basic',
        days: 31,
        balance: 1000,
        openingDate: thirtyOneDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeGreaterThan(1000)
    })
  })

  describe('Premium Plan - 45 day threshold', () => {
    test('Day 44: No interest', async () => {
      const fortyFourDaysAgo = new Date()
      fortyFourDaysAgo.setDate(fortyFourDaysAgo.getDate() - 44)

      await repository.create({
        planType: 'premium',
        days: 44,
        balance: 1000,
        openingDate: fortyFourDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1000)
    })

    test('Day 45: No interest (boundary)', async () => {
      const fortyFiveDaysAgo = new Date()
      fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45)

      await repository.create({
        planType: 'premium',
        days: 45,
        balance: 1000,
        openingDate: fortyFiveDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1000)
    })

    test('Day 46: First interest applies', async () => {
      const fortySixDaysAgo = new Date()
      fortySixDaysAgo.setDate(fortySixDaysAgo.getDate() - 46)

      await repository.create({
        planType: 'premium',
        days: 46,
        balance: 1000,
        openingDate: fortySixDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeGreaterThan(1000)
    })
  })

  describe('Student Plan - 365 day cutoff', () => {
    test('Day 364: Gets interest', async () => {
      const threeHundredSixtyFourDaysAgo = new Date()
      threeHundredSixtyFourDaysAgo.setDate(threeHundredSixtyFourDaysAgo.getDate() - 364)

      await repository.create({
        planType: 'student',
        days: 364,
        balance: 1000,
        openingDate: threeHundredSixtyFourDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeGreaterThan(1000)
    })

    test('Day 365: Gets interest (boundary)', async () => {
      const threeHundredSixtyFiveDaysAgo = new Date()
      threeHundredSixtyFiveDaysAgo.setDate(threeHundredSixtyFiveDaysAgo.getDate() - 365)

      await repository.create({
        planType: 'student',
        days: 365,
        balance: 1000,
        openingDate: threeHundredSixtyFiveDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeGreaterThan(1000)
    })

    test('Day 366: No more interest', async () => {
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
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1000)
    })

    test('Day 400: Still no interest', async () => {
      const fourHundredDaysAgo = new Date()
      fourHundredDaysAgo.setDate(fourHundredDaysAgo.getDate() - 400)

      await repository.create({
        planType: 'student',
        days: 400,
        balance: 1000,
        openingDate: fourHundredDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(1000)
    })
  })

  describe('Compound boundaries - Premium plan must also satisfy 30 day rule', () => {
    test('Premium at day 46 but basic rule needs >30: Should get interest', async () => {
      const fortySixDaysAgo = new Date()
      fortySixDaysAgo.setDate(fortySixDaysAgo.getDate() - 46)

      await repository.create({
        planType: 'premium',
        days: 46,
        balance: 1000,
        openingDate: fortySixDaysAgo,
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Should satisfy both days > 30 AND days > 45
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeGreaterThan(1000)
    })
  })

  describe('Student plan boundaries with withdrawals', () => {
    test('Student at day 365 with withdrawal still gets interest', async () => {
      const threeHundredSixtyFiveDaysAgo = new Date()
      threeHundredSixtyFiveDaysAgo.setDate(threeHundredSixtyFiveDaysAgo.getDate() - 365)

      const td = await repository.create({
        planType: 'student',
        days: 365,
        balance: 5000,
        openingDate: threeHundredSixtyFiveDaysAgo,
      })

      await repository.addWithdrawal({ timeDepositId: td.id, amount: 2000, date: new Date() })
      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Should get interest on reduced balance (3000)
      expect(deposits[0].interestApplications.length).toBe(1)
      expect(deposits[0].balance).toBeCloseTo(3007.50, 2) // 3000 + (3000 * 0.03 / 12)
    })

    test('Student at day 366 with deposit gets no interest', async () => {
      const threeHundredSixtySixDaysAgo = new Date()
      threeHundredSixtySixDaysAgo.setDate(threeHundredSixtySixDaysAgo.getDate() - 366)

      const td = await repository.create({
        planType: 'student',
        days: 366,
        balance: 5000,
        openingDate: threeHundredSixtySixDaysAgo,
      })

      await repository.db.insert(schema.deposits).values({
        timeDepositId: td.id,
        amount: 2000,
        date: new Date(),
      })

      await updateUseCase.execute()

      const deposits = await repository.findAll()
      // Should NOT get interest even with new deposit
      expect(deposits[0].interestApplications.length).toBe(0)
      expect(deposits[0].balance).toBe(7000) // Just the deposits, no interest
    })
  })
})
