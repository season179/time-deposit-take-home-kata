import { test, expect, describe, beforeEach } from 'bun:test'
import * as schema from '../../infrastructure/database/schema'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { createTestContext } from '../helpers/testDatabase'

/**
 * Test Suite: Multiple Account Scenarios
 * 
 * Tests batch updates with multiple accounts:
 * - Different plan types
 * - Different ages
 * - Different activity levels
 * - Isolation between accounts
 */

describe('Multiple Account Scenarios', () => {
  let repository: DrizzleTimeDepositRepository
  let updateUseCase: UpdateAllTimeDepositBalances

  beforeEach(async () => {
    const context = await createTestContext()
    repository = context.repository
    updateUseCase = context.updateUseCase
  })

  test('Three accounts, three plan types, updated simultaneously', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    await repository.create({ planType: 'basic', days: 60, balance: 1000, openingDate: sixtyDaysAgo })
    await repository.create({ planType: 'student', days: 60, balance: 1000, openingDate: sixtyDaysAgo })
    await repository.create({ planType: 'premium', days: 60, balance: 1000, openingDate: sixtyDaysAgo })

    const result = await updateUseCase.execute()
    expect(result.updated).toBe(3)

    const deposits = await repository.findAll()
    
    // All should have interest
    deposits.forEach(d => expect(d.interestApplications.length).toBe(1))
    
    // Different rates produce different results
    // Basic (1%): 1000 × (0.01 / 365) × 60 = 1.64
    // Student (3%): 1000 × (0.03 / 365) × 60 = 4.93
    // Premium (5%): 1000 × (0.05 / 365) × 60 = 8.22
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2) // Basic: 1%
    expect(deposits[1].balance).toBeCloseTo(1004.93, 2) // Student: 3%
    expect(deposits[2].balance).toBeCloseTo(1008.22, 2) // Premium: 5%
  })

  test('Mix of accounts in grace period and earning interest', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const twentyDaysAgo = new Date()
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20)

    // Mature accounts
    await repository.create({ planType: 'basic', days: 60, balance: 1000, openingDate: sixtyDaysAgo })
    await repository.create({ planType: 'student', days: 60, balance: 1000, openingDate: sixtyDaysAgo })
    
    // Young accounts (in grace period)
    await repository.create({ planType: 'basic', days: 20, balance: 1000, openingDate: twentyDaysAgo })
    await repository.create({ planType: 'student', days: 20, balance: 1000, openingDate: twentyDaysAgo })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // First two should have interest
    expect(deposits[0].interestApplications.length).toBe(1)
    expect(deposits[1].interestApplications.length).toBe(1)
    
    // Last two should not
    expect(deposits[2].interestApplications.length).toBe(0)
    expect(deposits[3].interestApplications.length).toBe(0)
  })

  test('Dormant account vs active account', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    // Dormant account
    await repository.create({ planType: 'basic', days: 60, balance: 1000, openingDate: sixtyDaysAgo })
    
    // Active account with recent activity
    const active = await repository.create({ planType: 'basic', days: 60, balance: 1000, openingDate: sixtyDaysAgo })
    await repository.addWithdrawal({ timeDepositId: active.id, amount: 200, date: new Date() })
    await repository.db.insert(schema.deposits).values({
      timeDepositId: active.id,
      amount: 300,
      date: new Date(),
    })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Dormant: 1000 + interest on 1000
    // Interest: 1000 × (0.01 / 365) × 60 = 1.64
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2)
    
    // Active: 1000 - 200 + 300 + interest on 1100
    // Interest: 1100 × (0.01 / 365) × 60 = 1.81
    expect(deposits[1].balance).toBeCloseTo(1101.81, 2)
  })

  test('Accounts with same plan but different ages', async () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const fortyFiveDaysAgo = new Date()
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45)
    
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    // Premium plan at different ages
    await repository.create({ planType: 'premium', days: 30, balance: 1000, openingDate: thirtyDaysAgo })
    await repository.create({ planType: 'premium', days: 45, balance: 1000, openingDate: fortyFiveDaysAgo })
    await repository.create({ planType: 'premium', days: 60, balance: 1000, openingDate: sixtyDaysAgo })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Day 30: No interest (needs > 45 for premium)
    expect(deposits[0].interestApplications.length).toBe(0)
    expect(deposits[0].balance).toBe(1000)
    
    // Day 45: No interest (needs > 45)
    expect(deposits[1].interestApplications.length).toBe(0)
    expect(deposits[1].balance).toBe(1000)
    
    // Day 60: Gets interest
    expect(deposits[2].interestApplications.length).toBe(1)
    expect(deposits[2].balance).toBeGreaterThan(1000)
  })

  test('10 accounts with varying balances', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    // Create 10 accounts with different balances
    const balances = [100, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000, 500000]
    
    for (const balance of balances) {
      await repository.create({
        planType: 'student',
        days: 60,
        balance,
        openingDate: sixtyDaysAgo,
      })
    }

    const result = await updateUseCase.execute()
    expect(result.updated).toBe(10)

    const deposits = await repository.findAll()
    
    // All should have interest
    deposits.forEach(d => expect(d.interestApplications.length).toBe(1))
    
    // Interest should scale with balance (Student 3%, 60 days)
    // 100 × (0.03 / 365) × 60 = 0.49
    // 500000 × (0.03 / 365) × 60 = 2465.75
    expect(deposits[0].balance).toBeCloseTo(100.49, 2)
    expect(deposits[9].balance).toBeCloseTo(502465.75, 2)
  })

  test('Accounts with mixed activity levels get independent treatment', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const accounts = []
    
    // Create 5 accounts
    for (let i = 0; i < 5; i++) {
      const td = await repository.create({
        planType: 'basic',
        days: 60,
        balance: 1000,
        openingDate: sixtyDaysAgo,
      })
      accounts.push(td)
    }

    // Add different levels of activity
    // Account 0: No activity
    
    // Account 1: One withdrawal
    await repository.addWithdrawal({ timeDepositId: accounts[1].id, amount: 100, date: new Date() })
    
    // Account 2: One deposit
    await repository.db.insert(schema.deposits).values({
      timeDepositId: accounts[2].id,
      amount: 500,
      date: new Date(),
    })
    
    // Account 3: Multiple transactions
    await repository.addWithdrawal({ timeDepositId: accounts[3].id, amount: 300, date: new Date() })
    await repository.db.insert(schema.deposits).values({
      timeDepositId: accounts[3].id,
      amount: 200,
      date: new Date(),
    })
    
    // Account 4: Complete withdrawal
    await repository.addWithdrawal({ timeDepositId: accounts[4].id, amount: 1000, date: new Date() })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // Verify each account computed independently (Basic 1%, 60 days)
    // Account 0: 1000 × (0.01 / 365) × 60 = 1.64
    // Account 1: 900 × (0.01 / 365) × 60 = 1.48
    // Account 2: 1500 × (0.01 / 365) × 60 = 2.47
    // Account 3: 900 × (0.01 / 365) × 60 = 1.48
    expect(deposits[0].balance).toBeCloseTo(1001.64, 2) // 1000 + interest
    expect(deposits[1].balance).toBeCloseTo(901.48, 2)  // 1000 - 100 + interest
    expect(deposits[2].balance).toBeCloseTo(1502.47, 2) // 1000 + 500 + interest
    expect(deposits[3].balance).toBeCloseTo(901.48, 2)  // 1000 - 300 + 200 + interest
    expect(deposits[4].balance).toBe(0)                  // 1000 - 1000
  })

  test('Same-day updates to multiple accounts maintain isolation', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const td1 = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 1000,
      openingDate: sixtyDaysAgo,
    })

    const td2 = await repository.create({
      planType: 'basic',
      days: 60,
      balance: 2000,
      openingDate: sixtyDaysAgo,
    })

    // Apply interest to both
    await updateUseCase.execute()
    
    let deposits = await repository.findAll()
    const balance1AfterInterest = deposits.find(d => d.id === td1.id)!.balance
    const balance2AfterInterest = deposits.find(d => d.id === td2.id)!.balance

    // Withdraw from account 1 only
    await repository.addWithdrawal({ timeDepositId: td1.id, amount: 500, date: new Date() })

    deposits = await repository.findAll()
    
    // Account 1 should be affected
    expect(deposits.find(d => d.id === td1.id)!.balance).toBeLessThan(balance1AfterInterest)
    
    // Account 2 should be unchanged
    expect(deposits.find(d => d.id === td2.id)!.balance).toBe(balance2AfterInterest)
  })

  test('100 accounts batch update performance', async () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    // Create 100 accounts
    for (let i = 0; i < 100; i++) {
      await repository.create({
        planType: i % 3 === 0 ? 'basic' : i % 3 === 1 ? 'student' : 'premium',
        days: 60,
        balance: 1000 + (i * 10),
        openingDate: sixtyDaysAgo,
      })
    }

    const startTime = Date.now()
    const result = await updateUseCase.execute()
    const endTime = Date.now()

    expect(result.updated).toBe(100)
    
    // Should complete reasonably fast (under 1 second for 100 accounts)
    expect(endTime - startTime).toBeLessThan(1000)

    const deposits = await repository.findAll()
    expect(deposits.length).toBe(100)
    
    // All should have interest
    deposits.forEach(d => expect(d.interestApplications.length).toBe(1))
  })

  test('Student accounts at different stages of their year', async () => {
    const thirtyFiveDaysAgo = new Date()
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35)
    
    const threeHundredDaysAgo = new Date()
    threeHundredDaysAgo.setDate(threeHundredDaysAgo.getDate() - 300)
    
    const threeHundredSixtyFiveDaysAgo = new Date()
    threeHundredSixtyFiveDaysAgo.setDate(threeHundredSixtyFiveDaysAgo.getDate() - 365)
    
    const fourHundredDaysAgo = new Date()
    fourHundredDaysAgo.setDate(fourHundredDaysAgo.getDate() - 400)

    await repository.create({ planType: 'student', days: 35, balance: 1000, openingDate: thirtyFiveDaysAgo })
    await repository.create({ planType: 'student', days: 300, balance: 1000, openingDate: threeHundredDaysAgo })
    await repository.create({ planType: 'student', days: 365, balance: 1000, openingDate: threeHundredSixtyFiveDaysAgo })
    await repository.create({ planType: 'student', days: 400, balance: 1000, openingDate: fourHundredDaysAgo })

    await updateUseCase.execute()

    const deposits = await repository.findAll()
    
    // First three should have interest
    expect(deposits[0].interestApplications.length).toBe(1) // Day 35
    expect(deposits[1].interestApplications.length).toBe(1) // Day 300
    expect(deposits[2].interestApplications.length).toBe(1) // Day 365
    
    // Last one should not (> 365)
    expect(deposits[3].interestApplications.length).toBe(0) // Day 400
  })
})
