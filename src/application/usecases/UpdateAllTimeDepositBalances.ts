import { TimeDepositRepository, CreateInterestApplicationDto, InterestApplicationDto } from '../../domain/ports/TimeDepositRepository'
import { TimeDeposit } from '../../TimeDeposit'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import { replayEventsToComputeBalance } from '../../domain/services/EventReplayService'
import { calculateDaysBetween, findEarliestDate } from '../../utils/date'
import { roundToTwoDecimals } from '../../utils/math'

/**
 * Helper: Get the date of the last interest application
 * 
 * @param interestApplications - Array of historical interest applications
 * @returns Date of last interest application, or null if none exist
 */
function getLastInterestDate(
  interestApplications: InterestApplicationDto[]
): Date | null {
  if (interestApplications.length === 0) {
    return null
  }
  
  // Sort by date descending and get the most recent
  const sorted = [...interestApplications].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  )
  
  return sorted[0].date
}

/**
 * Helper: Calculate prorated interest based on days elapsed
 * 
 * Uses daily interest rate formula: (annualRate / 365) × days
 * This ensures interest is proportional to actual time elapsed.
 * 
 * @param balance - Current balance to calculate interest on
 * @param annualRate - Annual interest rate (e.g., 0.01 for 1%)
 * @param daysElapsed - Number of days since last interest or opening
 * @returns Calculated interest amount, rounded to 2 decimals
 */
function calculateProratedInterest(
  balance: number,
  annualRate: number,
  daysElapsed: number
): number {
  const dailyRate = annualRate / 365
  const interest = balance * dailyRate * daysElapsed
  return roundToTwoDecimals(interest)
}

/**
 * Helper: Get annual interest rate for a plan type
 * 
 * @param planType - The time deposit plan type
 * @returns Annual interest rate as decimal (e.g., 0.01 for 1%)
 */
function getAnnualRate(planType: 'basic' | 'student' | 'premium'): number {
  switch (planType) {
    case 'basic':
      return 0.01
    case 'student':
      return 0.03
    case 'premium':
      return 0.05
    default:
      return 0
  }
}

/**
 * Use Case: Update All Time Deposits Balances
 * 
 * Orchestrates interest calculation using event sourcing: fetches deposits, computes
 * current balance from event history, applies prorated interest based on days elapsed,
 * and persists both balance updates and interest events for complete audit trail.
 * 
 * Implements POST /time-deposits/update-balances (INSTRUCTIONS.md line 11).
 * 
 * **Interest Calculation:** Uses daily interest rate (annualRate / 365) multiplied
 * by days elapsed since last interest application. This ensures interest is proportional
 * to actual time elapsed, preventing exploitation from frequent endpoint calls.
 * 
 * **Idempotency:** Calling multiple times per day is safe - interest is calculated
 * based on days elapsed, so multiple calls on the same day result in 0 additional interest.
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
      // Replay events to get current balance
      const currentBalance = replayEventsToComputeBalance(
        d.deposits,
        d.withdrawals,
        d.interestApplications
      )
      
      const depositDates = d.deposits.map(dep => dep.date)
      const firstDepositDate = findEarliestDate(depositDates) || now
      const totalDays = calculateDaysBetween(firstDepositDate, now)
      
      // Determine the reference date for days calculation
      // (last interest date or opening date)
      const lastInterestDate = getLastInterestDate(d.interestApplications)
      const referenceDate = lastInterestDate || firstDepositDate
      const daysSinceLastInterest = calculateDaysBetween(referenceDate, now)
      
      // Check if account is eligible for interest based on grace periods
      let isEligible = false
      
      if (d.planType === 'basic') {
        // Basic: requires > 30 days total
        isEligible = totalDays > 30
      } else if (d.planType === 'student') {
        // Student: requires > 30 days total, stops after 365 days
        isEligible = totalDays > 30 && totalDays <= 365
      } else if (d.planType === 'premium') {
        // Premium: requires > 45 days total
        isEligible = totalDays > 45
      }
      
      let interestAmount = 0
      
      // Calculate prorated interest if eligible and days have elapsed
      if (isEligible && daysSinceLastInterest > 0) {
        const annualRate = getAnnualRate(d.planType as 'basic' | 'student' | 'premium')
        interestAmount = calculateProratedInterest(
          currentBalance,
          annualRate,
          daysSinceLastInterest
        )
      }
      
      // Record interest application if amount > 0
      if (interestAmount > 0) {
        interestApplications.push({
          timeDepositId: d.id,
          amount: interestAmount,
          date: now,
        })
      }
      
      // Update balance with interest
      const newBalance = currentBalance + interestAmount
      
      balanceUpdates.push({
        id: d.id,
        balance: newBalance,
        days: Math.max(0, totalDays),
      })
    }

    if (interestApplications.length > 0) {
      await this.repository.addInterestApplications(interestApplications)
    }

    await this.repository.updateBalances(balanceUpdates)

    return { updated: balanceUpdates.length }
  }
}
