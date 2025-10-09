import { eq } from 'drizzle-orm'
import { TimeDeposit } from '../../TimeDeposit'
import {
  TimeDepositRepository,
  TimeDepositWithWithdrawals,
  CreateTimeDepositDto,
  CreateWithdrawalDto,
  WithdrawalDto,
} from '../../domain/ports/TimeDepositRepository'
import { DrizzleDatabase } from '../database/connection'
import { timeDeposits, deposits, withdrawals } from '../database/schema'

/**
 * Drizzle ORM Implementation of TimeDepositRepository
 * 
 * This is the infrastructure adapter that implements the domain port.
 * It translates domain operations into database queries using Drizzle ORM.
 * 
 * Benefits:
 * - Type-safe queries
 * - Clean separation of concerns (hexagonal architecture)
 * - Easy to swap with a different implementation (e.g., different ORM, in-memory for testing)
 */
export class DrizzleTimeDepositRepository implements TimeDepositRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  async findAll(): Promise<TimeDepositWithWithdrawals[]> {
    // Fetch all time deposits with their deposits and withdrawals
    const timeDepositRecords = await this.db.query.timeDeposits.findMany({
      with: {
        deposits: true,
        withdrawals: true,
      },
    })

    return timeDepositRecords.map((record) => this.mapToTimeDepositWithWithdrawals(record))
  }

  async findById(id: number): Promise<TimeDepositWithWithdrawals | null> {
    const record = await this.db.query.timeDeposits.findFirst({
      where: eq(timeDeposits.id, id),
      with: {
        deposits: true,
        withdrawals: true,
      },
    })

    return record ? this.mapToTimeDepositWithWithdrawals(record) : null
  }

  async create(dto: CreateTimeDepositDto): Promise<TimeDeposit> {
    const today = new Date()
    const msPerDay = 1000 * 60 * 60 * 24
    
    // Determine opening date:
    // 1. If openingDate is provided, use it
    // 2. Otherwise, compute from days: openingDate = today - days
    let openingDate: Date
    if (dto.openingDate) {
      openingDate = dto.openingDate
    } else {
      // Use the legacy days field to compute opening date
      openingDate = new Date(today)
      openingDate.setDate(openingDate.getDate() - dto.days)
    }
    
    // Create both time deposit and initial deposit in a transaction
    const result = await this.db.transaction(async (tx) => {
      // Insert time deposit record
      const tdResult = await tx
        .insert(timeDeposits)
        .values({
          planType: dto.planType,
          days: dto.days, // Store the provided days value
          balance: dto.balance,
        })
        .returning()
      
      const inserted = tdResult[0]
      
      // Insert initial deposit record with computed opening date
      await tx.insert(deposits).values({
        timeDepositId: inserted.id,
        amount: dto.balance,
        date: openingDate,
      })
      
      return inserted
    })

    return new TimeDeposit(result.id, result.planType, result.balance, result.days)
  }

  async updateBalance(id: number, newBalance: number): Promise<void> {
    await this.db.update(timeDeposits).set({ balance: newBalance }).where(eq(timeDeposits.id, id))
  }

  async updateBalances(updates: { id: number; balance: number }[]): Promise<void> {
    // Perform bulk updates in a transaction for atomicity
    await this.db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(timeDeposits)
          .set({ balance: update.balance })
          .where(eq(timeDeposits.id, update.id))
      }
    })
  }

  async addWithdrawal(dto: CreateWithdrawalDto): Promise<void> {
    // Insert withdrawal and decrement balance atomically in a transaction
    await this.db.transaction(async (tx) => {
      // Insert withdrawal record
      await tx.insert(withdrawals).values({
        timeDepositId: dto.timeDepositId,
        amount: dto.amount,
        date: dto.date,
      })
      
      // Decrement the stored balance
      const currentRecord = await tx.query.timeDeposits.findFirst({
        where: eq(timeDeposits.id, dto.timeDepositId),
      })
      
      if (currentRecord) {
        await tx
          .update(timeDeposits)
          .set({ balance: currentRecord.balance - dto.amount })
          .where(eq(timeDeposits.id, dto.timeDepositId))
      }
    })
  }

  /**
   * Helper method to compute days elapsed since the earliest deposit.
   * Days = floor((today - earliestDepositDate) / 1 day)
   */
  private computeDays(depositRecords: any[]): number {
    if (depositRecords.length === 0) {
      return 0 // No deposits means 0 days
    }

    // Find the earliest deposit date
    const earliestDate = depositRecords.reduce((earliest, d) => {
      const depositDate = new Date(d.date)
      return depositDate < earliest ? depositDate : earliest
    }, new Date(depositRecords[0].date))

    // Calculate days elapsed from earliest deposit to today
    const today = new Date()
    const msPerDay = 1000 * 60 * 60 * 24
    const daysDiff = Math.floor((today.getTime() - earliestDate.getTime()) / msPerDay)
    
    return Math.max(0, daysDiff) // Ensure non-negative
  }

  /**
   * Helper method to map database records to domain DTOs.
   * Computes days from the earliest deposit date instead of using stored days.
   */
  private mapToTimeDepositWithWithdrawals(
    record: any // Drizzle's inferred type with relations
  ): TimeDepositWithWithdrawals {
    // Compute days from earliest deposit date
    const days = this.computeDays(record.deposits || [])

    return {
      id: record.id,
      planType: record.planType,
      balance: record.balance, // Stored balance is the running total
      days, // Computed from deposits
      withdrawals: (record.withdrawals || []).map(
        (w: any): WithdrawalDto => ({
          id: w.id,
          timeDepositId: w.timeDepositId,
          amount: w.amount,
          date: new Date(w.date), // Convert Unix timestamp to Date
        })
      ),
    }
  }
}
