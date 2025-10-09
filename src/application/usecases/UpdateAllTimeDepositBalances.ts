import { TimeDepositRepository, CreateInterestApplicationDto } from '../../domain/ports/TimeDepositRepository'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import { TimeDeposit } from '../../TimeDeposit'
import { replayEventsToComputeBalance } from '../../domain/services/EventReplayService'

/**
 * Use Case: Update All Time Deposit Balances
 * 
 * Application layer use case that updates balances for all time deposits.
 * This implements the POST/PUT endpoint requirement (INSTRUCTIONS.md line 11)
 * 
 * Process (Event Sourcing Approach):
 * 1. Fetch all time deposits with their complete event history
 * 2. For each time deposit:
 *    a. Replay events (deposits, withdrawals, interest) to compute CURRENT balance
 *    b. Create TimeDeposit object with computed balance
 *    c. Use TimeDepositCalculator to determine NEW interest amount
 *    d. Record interest as an event (not a direct mutation)
 * 3. Persist interest application events
 * 4. Update stored balances to match replayed state
 * 
 * Why Event Sourcing:
 * - Preserves chronological order of all financial events
 * - Enables accurate balance computation by replaying history
 * - Prevents data inconsistencies from direct mutations
 * - Maintains audit trail of all interest applications
 */
export class UpdateAllTimeDepositBalances {
  constructor(
    private readonly repository: TimeDepositRepository,
    private readonly calculator: TimeDepositCalculator
  ) {}

  async execute(): Promise<{ updated: number }> {
    // 1. Fetch all deposits from database with their complete event history
    const deposits = await this.repository.findAll()

    if (deposits.length === 0) {
      return { updated: 0 }
    }

    // 2. Process each time deposit using event sourcing
    const interestApplications: CreateInterestApplicationDto[] = []
    const balanceUpdates: { id: number; balance: number; days: number }[] = []
    const now = new Date()

    for (const d of deposits) {
      // 2a. Replay all events to compute the CURRENT balance
      const currentBalance = replayEventsToComputeBalance(
        d.deposits,
        d.withdrawals,
        d.interestApplications
      )

      // 2b. Get the first deposit date (earliest) to compute days
      const firstDepositDate = d.deposits.length > 0
        ? d.deposits.reduce((earliest, dep) => {
            return dep.date < earliest ? dep.date : earliest
          }, d.deposits[0].date)
        : new Date()
      
      // Calculate days between today and first deposit date
      const msPerDay = 1000 * 60 * 60 * 24
      const computedDays = Math.floor((now.getTime() - firstDepositDate.getTime()) / msPerDay)
      
      // 2c. Create TimeDeposit object with the CURRENT balance from event replay
      const timeDeposit = new TimeDeposit(d.id, d.planType, currentBalance, Math.max(0, computedDays))

      // Store the original balance before interest calculation
      const balanceBeforeInterest = timeDeposit.balance

      // 2d. Use the existing calculator to compute NEW interest (mutates timeDeposit.balance)
      this.calculator.updateBalance([timeDeposit])

      // Calculate the interest amount that was added
      const interestAmount = timeDeposit.balance - balanceBeforeInterest

      // 2e. If interest was applied, record it as an event
      if (interestAmount > 0) {
        interestApplications.push({
          timeDepositId: d.id,
          amount: interestAmount,
          date: now,
        })
      }

      // Prepare balance update (with the new balance including interest)
      balanceUpdates.push({
        id: timeDeposit.id,
        balance: timeDeposit.balance,
        days: timeDeposit.days,
      })
    }

    // 3. Persist all interest application events
    if (interestApplications.length > 0) {
      await this.repository.addInterestApplications(interestApplications)
    }

    // 4. Update stored balances to match the new state
    await this.repository.updateBalances(balanceUpdates)

    return { updated: balanceUpdates.length }
  }
}
