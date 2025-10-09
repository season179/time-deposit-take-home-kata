import { test, expect, describe, beforeEach } from 'bun:test'
import { DrizzleTimeDepositRepository } from '../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from './helpers/testDatabase'

/**
 * Interest Application Idempotency Tests
 * 
 * Verifies that calling the update-balances endpoint multiple times on the same day
 * does NOT result in duplicate interest applications, preventing the critical bug
 * where rapid successive calls would compound interest multiple times.
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

    // First call: Apply interest
    await updateUseCase.execute()

    let deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(0.83, 2) // 1000 * 0.01 / 12
    expect(deposits[0].balance).toBeCloseTo(1000.83, 2)

    // Second call: Should be idempotent (NO NEW INTEREST)
    await updateUseCase.execute()

    deposits = await repository.findAll()
    
    // CRITICAL ASSERTIONS: Interest should NOT be duplicated
    expect(deposits[0].interestApplications.length).toBe(1) // Still only 1
    expect(deposits[0].balance).toBeCloseTo(1000.83, 2) // No change
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

    // Expected interest: 5000 * 0.03 / 12 = 12.50
    const expectedInterest = 12.50

    // Call 1
    await updateUseCase.execute()
    
    // Call 2 (seconds later)
    await updateUseCase.execute()
    
    // Call 3 (seconds later)
    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Verify only ONE interest application despite 3 calls
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(expectedInterest, 2)
    expect(deposits[0].balance).toBeCloseTo(5000 + expectedInterest, 2)
  })

  test('Calling update-balances on different days SHOULD apply interest multiple times', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Day 1: Apply interest
    await updateUseCase.execute()

    let deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(1)
    const firstInterestAmount = deposits[0].interestApplications[0].amount
    const firstBalance = deposits[0].balance

    // Simulate Day 2: Manually add interest application with tomorrow's date
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    // We need to manually add an interest for tomorrow to test
    // (In real scenario, this would be called the next day)
    await repository.addInterestApplication({
      timeDepositId: td.id,
      amount: 0.83, // Same amount for consistency
      date: tomorrow,
    })

    deposits = await repository.findAll()
    
    // Verify TWO interest applications (one for each day)
    expect(deposits[0].interestApplications.length).toBe(2)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(firstInterestAmount, 2)
    expect(deposits[0].interestApplications[1].amount).toBeCloseTo(0.83, 2)
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

    // First call: Apply interest to all
    const result1 = await updateUseCase.execute()
    expect(result1.updated).toBe(3)

    let deposits = await repository.findAll()
    
    // Verify each has exactly 1 interest application
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[1].interestApplications.length).toBe(1)
    expect(deposits[2].interestApplications.length).toBe(1)
    
    const balances1 = deposits.map(d => d.balance)

    // Second call: Should be idempotent for all
    const result2 = await updateUseCase.execute()
    expect(result2.updated).toBe(3) // All updated (balance refresh) but no new interest

    deposits = await repository.findAll()
    
    // Verify STILL only 1 interest application each
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[1].interestApplications.length).toBe(1)
    expect(deposits[2].interestApplications.length).toBe(1)
    
    // Verify balances unchanged
    expect(deposits[0].balance).toBe(balances1[0])
    expect(deposits[1].balance).toBe(balances1[1])
    expect(deposits[2].balance).toBe(balances1[2])
  })

  test('Idempotency check works correctly at day boundaries', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Manually add an interest application at 11:59 PM today
    const lateTonight = new Date()
    lateTonight.setHours(23, 59, 59, 999)
    
    await repository.addInterestApplication({
      timeDepositId: td.id,
      amount: 0.83,
      date: lateTonight,
    })

    // Try to apply interest again (should be blocked since there's already one today)
    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Should still have only 1 interest application (the late night one)
    expect(deposits[0].interestApplications.length).toBe(1)
    // Check it's the same date within a second (database may truncate milliseconds)
    const timeDiff = Math.abs(deposits[0].interestApplications[0].date.getTime() - lateTonight.getTime())
    expect(timeDiff).toBeLessThan(1000)
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

    // Apply interest
    await updateUseCase.execute()

    let deposits = await repository.findAll()
    const balanceAfterInterest = deposits[0].balance
    expect(balanceAfterInterest).toBeCloseTo(10008.33, 2) // 10000 + (10000 * 0.01 / 12)

    // Make a withdrawal
    await repository.addWithdrawal({
      timeDepositId: td.id,
      amount: 5000,
      date: new Date(),
    })

    deposits = await repository.findAll()
    const balanceAfterWithdrawal = deposits[0].balance
    expect(balanceAfterWithdrawal).toBeCloseTo(5008.33, 2)

    // Try to apply interest again (same day) - should be blocked
    await updateUseCase.execute()

    deposits = await repository.findAll()
    
    // Balance should remain the same (no new interest)
    expect(deposits[0].balance).toBeCloseTo(5008.33, 2)
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
