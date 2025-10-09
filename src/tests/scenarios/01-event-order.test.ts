import { test, expect, describe, beforeEach } from 'bun:test'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from '../helpers/testDatabase'

/**
 * Test Suite: Event Order Scenarios
 * 
 * THE CORE REQUIREMENT: Event chronology must be respected.
 * Different sequences produce different results.
 */

describe('Event Order Scenarios', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  test('Deposit → Interest → Withdrawal produces higher balance', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    await updateUseCase.execute() // Interest on 1000
    await repository.addWithdrawal({ timeDepositId: td.id, amount: 500, date: new Date() })

    const deposits = await repository.findAll()
    expect(deposits[0].balance).toBeCloseTo(500.83, 2) // 1000 + 0.83 - 500
  })

  test('Deposit → Withdrawal → Interest produces lower balance', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    await repository.addWithdrawal({ timeDepositId: td.id, amount: 500, date: new Date() })
    await updateUseCase.execute() // Interest on 500

    const deposits = await repository.findAll()
    expect(deposits[0].balance).toBeCloseTo(500.42, 2) // 1000 - 500 + 0.42
  })

  test('Multiple deposits with interest interspersed', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const td = await repository.create({
      planType: 'student',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    await updateUseCase.execute() // Interest on 1000: 1000 * 0.03 / 12 = 2.50

    await repository.db.insert(schema.deposits).values({
      timeDepositId: td.id,
      amount: 500,
      date: new Date(),
    })

    // Second call on same day - IDEMPOTENT (no new interest)
    await updateUseCase.execute()

    const deposits = await repository.findAll()
    // Balance: 1000 + 2.50 (interest) + 500 (deposit) = 1502.50
    expect(deposits[0].balance).toBeCloseTo(1502.50, 2)
    expect(deposits[0].interestApplications.length).toBe(1) // Only one interest due to idempotency
  })

  test('Withdrawal → Deposit → Interest (rebalancing)', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    await repository.addWithdrawal({ timeDepositId: td.id, amount: 900, date: new Date() })
    await repository.db.insert(schema.deposits).values({
      timeDepositId: td.id,
      amount: 500,
      date: new Date(),
    })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    expect(deposits[0].balance).toBeCloseTo(600.50, 2) // 1000 - 900 + 500 + 0.50
  })

  test('Complex sequence: Deposit → Interest → Withdrawal → Deposit → Interest', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const td = await repository.create({
      planType: 'student', // 3% rate
      days: 60,
      balance: 5000,
      openingDate: sixtyDaysAgo,
    })

    // First interest: 5000 * 0.03 / 12 = 12.50
    await updateUseCase.execute()
    
    // Withdrawal
    await repository.addWithdrawal({ timeDepositId: td.id, amount: 2000, date: new Date() })
    
    // Add back funds
    await repository.db.insert(schema.deposits).values({
      timeDepositId: td.id,
      amount: 1000,
      date: new Date(),
    })
    
    // Second call on same day - IDEMPOTENT (no new interest)
    await updateUseCase.execute()

    const deposits = await repository.findAll()
    // Event replay: 5000 + 12.50 (interest) - 2000 (withdrawal) + 1000 (deposit)
    // Total: 4012.50 (no second interest due to idempotency)
    expect(deposits[0].balance).toBeCloseTo(4012.50, 2)
    expect(deposits[0].interestApplications.length).toBe(1) // Only one due to idempotency
  })

  test('Rapid withdrawals and deposits creating volatile balance', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const td = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    // Simulate volatile activity on same day
    await repository.addWithdrawal({ timeDepositId: td.id, amount: 300, date: new Date() })
    await updateUseCase.execute() // First interest application
    
    await repository.db.insert(schema.deposits).values({ timeDepositId: td.id, amount: 500, date: new Date() })
    await updateUseCase.execute() // Idempotent - no new interest
    
    await repository.addWithdrawal({ timeDepositId: td.id, amount: 400, date: new Date() })
    await updateUseCase.execute() // Idempotent - no new interest
    
    await repository.db.insert(schema.deposits).values({ timeDepositId: td.id, amount: 200, date: new Date() })
    await updateUseCase.execute() // Idempotent - no new interest

    const deposits = await repository.findAll()
    // Only 1 interest application due to idempotency (all on same day)
    expect(deposits[0].interestApplications.length).toBe(1)
    
    const expectedBase = 1000 - 300 + 500 - 400 + 200 // = 1000
    expect(deposits[0].balance).toBeGreaterThan(expectedBase)
  })
})
