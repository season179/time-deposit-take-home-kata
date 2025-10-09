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
 * Integration Tests: GET /time-deposits
 * 
 * Category 1: Data Retrieval Tests
 * Tests the endpoint that retrieves all time deposits with withdrawal history
 */

describe('GET /time-deposits - Data Retrieval', () => {
  let server: FastifyInstance
  let repository: DrizzleTimeDepositRepository
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(async () => {
    // Setup in-memory database
    const sqlite = new Database(':memory:', { create: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder: './drizzle/migrations' })
    
    // Setup repository and use cases
    repository = new DrizzleTimeDepositRepository(db)
    const calculator = new TimeDepositCalculator()
    const getAllTimeDeposits = new GetAllTimeDeposits(repository)
    const updateAllTimeDepositBalances = new UpdateAllTimeDepositBalances(repository, calculator)

    // Setup server
    server = await createServer()
    await server.register(timeDepositRoutes, {
      getAllTimeDeposits,
      updateAllTimeDepositBalances,
    })
  })

  afterEach(async () => {
    await server.close()
  })

  describe('Scenario 1.1: Happy Path - Retrieve All Deposits', () => {
    test('should return all deposits with correct schema', async () => {
      // Setup: Create 6 deposits (2 basic, 2 student, 2 premium)
      await repository.create({ planType: 'basic', days: 45, balance: 1000 })
      await repository.create({ planType: 'basic', days: 60, balance: 2000 })
      await repository.create({ planType: 'student', days: 100, balance: 3000 })
      await repository.create({ planType: 'student', days: 200, balance: 4000 })
      await repository.create({ planType: 'premium', days: 50, balance: 5000 })
      await repository.create({ planType: 'premium', days: 70, balance: 6000 })

      // Action
      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      // Assertions
      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(Array.isArray(data)).toBe(true)
      expect(data).toHaveLength(6)

      // Verify each item has required fields
      data.forEach((item: any) => {
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('planType')
        expect(item).toHaveProperty('balance')
        expect(item).toHaveProperty('days')
        expect(item).toHaveProperty('withdrawals')
        expect(typeof item.id).toBe('number')
        expect(typeof item.planType).toBe('string')
        expect(typeof item.balance).toBe('number')
        expect(typeof item.days).toBe('number')
        expect(Array.isArray(item.withdrawals)).toBe(true)
      })
    })
  })

  describe('Scenario 1.2: Empty Database', () => {
    test('should return empty array when no deposits exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data).toEqual([])
    })
  })

  describe('Scenario 1.3: Deposits Without Withdrawals', () => {
    test('should return deposits with empty withdrawals array', async () => {
      await repository.create({ planType: 'basic', days: 30, balance: 1000 })
      await repository.create({ planType: 'student', days: 100, balance: 2000 })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data).toHaveLength(2)
      expect(data[0].withdrawals).toEqual([])
      expect(data[1].withdrawals).toEqual([])
    })
  })

  describe('Scenario 1.4: Deposits With Multiple Withdrawals', () => {
    test('should return deposits with complete withdrawal history', async () => {
      const deposit = await repository.create({ planType: 'premium', days: 60, balance: 10000 })

      // Add 3 withdrawals at different dates
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 500,
        date: new Date('2024-01-15'),
      })
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date('2024-02-20'),
      })
      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 250,
        date: new Date('2024-03-10'),
      })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data).toHaveLength(1)
      expect(data[0].withdrawals).toHaveLength(3)

      // Verify each withdrawal has required fields
      data[0].withdrawals.forEach((w: any) => {
        expect(w).toHaveProperty('id')
        expect(w).toHaveProperty('timeDepositId')
        expect(w).toHaveProperty('amount')
        expect(w).toHaveProperty('date')
        expect(typeof w.id).toBe('number')
        expect(typeof w.timeDepositId).toBe('number')
        expect(typeof w.amount).toBe('number')
        expect(typeof w.date).toBe('string')
      })

      // Verify specific amounts
      const amounts = data[0].withdrawals.map((w: any) => w.amount)
      expect(amounts).toContain(500)
      expect(amounts).toContain(1000)
      expect(amounts).toContain(250)
    })
  })

  describe('Scenario 1.5: Days Calculation Accuracy', () => {
    test('should calculate days correctly from deposit date', async () => {
      // Create deposit with known days value
      await repository.create({ 
        planType: 'basic', 
        days: 100, 
        balance: 1000 
      })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data).toHaveLength(1)
      
      // Days should be approximately 100 (allowing for timing variance)
      // Since the repository creates deposit records with date = today - days
      expect(data[0].days).toBeGreaterThanOrEqual(99)
      expect(data[0].days).toBeLessThanOrEqual(101)
    })
  })

  describe('Scenario 1.6: Mixed Plan Types', () => {
    test('should handle all three plan types correctly', async () => {
      await repository.create({ planType: 'basic', days: 45, balance: 1000 })
      await repository.create({ planType: 'student', days: 100, balance: 2000 })
      await repository.create({ planType: 'premium', days: 60, balance: 3000 })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data).toHaveLength(3)

      const planTypes = data.map((d: any) => d.planType)
      expect(planTypes).toContain('basic')
      expect(planTypes).toContain('student')
      expect(planTypes).toContain('premium')

      // Verify plan types are exact matches
      expect(data.find((d: any) => d.planType === 'basic').planType).toBe('basic')
      expect(data.find((d: any) => d.planType === 'student').planType).toBe('student')
      expect(data.find((d: any) => d.planType === 'premium').planType).toBe('premium')
    })
  })

  describe('Scenario 1.7: Balance Integrity', () => {
    test('should return correct balance values', async () => {
      await repository.create({ planType: 'basic', days: 45, balance: 1234.56 })
      await repository.create({ planType: 'student', days: 100, balance: 9999.99 })

      const response = await server.inject({
        method: 'GET',
        url: '/time-deposits',
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.body)
      expect(data).toHaveLength(2)
      
      // Balances should match exactly what was stored
      const balances = data.map((d: any) => d.balance).sort()
      expect(balances[0]).toBe(1234.56)
      expect(balances[1]).toBe(9999.99)
    })
  })
})
