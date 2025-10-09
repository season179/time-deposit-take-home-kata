import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { FastifyInstance } from 'fastify'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createServer } from '../../api/server'
import { timeDepositRoutes } from '../../api/routes/timeDeposits'
import { DrizzleTimeDepositRepository } from '../../infrastructure/adapters/DrizzleTimeDepositRepository'
import { GetAllTimeDeposits } from '../../application/usecases/GetAllTimeDeposits'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import * as schema from '../../infrastructure/database/schema'

/**
 * Integration Tests: End-to-End Lifecycle Tests
 * 
 * Category 10: Complete Lifecycle Scenarios
 * Tests complete workflows that exercise multiple endpoints in sequence
 */

describe('End-to-End Lifecycle Tests', () => {
  let server: FastifyInstance
  let repository: DrizzleTimeDepositRepository
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(async () => {
    const sqlite = new Database(':memory:', { create: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    db = drizzle(sqlite, { schema })
    await migrate(db, { migrationsFolder: './drizzle/migrations' })
    
    repository = new DrizzleTimeDepositRepository(db)
    const calculator = new TimeDepositCalculator()
    const getAllTimeDeposits = new GetAllTimeDeposits(repository)
    const updateAllTimeDepositBalances = new UpdateAllTimeDepositBalances(repository, calculator)

    server = await createServer()
    await server.register(timeDepositRoutes, {
      getAllTimeDeposits,
      updateAllTimeDepositBalances,
    })
  })

  afterEach(async () => {
    await server.close()
  })

  describe('Complete Lifecycle Scenarios', () => {
    test('Scenario 10.1: Full deposit lifecycle', async () => {
      // Step 1: Verify database is empty
      let response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual([])

      // Step 2: Create deposits
      const deposit1 = await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      const deposit2 = await repository.create({ planType: 'student', days: 100, balance: 3000 })
      const deposit3 = await repository.create({ planType: 'premium', days: 60, balance: 10000 })

      // Step 3: GET /time-deposits - verify initial state
      response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      expect(response.statusCode).toBe(200)
      let data = JSON.parse(response.body)
      expect(data).toHaveLength(3)
      expect(data[0].balance).toBe(1000)
      expect(data[1].balance).toBe(3000)
      expect(data[2].balance).toBe(10000)

      // Step 4: POST /update-balances - verify response
      response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })
      expect(response.statusCode).toBe(200)
      const updateData = JSON.parse(response.body)
      expect(updateData.updated).toBe(3)

      // Step 5: GET /time-deposits - verify balances increased
      response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      data = JSON.parse(response.body)
      expect(data[0].balance).toBeGreaterThan(1000)
      expect(data[1].balance).toBeGreaterThan(3000)
      expect(data[2].balance).toBeGreaterThan(10000)

      // Step 6: Add withdrawal to one deposit
      await repository.addWithdrawal({
        timeDepositId: deposit2.id,
        amount: 500,
        date: new Date('2024-01-15'),
      })

      // Step 7: GET /time-deposits - verify withdrawal appears
      response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      data = JSON.parse(response.body)
      const deposit2Data = data.find((d: any) => d.id === deposit2.id)
      expect(deposit2Data.withdrawals).toHaveLength(1)
      expect(deposit2Data.withdrawals[0].amount).toBe(500)

      // Step 8: POST /update-balances - verify interest on reduced balance
      const balanceBeforeSecondUpdate = deposit2Data.balance
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      // Step 9: GET /time-deposits - verify final state
      response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      data = JSON.parse(response.body)
      const finalDeposit2 = data.find((d: any) => d.id === deposit2.id)
      expect(finalDeposit2.balance).toBeGreaterThan(balanceBeforeSecondUpdate)
      expect(finalDeposit2.withdrawals).toHaveLength(1) // Withdrawal still present
    })

    test('Scenario 10.2: Multi-plan comparison lifecycle', async () => {
      // Create all three plans with same conditions
      const balance = 10000
      const days = 100

      await repository.create({ planType: 'basic', days, balance })
      await repository.create({ planType: 'student', days, balance })
      await repository.create({ planType: 'premium', days, balance })

      // Get initial state
      let response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      let data = JSON.parse(response.body)
      
      // All start with same balance
      data.forEach((d: any) => {
        expect(d.balance).toBe(10000)
      })

      // Apply interest
      await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      // Verify different interest amounts
      response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })
      data = JSON.parse(response.body)

      const basic = data.find((d: any) => d.planType === 'basic')
      const student = data.find((d: any) => d.planType === 'student')
      const premium = data.find((d: any) => d.planType === 'premium')

      // Basic: 1% → 10008.33
      expect(basic.balance).toBeCloseTo(10008.33, 2)
      
      // Student: 3% → 10025.00
      expect(student.balance).toBeCloseTo(10025.00, 2)
      
      // Premium: 5% → 10041.67
      expect(premium.balance).toBeCloseTo(10041.67, 2)

      // Verify hierarchy: premium > student > basic
      expect(premium.balance).toBeGreaterThan(student.balance)
      expect(student.balance).toBeGreaterThan(basic.balance)
    })

    test('Scenario 10.3: Complex withdrawal and interest sequence', async () => {
      const deposit = await repository.create({ 
        planType: 'premium', 
        days: 100, 
        balance: 10000 
      })

      // Initial balance check
      let response = await server.inject({ method: 'GET', url: '/time-deposits' })
      let data = JSON.parse(response.body)
      expect(data[0].balance).toBe(10000)

      // Apply interest (update 1)
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      data = JSON.parse(response.body)
      expect(data[0].balance).toBeCloseTo(10041.67, 2)

      // Withdrawal 1
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 2000,
        date: new Date('2024-01-15'),
      })
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      data = JSON.parse(response.body)
      expect(data[0].balance).toBeCloseTo(8041.67, 2)

      // Apply interest (update 2)
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      data = JSON.parse(response.body)
      // 8041.67 + (8041.67 * 0.05 / 12) = 8075.18 (with rounding)
      expect(data[0].balance).toBeCloseTo(8075.18, 1)

      // Withdrawal 2
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date('2024-02-15'),
      })
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      data = JSON.parse(response.body)
      expect(data[0].balance).toBeCloseTo(7075.18, 1) // 8075.18 - 1000

      // Apply interest (update 3)
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      data = JSON.parse(response.body)
      // 7075.18 + (7075.18 * 0.05 / 12) = 7075.18 + 29.48 = 7104.66
      expect(data[0].balance).toBeCloseTo(7104.66, 1)

      // Verify withdrawal history is complete
      expect(data[0].withdrawals).toHaveLength(2)
      expect(data[0].withdrawals[0].amount).toBe(2000)
      expect(data[0].withdrawals[1].amount).toBe(1000)
    })

    test('Scenario 10.4: Boundary transition lifecycle', async () => {
      // Create student plan near cutoff
      await repository.create({ planType: 'student', days: 364, balance: 5000 })

      // Update at day 364 - should get interest
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      let response = await server.inject({ method: 'GET', url: '/time-deposits' })
      let data = JSON.parse(response.body)
      expect(data[0].balance).toBeCloseTo(5012.50, 2)

      // Update again - still should get interest (depends on days value)
      // In real scenario, days would auto-update, but in test it's static
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      data = JSON.parse(response.body)
      // Compounds on 5012.50
      expect(data[0].balance).toBeGreaterThan(5012.50)
    })

    test('Scenario 10.5: Multiple deposits with varied operations', async () => {
      // Create 5 deposits with different characteristics
      const d1 = await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      const d2 = await repository.create({ planType: 'student', days: 100, balance: 2000 })
      const d3 = await repository.create({ planType: 'premium', days: 60, balance: 3000 })
      const d4 = await repository.create({ planType: 'basic', days: 30, balance: 4000 }) // No interest
      const d5 = await repository.create({ planType: 'premium', days: 45, balance: 5000 }) // No interest

      // Add withdrawals to some
      await repository.addWithdrawal({
        timeDepositId: d1.id,
        amount: 100,
        date: new Date('2024-01-15'),
      })
      await repository.addWithdrawal({
        timeDepositId: d3.id,
        amount: 500,
        date: new Date('2024-02-15'),
      })

      // Initial state check
      let response = await server.inject({ method: 'GET', url: '/time-deposits' })
      let data = JSON.parse(response.body)
      expect(data).toHaveLength(5)

      // Update balances
      response = await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      expect(JSON.parse(response.body).updated).toBe(5)

      // Verify final state
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      data = JSON.parse(response.body)

      // d1: 900 (after withdrawal) + interest
      expect(data.find((d: any) => d.id === d1.id).balance).toBeGreaterThan(900)
      
      // d2: 2000 + interest
      expect(data.find((d: any) => d.id === d2.id).balance).toBeGreaterThan(2000)
      
      // d3: 2500 (after withdrawal) + interest
      expect(data.find((d: any) => d.id === d3.id).balance).toBeGreaterThan(2500)
      
      // d4: 4000 (no interest, day 30)
      expect(data.find((d: any) => d.id === d4.id).balance).toBe(4000)
      
      // d5: 5000 (no interest, premium needs day 46)
      expect(data.find((d: any) => d.id === d5.id).balance).toBe(5000)
    })

    test('Scenario 10.6: Rapid successive operations', async () => {
      const deposit = await repository.create({ 
        planType: 'basic', 
        days: 60, 
        balance: 1000 
      })

      // Perform 10 rapid operations
      for (let i = 0; i < 5; i++) {
        // Apply interest
        await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
        
        // Check balance
        const response = await server.inject({ method: 'GET', url: '/time-deposits' })
        const data = JSON.parse(response.body)
        
        // Balance should be increasing
        expect(data[0].balance).toBeGreaterThan(1000 + i * 0.8)
      }

      // Final balance should reflect 5 compounding updates
      const response = await server.inject({ method: 'GET', url: '/time-deposits' })
      const data = JSON.parse(response.body)
      expect(data[0].balance).toBeGreaterThan(1004)
      expect(data[0].balance).toBeLessThan(1005)
    })

    test('Scenario 10.7: Empty to populated to empty lifecycle', async () => {
      // Start empty
      let response = await server.inject({ method: 'GET', url: '/time-deposits' })
      expect(JSON.parse(response.body)).toHaveLength(0)

      // Populate
      const d1 = await repository.create({ planType: 'basic', days: 60, balance: 1000 })
      const d2 = await repository.create({ planType: 'student', days: 100, balance: 2000 })

      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      expect(JSON.parse(response.body)).toHaveLength(2)

      // Update balances
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      let data = JSON.parse(response.body)
      expect(data).toHaveLength(2)
      expect(data[0].balance).toBeGreaterThan(1000)
      expect(data[1].balance).toBeGreaterThan(2000)

      // Delete all (simulate cleanup)
      await db.delete(schema.timeDeposits)

      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      expect(JSON.parse(response.body)).toHaveLength(0)

      // Update on empty should work
      response = await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })
      expect(JSON.parse(response.body).updated).toBe(0)
    })
  })

  describe('API Contract Validation', () => {
    test('Scenario 10.8: GET response matches OpenAPI schema', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')

      const data = JSON.parse(response.body)
      expect(Array.isArray(data)).toBe(true)
      
      if (data.length > 0) {
        const item = data[0]
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('planType')
        expect(item).toHaveProperty('balance')
        expect(item).toHaveProperty('days')
        expect(item).toHaveProperty('withdrawals')
        expect(['basic', 'student', 'premium']).toContain(item.planType)
      }
    })

    test('Scenario 10.9: POST response matches OpenAPI schema', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      const response = await server.inject({
        method: 'POST',
        url: '/time-deposits/update-balances',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')

      const data = JSON.parse(response.body)
      expect(data).toHaveProperty('updated')
      expect(typeof data.updated).toBe('number')
      expect(Number.isInteger(data.updated)).toBe(true)
      expect(Object.keys(data)).toEqual(['updated'])
    })

    test('Scenario 10.10: Consistent response schemas across operations', async () => {
      await repository.create({ planType: 'basic', days: 60, balance: 1000 })

      // GET response 1
      let response = await server.inject({ method: 'GET', url: '/time-deposits' })
      const schema1 = Object.keys(JSON.parse(response.body)[0]).sort()

      // Update
      await server.inject({ method: 'POST', url: '/time-deposits/update-balances' })

      // GET response 2
      response = await server.inject({ method: 'GET', url: '/time-deposits' })
      const schema2 = Object.keys(JSON.parse(response.body)[0]).sort()

      // Schemas should be identical
      expect(schema1).toEqual(schema2)
    })
  })
})
