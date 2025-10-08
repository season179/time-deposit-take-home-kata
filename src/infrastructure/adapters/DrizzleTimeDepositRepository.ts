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
import { timeDeposits, withdrawals } from '../database/schema'

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
    // Fetch all time deposits with their withdrawals using a relational query
    const deposits = await this.db.query.timeDeposits.findMany({
      with: {
        withdrawals: true,
      },
    })

    return deposits.map(this.mapToTimeDepositWithWithdrawals)
  }

  async findById(id: number): Promise<TimeDepositWithWithdrawals | null> {
    const deposit = await this.db.query.timeDeposits.findFirst({
      where: eq(timeDeposits.id, id),
      with: {
        withdrawals: true,
      },
    })

    return deposit ? this.mapToTimeDepositWithWithdrawals(deposit) : null
  }

  async create(dto: CreateTimeDepositDto): Promise<TimeDeposit> {
    const result = await this.db
      .insert(timeDeposits)
      .values({
        planType: dto.planType,
        days: dto.days,
        balance: dto.balance,
      })
      .returning()

    const inserted = result[0]
    return new TimeDeposit(inserted.id, inserted.planType, inserted.balance, inserted.days)
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
    await this.db.insert(withdrawals).values({
      timeDepositId: dto.timeDepositId,
      amount: dto.amount,
      date: dto.date,
    })
  }

  /**
   * Helper method to map database records to domain DTOs
   */
  private mapToTimeDepositWithWithdrawals(
    deposit: any // Drizzle's inferred type with relations
  ): TimeDepositWithWithdrawals {
    return {
      id: deposit.id,
      planType: deposit.planType,
      balance: deposit.balance,
      days: deposit.days,
      withdrawals: deposit.withdrawals.map(
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
