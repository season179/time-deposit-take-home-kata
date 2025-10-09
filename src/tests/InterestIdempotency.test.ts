import { test, expect, describe, beforeEach } from 'bun:test'
import { DrizzleTimeDepositRepository } from '../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from './helpers/testDatabase'

/**
 * Interest Application Idempotency Tests (Prorated Interest)
 * 
 * Verifies that interest is calculated based on days elapsed since last interest
 * application. Multiple calls on the same day result in 0 additional interest
 * because daysSinceLastInterest = 0, providing natural idempotency.
 * 
 * Interest formula: (annualRate / 365) × daysSinceLastInterest × balance
 */
describe('Interest Application Idempotency', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  test('CRITICAL: Calling update-balances twice in rapid succession should NOT apply interest twice', async () => {
    // Setup: Create a time deposit 60 days ago with basic plan (1% annual rate)
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // First call: Apply interest for 60 days
    // Interest = 1000 × (0.01 / 365) × 60 = 1.64
    await updateUseCase.execute()

    let deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(1.64, 2)
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2)

    // Second call: Should result in 0 additional interest (same day, 0 days elapsed)
    await updateUseCase.execute()

    deposits = await repository.findAll()
    
    // CRITICAL ASSERTIONS: No new interest applied
    expect(deposits[0].interestApplications.length).toBe(1) // Still only 1
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2) // No change
  })

  test('Calling update-balances multiple times (3x) on same day should only apply interest once', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    await repository.create({
      planType: 'student', // 3% rate for variety
      days: 60,
      balance: 5000,
      openingDate: sixtyDaysAgo,
    })

    // Expected interest: 5000 × (0.03 / 365) × 60 = 24.66
    const expectedInterest = 24.66

    // Call 1: Applies interest for 60 days
    await updateUseCase.execute()
    
    // Call 2 (seconds later): 0 days elapsed, no new interest
    await updateUseCase.execute()
    
    // Call 3 (seconds later): 0 days elapsed, no new interest
    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Verify only ONE interest application despite 3 calls
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(expectedInterest, 2)
    expect(deposits[0].balance).toBeCloseTo(5000 + expectedInterest, 2)
  })

  test('Calling update-balances on different days SHOULD apply interest for elapsed days', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Day 1: Apply interest for 60 days
    // Interest = 1000 × (0.01 / 365) × 60 = 1.64
    await updateUseCase.execute()

    let deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(1.64, 2)
    const firstBalance = deposits[0].balance

    // Simulate Day 2: Manually add interest application for 1 day elapsed
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    // Interest for 1 day: 1001.64 × (0.01 / 365) × 1 = 0.03
    await repository.addInterestApplication({
      timeDepositId: td.id,
      amount: 0.03,
      date: tomorrow,
    })

    deposits = await repository.findAll()
    
    // Verify TWO interest applications (different days)
    expect(deposits[0].interestApplications.length).toBe(2)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(1.64, 2)
    expect(deposits[0].interestApplications[1].amount).toBeCloseTo(0.03, 2)
  })

  test('Idempotency works correctly with multiple time deposits', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    // Create 3 time deposits
    await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })
    
    await repository.create({
      planType: 'student',
      days: 60,
      balance: 5000,
      openingDate: sixtyDaysAgo,
    })
    
    await repository.create({
      planType: 'premium',
      days: 60,
      balance: 10000,
      openingDate: sixtyDaysAgo,
    })

    // First call: Apply interest for 60 days to all
    const result1 = await updateUseCase.execute()
    expect(result1.updated).toBe(3)

    let deposits = await repository.findAll()
    
    // Verify each has exactly 1 interest application
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[1].interestApplications.length).toBe(1)
    expect(deposits[2].interestApplications.length).toBe(1)
    
    const balances1 = deposits.map(d => d.balance)

    // Second call: 0 days elapsed, no new interest
    const result2 = await updateUseCase.execute()
    expect(result2.updated).toBe(3)

    deposits = await repository.findAll()
    
    // Verify STILL only 1 interest application each (0 days elapsed)
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[1].interestApplications.length).toBe(1)
    expect(deposits[2].interestApplications.length).toBe(1)
    
    // Verify balances unchanged (0 days = no new interest)
    expect(deposits[0].balance).toBe(balances1[0])
    expect(deposits[1].balance).toBe(balances1[1])
    expect(deposits[2].balance).toBe(balances1[2])
  })

  test('Interest calculation respects days elapsed principle', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Manually add an interest application for some past date
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    
    await repository.addInterestApplication({
      timeDepositId: td.id,
      amount: 1.64, // 60 days worth
      date: yesterday,
    })

    // Call today - should calculate interest for 1 day since yesterday
    // Interest for 1 day: 1001.64 × (0.01 / 365) × 1 = 0.03
    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Should have 2 interest applications
    expect(deposits[0].interestApplications.length).toBe(2)
    // Second application should be for just 1 day
    expect(deposits[0].interestApplications[1].amount).toBeCloseTo(0.03, 2)
  })

  test('Accounts with no interest (grace period) handle idempotency correctly', async () => {
    // Create account within grace period (20 days, no interest for basic)
    const twentyDaysAgo = new Date()
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20)
    
    await repository.create({
      planType: 'basic',
      days: 20,
      balance: 1000,
      openingDate: twentyDaysAgo,
    })

    // First call: No interest applied (grace period)
    await updateUseCase.execute()

    let deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(0)
    expect(deposits[0].balance).toBe(1000)

    // Second call: Still no interest, idempotency check shouldn't interfere
    await updateUseCase.execute()

    deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(0)
    expect(deposits[0].balance).toBe(1000)
  })

  test('Idempotency maintains correct balance calculations after withdrawals', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 10000,
      openingDate: sixtyDaysAgo,
    })

    // Apply interest for 60 days: 10000 × (0.01 / 365) × 60 = 16.44
    await updateUseCase.execute()

    let deposits = await repository.findAll()
    const balanceAfterInterest = deposits[0].balance
    expect(balanceAfterInterest).toBeCloseTo(10016.44, 2)

    // Make a withdrawal
    await repository.addWithdrawal({
      timeDepositId: td.id,
      amount: 5000,
      date: new Date(),
    })

    deposits = await repository.findAll()
    const balanceAfterWithdrawal = deposits[0].balance
    expect(balanceAfterWithdrawal).toBeCloseTo(5016.44, 2)

    // Try to apply interest again (same day) - 0 days elapsed = no new interest
    await updateUseCase.execute()

    deposits = await repository.findAll()
    
    // Balance should remain the same (0 days elapsed)
    expect(deposits[0].balance).toBeCloseTo(5016.44, 2)
    expect(deposits[0].interestApplications.length).toBe(1)
  })

  test('Return value reflects all deposits even when some skip interest due to idempotency', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    // Create 2 deposits
    await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })
    
    await repository.create({
      planType: 'basic',
      days: 60,
      balance: 2000,
      openingDate: sixtyDaysAgo,
    })

    // First call
    const result1 = await updateUseCase.execute()
    expect(result1.updated).toBe(2) // Both deposits updated

    // Second call (idempotent)
    const result2 = await updateUseCase.execute()
    expect(result2.updated).toBe(2) // Still reports 2 updated (balance refresh)
    
    const deposits = await repository.findAll()
    // But no new interest applications
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[1].interestApplications.length).toBe(1)
  })
})
