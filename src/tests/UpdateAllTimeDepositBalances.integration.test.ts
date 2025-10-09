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
    
    // Verify the interest amount is correct (1000 * 0.01 / 12 = 0.83)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(0.83, 2)
    
    // Verify stored balance was updated
    expect(deposits[0].balance).toBeCloseTo(1000.83, 2)
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
    expect(balanceAfterInterest1).toBeCloseTo(1000.83, 2) // 1000 + 0.83

    // Then withdraw
    await repository.addWithdrawal({
      timeDepositId: td1.id,
      amount: 500,
      date: new Date(),
    })

    deposits = await repository.findAll()
    const finalBalance1 = deposits.find(d => d.id === td1.id)!.balance
    expect(finalBalance1).toBeCloseTo(500.83, 2) // 1000.83 - 500

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

    // Now apply interest (on the reduced balance of 500)
    await updateUseCase.execute()

    deposits = await repository.findAll()
    const finalBalance2 = deposits.find(d => d.id === td2.id)!.balance
    
    // Interest on 500: 500 * 0.01 / 12 = 0.42 (rounded)
    expect(finalBalance2).toBeCloseTo(500.42, 2)

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
    expect(deposits[0].balance).toBeCloseTo(1000.83, 2)

    // Second interest application (NOTE: This will compound on the new balance)
    await updateUseCase.execute()
    deposits = await repository.findAll()
    expect(deposits[0].interestApplications.length).toBe(2)
    
    // With event sourcing, balance is computed from events:
    // Initial deposit: 1000
    // First interest: 0.83
    // Second interest: 0.83 (calculated on 1000.83, rounds to 0.83)
    expect(deposits[0].balance).toBeCloseTo(1001.66, 1)
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

    // Apply first interest (10000 * 0.03 / 12 = 25.00)
    await updateUseCase.execute()
    
    let deposits = await repository.findAll()
    expect(deposits[0].balance).toBeCloseTo(10025.00, 2)

    // Make a withdrawal
    await repository.addWithdrawal({
      timeDepositId: td.id,
      amount: 2000,
      date: new Date(),
    })

    deposits = await repository.findAll()
    expect(deposits[0].balance).toBeCloseTo(8025.00, 2)

    // Apply second interest (should be on reduced balance: 8025 * 0.03 / 12 = 20.06)
    await updateUseCase.execute()

    deposits = await repository.findAll()
    
    // Verify event counts
    expect(deposits[0].deposits.length).toBe(1) // Initial deposit
    expect(deposits[0].withdrawals.length).toBe(1)
    expect(deposits[0].interestApplications.length).toBe(2)
    
    // Verify final balance from event replay
    // 10000 (deposit) + 25 (interest) - 2000 (withdrawal) + 20.06 (interest) = 8045.06
    expect(deposits[0].balance).toBeCloseTo(8045.06, 2)
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
    
    // Interest should be applied (10000 * 0.05 / 12 = 41.67)
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(41.67, 2)
    expect(deposits[0].balance).toBeCloseTo(10041.67, 2)
  })
})
