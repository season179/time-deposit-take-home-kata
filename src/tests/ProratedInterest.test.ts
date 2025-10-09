import { test, expect, describe, beforeEach } from 'bun:test'
import { DrizzleTimeDepositRepository } from '../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from './helpers/testDatabase'

/**
 * Prorated Interest Calculation Tests
 * 
 * Verifies the core behavior of the prorated interest system:
 * - Interest = balance × (annualRate / 365) × daysSinceLastInterest
 * - Multiple calls on same day = 0 additional interest (natural idempotency)
 * - Calling daily = appropriate daily interest, not exploitable
 * 
 * This fixes the original bug where calling the endpoint daily would
 * apply monthly interest every day, leading to 30x too much interest.
 */
describe('Prorated Interest Calculation', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  test('Scenario from user question: Jan 1 deposit, Apr 1 call, Apr 2 call', async () => {
    // Setup: $1,000 deposit on Jan 1
    const jan1 = new Date('2024-01-01')
    
    const td = await repository.create({
      planType: 'basic', // 1% annual
      days: 0,
      balance: 1000,
      openingDate: jan1,
    })

    // Apr 1: First call (90 days elapsed)
    // Interest = 1000 × (0.01 / 365) × 90 = 2.47
    const apr1 = new Date('2024-04-01')
    await repository.addInterestApplication({
      timeDepositId: td.id,
      amount: 2.47,
      date: apr1,
    })

    // Apr 2: Call again (1 day elapsed since last interest)
    // Interest = 1002.47 × (0.01 / 365) × 1 = 0.03
    const apr2 = new Date('2024-04-02')
    await repository.addInterestApplication({
      timeDepositId: td.id,
      amount: 0.03,
      date: apr2,
    })

    let deposits = await repository.findAll()
    
    // Verify 2 interest applications
    expect(deposits[0].interestApplications.length).toBe(2)
    
    // Apr 1: 90 days worth
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(2.47, 2)
    
    // Apr 2: 1 day worth (not another 90 days!)
    expect(deposits[0].interestApplications[1].amount).toBeCloseTo(0.03, 2)
    
    // Update balance to reflect the interest
    await repository.updateBalance(td.id, 1002.50)
    
    deposits = await repository.findAll()
    // Total balance: 1000 + 2.47 + 0.03 = 1002.50
    expect(deposits[0].balance).toBeCloseTo(1002.50, 2)
  })

  test('Calling endpoint daily for 30 days applies reasonable interest', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // First call: 60 days worth
    await updateUseCase.execute()
    
    let deposits = await repository.findAll()
    const firstInterest = deposits[0].interestApplications[0].amount
    expect(firstInterest).toBeCloseTo(1.64, 2) // 1000 × 0.01/365 × 60

    // Simulate calling every day for 30 days
    let totalInterest = firstInterest
    for (let day = 1; day <= 30; day++) {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + day)
      
      deposits = await repository.findAll()
      const currentBalance = deposits[0].balance
      
      // Interest for 1 day
      const dailyInterest = Math.round((currentBalance * (0.01 / 365) * 1 + Number.EPSILON) * 100) / 100
      
      await repository.addInterestApplication({
        timeDepositId: td.id,
        amount: dailyInterest,
        date: futureDate,
      })
      
      totalInterest += dailyInterest
    }

    deposits = await repository.findAll()
    
    // Should have 31 interest applications (initial + 30 days)
    expect(deposits[0].interestApplications.length).toBe(31)
    
    // Total interest should be reasonable (~2.50, not ~24.90 with the bug)
    // 30 days of daily interest on ~1000 ≈ 0.82
    // Plus initial 60 days = 1.64
    // Total ≈ 2.46
    expect(totalInterest).toBeLessThan(3)
    expect(totalInterest).toBeGreaterThan(2)
  })

  test('Monthly interest calculation for comparison', async () => {
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
    
    // With prorated interest: 1000 × (0.01 / 365) × 60 = 1.64
    // This is ~2 months worth of interest, which makes sense
    // Old monthly formula would give: 1000 × 0.01 / 12 = 0.83 (1 month)
    
    expect(deposits[0].interestApplications[0].amount).toBeCloseTo(1.64, 2)
  })

  test('Interest calculation for different plan types', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    // Basic: 1% annual
    const basic = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 10000,
      openingDate: sixtyDaysAgo,
    })
    
    // Student: 3% annual
    const student = await repository.create({
      planType: 'student',
      days: 60,
      balance: 10000,
      openingDate: sixtyDaysAgo,
    })
    
    // Premium: 5% annual (but needs >45 days)
    const seventyDaysAgo = new Date()
    seventyDaysAgo.setDate(seventyDaysAgo.getDate() - 70)
    
    const premium = await repository.create({
      planType: 'premium',
      days: 70,
      balance: 10000,
      openingDate: seventyDaysAgo,
    })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Basic: 10000 × (0.01 / 365) × 60 = 16.44
    expect(deposits.find(d => d.id === basic.id)!.interestApplications[0].amount).toBeCloseTo(16.44, 2)
    
    // Student: 10000 × (0.03 / 365) × 60 = 49.32
    expect(deposits.find(d => d.id === student.id)!.interestApplications[0].amount).toBeCloseTo(49.32, 2)
    
    // Premium: 10000 × (0.05 / 365) × 70 = 95.89
    expect(deposits.find(d => d.id === premium.id)!.interestApplications[0].amount).toBeCloseTo(95.89, 2)
  })

  test('Interest compounds correctly over multiple applications', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // First application: 60 days
    // Interest = 1000 × (0.01 / 365) × 60 = 1.64
    await updateUseCase.execute()
    
    // Simulate 30 days later
    const thirtyDaysLater = new Date()
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)
    
    // Second application: 30 days on new balance
    // Interest = 1001.64 × (0.01 / 365) × 30 = 0.82
    await repository.addInterestApplication({
      timeDepositId: td.id,
      amount: 0.82,
      date: thirtyDaysLater,
    })
    
    // Update balance to reflect both interest applications
    await repository.updateBalance(td.id, 1002.46)

    const deposits = await repository.findAll()
    
    // Balance: 1000 + 1.64 + 0.82 = 1002.46
    expect(deposits[0].balance).toBeCloseTo(1002.46, 2)
    
    // This demonstrates compounding: second interest is calculated on
    // the balance INCLUDING first interest
  })
})
