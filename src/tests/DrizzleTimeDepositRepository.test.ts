import { test, expect, describe, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { eq } from 'drizzle-orm'
import { DrizzleTimeDepositRepository } from '../infrastructure/adapters/DrizzleTimeDepositRepository'
import * as schema from '../infrastructure/database/schema'

/**
 * Repository Integration Tests
 * 
 * These tests verify the database layer works correctly using an in-memory SQLite database.
 * No need for testcontainers since we're using SQLite.
 */

describe('DrizzleTimeDepositRepository', () => {
  let repository: DrizzleTimeDepositRepository
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(async () => {
    // Create fresh in-memory database for each test
    const sqlite = new Database(':memory:', { create: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    
    db = drizzle(sqlite, { schema })
    
    // Run migrations
    await migrate(db, { migrationsFolder: './drizzle/migrations' })
    
    repository = new DrizzleTimeDepositRepository(db)
  })

  describe('create', () => {
    test('should create a new time deposit', async () => {
      const deposit = await repository.create({
        planType: 'basic',
        days: 45,
        balance: 1000,
      })

      expect(deposit.id).toBeGreaterThan(0)
      expect(deposit.planType).toBe('basic')
      expect(deposit.days).toBe(45)
      expect(deposit.balance).toBe(1000)
    })
  })

  describe('findAll', () => {
    test('should return empty array when no deposits exist', async () => {
      const deposits = await repository.findAll()
      expect(deposits).toEqual([])
    })

    test('should return all deposits with their withdrawals', async () => {
      // Create deposits
      const deposit1 = await repository.create({ planType: 'basic', days: 30, balance: 1000 })
      const deposit2 = await repository.create({ planType: 'student', days: 100, balance: 2000 })

      // Add withdrawal to first deposit
      await repository.addWithdrawal({
        timeDepositId: deposit1.id,
        amount: 100,
        date: new Date('2024-01-15'),
      })

      const deposits = await repository.findAll()

      expect(deposits).toHaveLength(2)
      expect(deposits[0].withdrawals).toHaveLength(1)
      expect(deposits[0].withdrawals[0].amount).toBe(100)
      expect(deposits[1].withdrawals).toHaveLength(0)
    })
  })

  describe('findById', () => {
    test('should return null for non-existent deposit', async () => {
      const deposit = await repository.findById(999)
      expect(deposit).toBeNull()
    })

    test('should return deposit with withdrawals', async () => {
      const created = await repository.create({ planType: 'premium', days: 60, balance: 5000 })
      
      await repository.addWithdrawal({
        timeDepositId: created.id,
        amount: 500,
        date: new Date('2024-01-10'),
      })

      const deposit = await repository.findById(created.id)

      expect(deposit).not.toBeNull()
      expect(deposit!.id).toBe(created.id)
      expect(deposit!.planType).toBe('premium')
      expect(deposit!.withdrawals).toHaveLength(1)
      expect(deposit!.withdrawals[0].amount).toBe(500)
    })
  })

  describe('updateBalance', () => {
    test('should update the balance of a deposit', async () => {
      const deposit = await repository.create({ planType: 'basic', days: 45, balance: 1000 })

      await repository.updateBalance(deposit.id, 1050.5)

      const updated = await repository.findById(deposit.id)
      expect(updated!.balance).toBe(1050.5)
    })
  })

  describe('updateBalances', () => {
    test('should update multiple balances in a transaction', async () => {
      const deposit1 = await repository.create({ planType: 'basic', days: 45, balance: 1000 })
      const deposit2 = await repository.create({ planType: 'student', days: 100, balance: 2000 })
      const deposit3 = await repository.create({ planType: 'premium', days: 60, balance: 3000 })

      await repository.updateBalances([
        { id: deposit1.id, balance: 1100 },
        { id: deposit2.id, balance: 2200 },
        { id: deposit3.id, balance: 3300 },
      ])

      const deposits = await repository.findAll()
      expect(deposits[0].balance).toBe(1100)
      expect(deposits[1].balance).toBe(2200)
      expect(deposits[2].balance).toBe(3300)
    })
  })

  describe('addWithdrawal', () => {
    test('should add a withdrawal record', async () => {
      const deposit = await repository.create({ planType: 'basic', days: 45, balance: 1000 })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 250,
        date: new Date('2024-02-20'),
      })

      const updated = await repository.findById(deposit.id)
      expect(updated!.withdrawals).toHaveLength(1)
      expect(updated!.withdrawals[0].amount).toBe(250)
      expect(updated!.withdrawals[0].date.toISOString()).toContain('2024-02-20')
    })

    test('should add multiple withdrawals to the same deposit', async () => {
      const deposit = await repository.create({ planType: 'premium', days: 90, balance: 10000 })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 1000,
        date: new Date('2024-01-01'),
      })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 2000,
        date: new Date('2024-02-01'),
      })

      const updated = await repository.findById(deposit.id)
      expect(updated!.withdrawals).toHaveLength(2)
      expect(updated!.withdrawals[0].amount).toBe(1000)
      expect(updated!.withdrawals[1].amount).toBe(2000)
    })
  })

  describe('Foreign key constraints', () => {
    test('should enforce foreign key on withdrawal (cascade delete)', async () => {
      const deposit = await repository.create({ planType: 'basic', days: 45, balance: 1000 })

      await repository.addWithdrawal({
        timeDepositId: deposit.id,
        amount: 100,
        date: new Date(),
      })

      // Delete the deposit - withdrawals should cascade delete
      await db.delete(schema.timeDeposits).where(eq(schema.timeDeposits.id, deposit.id))

      // Verify withdrawal was also deleted
      const allWithdrawals = await db.select().from(schema.withdrawals)
      expect(allWithdrawals).toHaveLength(0)
    })
  })
})
