import { TimeDepositRepository, CreateInterestApplicationDto } from '../../domain/ports/TimeDepositRepository'
import { TimeDeposit } from '../../TimeDeposit'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import { replayEventsToComputeBalance } from '../../domain/services/EventReplayService'
import { calculateDaysBetween, findEarliestDate } from '../../utils/date'

/**
 * Use Case: Update All Time Deposits Balances
 * 
 * Orchestrates interest calculation using event sourcing: fetches deposits, computes
 * current balance from event history, applies interest via TimeDepositCalculator,
 * and persists both balance updates and interest events for complete audit trail.
 * 
 * Implements POST /time-deposits/update-balances (INSTRUCTIONS.md line 11).
 */
export class UpdateAllTimeDepositBalances {
  constructor(
    private readonly repository: TimeDepositRepository,
    private readonly calculator: TimeDepositCalculator
  ) {}

  async execute(): Promise<{ updated: number }> {
    const deposits = await this.repository.findAll()

    if (deposits.length === 0) {
      return { updated: 0 }
    }

    const interestApplications: CreateInterestApplicationDto[] = []
    const balanceUpdates: { id: number; balance: number; days: number }[] = []
    const now = new Date()

    for (const d of deposits) {
      const currentBalance = replayEventsToComputeBalance(
        d.deposits,
        d.withdrawals,
        d.interestApplications
      )

      const depositDates = d.deposits.map(dep => dep.date)
      const firstDepositDate = findEarliestDate(depositDates) || now
      const computedDays = calculateDaysBetween(firstDepositDate, now)
      const timeDeposit = new TimeDeposit(d.id, d.planType, currentBalance, Math.max(0, computedDays))

      const balanceBeforeInterest = timeDeposit.balance

      this.calculator.updateBalance([timeDeposit])

      const interestAmount = timeDeposit.balance - balanceBeforeInterest

      if (interestAmount > 0) {
        interestApplications.push({
          timeDepositId: d.id,
          amount: interestAmount,
          date: now,
        })
      }

      balanceUpdates.push({
        id: timeDeposit.id,
        balance: timeDeposit.balance,
        days: timeDeposit.days,
      })
    }

    if (interestApplications.length > 0) {
      await this.repository.addInterestApplications(interestApplications)
    }

    await this.repository.updateBalances(balanceUpdates)

    return { updated: balanceUpdates.length }
  }
}
