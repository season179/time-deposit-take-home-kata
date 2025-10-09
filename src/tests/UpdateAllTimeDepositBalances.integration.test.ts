import { test, expect, describe, beforeEach } from 'bun:test'
import { DrizzleTimeDepositRepository } from '../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from './helpers/testDatabase'

describe('UpdateAllTimeDepositBalances - Event Sourcing Integration', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  test('should compute balance from event replay, not stored balance', async () => {
    // Create a time deposit 60 days ago
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const timeDeposit = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Verify initial state
    let deposits = await repository.findAll()
    expect(deposits[0].balance).toBe(1000)
    expect(deposits[0].deposits.length).toBe(1) // Initial deposit
    expect(deposits[0].withdrawals.length).toBe(0)
    expect(deposits[0].interestApplications.length).toBe(0)

    // Execute update balance (should calculate and record interest)
    await updateUseCase.execute()

    // Verify interest was applied as an EVENT
    deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(1)
    
    // Verify the interest amount is correct (1000 × (0.01 / 365) × 60 = 1.64)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(1.64, 2)
    
    // Verify stored balance was updated
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2)
  })

  test('CRITICAL: should respect event chronology - withdrawal before vs after interest', async () => {
    // Scenario 1: Deposit -> Interest -> Withdrawal
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td1 = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Apply interest first
    await updateUseCase.execute()
    
    let deposits = await repository.findAll()
    const balanceAfterInterest1 = deposits.find(d => d.id === td1.id)!.balance
    expect(balanceAfterInterest1).toBeCloseTo(1001.64, 2) // 1000 + 1.64

    // Then withdraw
    await repository.addWithdrawal({
      timeDepositId: td1.id,
      amount: 500,
      date: new Date(),
    })

    deposits = await repository.findAll()
    const finalBalance1 = deposits.find(d => d.id === td1.id)!.balance
    expect(finalBalance1).toBeCloseTo(501.64, 2) // 1001.64 - 500

    // Scenario 2: Deposit -> Withdrawal -> Interest (different time deposit)
    const td2 = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Withdraw BEFORE interest
    await repository.addWithdrawal({
      timeDepositId: td2.id,
      amount: 500,
      date: new Date(),
    })

    deposits = await repository.findAll()
    const balanceAfterWithdrawal = deposits.find(d => d.id === td2.id)!.balance
    expect(balanceAfterWithdrawal).toBe(500) // 1000 - 500

    // Now apply interest - 60 days since opening, calculated on current balance
    // Interest on 500 for 60 days: 500 × (0.01 / 365) × 60 = 0.82
    await updateUseCase.execute()

    deposits = await repository.findAll()
    const finalBalance2 = deposits.find(d => d.id === td2.id)!.balance
    
    // Balance: 500 + 0.82 = 500.82
    expect(finalBalance2).toBeCloseTo(500.82, 2)

    // CRITICAL VERIFICATION: The two scenarios produce different results
    // because event order matters
    expect(finalBalance1).toBeGreaterThan(finalBalance2)
  })

  test('should handle multiple interest applications over time', async () => {
    // Create time deposit 60 days ago
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // First interest application
    await updateUseCase.execute()
    let deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2)

    // Second call on SAME DAY - 0 days elapsed, no new interest
    await updateUseCase.execute()
    deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(1) // Still only 1
    
    // Balance remains unchanged (0 days elapsed)
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2)
  })

  test('should replay all events in correct order for complex scenarios', async () => {
    // Create time deposit 60 days ago
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'student', // 3% rate
      days: 60,
      balance: 10000,
      openingDate: sixtyDaysAgo,
    })

    // Apply first interest (10000 × (0.03 / 365) × 60 = 49.32)
    await updateUseCase.execute()
    
    let deposits = await repository.findAll()
    expect(deposits[0].balance).toBeCloseTo(10049.32, 2)

    // Make a withdrawal
    await repository.addWithdrawal({
      timeDepositId: td.id,
      amount: 2000,
      date: new Date(),
    })

    deposits = await repository.findAll()
    expect(deposits[0].balance).toBeCloseTo(8049.32, 2)

    // Attempt second call on same day (0 days elapsed - no new interest)
    await updateUseCase.execute()

    deposits = await repository.findAll()
    
    // Verify event counts - only 1 interest (0 days elapsed)
    expect(deposits[0].deposits.length).toBe(1) // Initial deposit
    expect(deposits[0].withdrawals.length).toBe(1)
    expect(deposits[0].interestApplications.length).toBe(1) // Only first interest
    
    // Verify final balance from event replay
    // 10000 (deposit) + 49.32 (interest) - 2000 (withdrawal) = 8049.32
    expect(deposits[0].balance).toBeCloseTo(8049.32, 2)
  })

  test('should handle no interest for accounts within grace period', async () => {
    // Create account with only 20 days (no interest for basic until day 31)
    await repository.create({
      planType: 'basic',
      days: 20,
      balance: 1000,
      openingDate: new Date(),
    })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // No interest should be applied
    expect(deposits[0].interestApplications.length).toBe(0)
    expect(deposits[0].balance).toBe(1000) // No change
  })

  test('should handle premium plan with 45-day threshold correctly', async () => {
    // Create premium plan at exactly 46 days ago (just past threshold)
    const fortySixDaysAgo = new Date()
    fortySixDaysAgo.setDate(fortySixDaysAgo.getDate() - 46)
    
    await repository.create({
      planType: 'premium',
      days: 46,
      balance: 10000,
      openingDate: fortySixDaysAgo,
    })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Interest should be applied (10000 × (0.05 / 365) × 46 = 63.01)
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(63.01, 2)
    expect(deposits[0].balance).toBeCloseTo(10063.01, 2)
  })
})
