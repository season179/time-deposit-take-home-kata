import { eq } from 'drizzle-orm'
import { TimeDeposit } from '../../TimeDeposit'
import {
  TimeDepositRepository,
  TimeDepositWithWithdrawals,
  CreateTimeDepositDto,
  CreateWithdrawalDto,
  CreateInterestApplicationDto,
  WithdrawalDto,
  DepositDto,
  InterestApplicationDto,
} from '../../domain/ports/TimeDepositRepository'
import { DrizzleDatabase } from '../database/connection'
import { timeDeposits, deposits, withdrawals, interestApplications } from '../database/schema'
import { MS_PER_DAY } from '../../utils/constants'
import { calculateDaysBetween, findEarliestDate } from '../../utils/date'

/**
 * Drizzle ORM implementation of TimeDepositRepository (infrastructure adapter)
 */
export class DrizzleTimeDepositRepository implements TimeDepositRepository {
  constructor(public readonly db: DrizzleDatabase) {}

  async findAll(): Promise<TimeDepositWithWithdrawals[]> {
    const timeDepositRecords = await this.db.query.timeDeposits.findMany({
      with: {
        deposits: true,
        withdrawals: true,
        interestApplications: true,
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
        interestApplications: true,
      },
    })

    return record ? this.mapToTimeDepositWithWithdrawals(record) : null
  }

  async create(dto: CreateTimeDepositDto): Promise<TimeDeposit> {
    const today = new Date()
    
    let openingDate: Date
    if (dto.openingDate) {
      openingDate = dto.openingDate
    } else {
      const msToSubtract = dto.days * MS_PER_DAY
      openingDate = new Date(today.getTime() - msToSubtract)
    }
    
    const result = await this.db.transaction(async (tx) => {
      const tdResult = await tx
        .insert(timeDeposits)
        .values({
          planType: dto.planType,
          days: dto.days, // Store the provided days value
          balance: dto.balance,
        })
        .returning()
      
      const inserted = tdResult[0]
      
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

  async updateBalances(updates: { id: number; balance: number; days: number }[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(timeDeposits)
          .set({ balance: update.balance, days: update.days })
          .where(eq(timeDeposits.id, update.id))
      }
    })
  }

  async addWithdrawal(dto: CreateWithdrawalDto): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(withdrawals).values({
        timeDepositId: dto.timeDepositId,
        amount: dto.amount,
        date: dto.date,
      })
      
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

  async addInterestApplication(dto: CreateInterestApplicationDto): Promise<void> {
    await this.db.insert(interestApplications).values({
      timeDepositId: dto.timeDepositId,
      amount: dto.amount,
      date: dto.date,
    })
  }

  async addInterestApplications(dtos: CreateInterestApplicationDto[]): Promise<void> {
    if (dtos.length === 0) return
    
    await this.db.insert(interestApplications).values(
      dtos.map((dto) => ({
        timeDepositId: dto.timeDepositId,
        amount: dto.amount,
        date: dto.date,
      }))
    )
  }

  private computeDays(depositRecords: any[]): number {
    if (depositRecords.length === 0) {
      return 0
    }

    const depositDates = depositRecords.map(d => new Date(d.date))
    const earliestDate = findEarliestDate(depositDates)
    
    if (!earliestDate) return 0
    
    return calculateDaysBetween(earliestDate)
  }

  private mapToTimeDepositWithWithdrawals(
    record: any
  ): TimeDepositWithWithdrawals {
    const days = this.computeDays(record.deposits || [])

    return {
      id: record.id,
      planType: record.planType,
      balance: record.balance,
      days,
      withdrawals: (record.withdrawals || []).map(
        (w: any): WithdrawalDto => ({
          id: w.id,
          timeDepositId: w.timeDepositId,
          amount: w.amount,
          date: new Date(w.date),
        })
      ),
      deposits: (record.deposits || []).map(
        (d: any): DepositDto => ({
          id: d.id,
          timeDepositId: d.timeDepositId,
          amount: d.amount,
          date: new Date(d.date),
        })
      ),
      interestApplications: (record.interestApplications || []).map(
        (i: any): InterestApplicationDto => ({
          id: i.id,
          timeDepositId: i.timeDepositId,
          amount: i.amount,
          date: new Date(i.date),
        })
      ),
    }
  }
}
