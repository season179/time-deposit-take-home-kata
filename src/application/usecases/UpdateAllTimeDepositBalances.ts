import { TimeDepositRepository, CreateInterestApplicationDto, InterestApplicationDto } from '../../domain/ports/TimeDepositRepository'
import { TimeDeposit } from '../../TimeDeposit'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import { replayEventsToComputeBalance } from '../../domain/services/EventReplayService'
import { calculateDaysBetween, findEarliestDate } from '../../utils/date'

/**
 * Helper: Check if interest was already applied today
 * 
 * This ensures idempotency - prevents duplicate interest applications
 * when the endpoint is called multiple times on the same day.
 * 
 * @param interestApplications - Array of historical interest applications
 * @param referenceDate - The date to check against (typically current date)
 * @returns true if interest was already applied on the reference date
 */
function hasInterestAppliedToday(
  interestApplications: InterestApplicationDto[],
  referenceDate: Date
): boolean {
  // Get start of day for the reference date (00:00:00)
  const dayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  )
  
  // Get end of day (23:59:59.999)
  const dayEnd = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    23, 59, 59, 999
  )
  
  // Check if any interest application falls within today's date range
  return interestApplications.some(
    (ia) => ia.date >= dayStart && ia.date <= dayEnd
  )
}

/**
 * Use Case: Update All Time Deposits Balances
 * 
 * Orchestrates interest calculation using event sourcing: fetches deposits, computes
 * current balance from event history, applies interest via TimeDepositCalculator,
 * and persists both balance updates and interest events for complete audit trail.
 * 
 * Implements POST /time-deposits/update-balances (INSTRUCTIONS.md line 11).
 * 
 * **Idempotency:** Prevents duplicate interest applications by checking if interest
 * was already applied today. Multiple calls on the same day are safe and will not
 * result in duplicate interest credits.
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
      // IDEMPOTENCY CHECK: Skip if interest was already applied today
      if (hasInterestAppliedToday(d.interestApplications, now)) {
        // Still need to include in balanceUpdates for consistency
        const currentBalance = replayEventsToComputeBalance(
          d.deposits,
          d.withdrawals,
          d.interestApplications
        )
        
        const depositDates = d.deposits.map(dep => dep.date)
        const firstDepositDate = findEarliestDate(depositDates) || now
        const computedDays = calculateDaysBetween(firstDepositDate, now)
        
        balanceUpdates.push({
          id: d.id,
          balance: currentBalance,
          days: Math.max(0, computedDays),
        })
        
        continue // Skip interest calculation
      }
      
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
