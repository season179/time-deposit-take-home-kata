import { TimeDepositRepository } from '../../domain/ports/TimeDepositRepository'
import { TimeDepositCalculator } from '../../TimeDepositCalculator'
import { TimeDeposit } from '../../TimeDeposit'

/**
 * Use Case: Update All Time Deposit Balances
 * 
 * Application layer use case that updates balances for all time deposits.
 * This implements the POST/PUT endpoint requirement (INSTRUCTIONS.md line 11)
 * 
 * Process:
 * 1. Fetch all time deposits from repository
 * 2. Convert to TimeDeposit domain objects
 * 3. Use TimeDepositCalculator to update balances (CRITICAL: must not break existing logic)
 * 4. Persist updated balances back to database
 * 
 * This orchestration ensures we leverage the existing TimeDepositCalculator
 * without breaking changes while adding persistence.
 */
export class UpdateAllTimeDepositBalances {
  constructor(
    private readonly repository: TimeDepositRepository,
    private readonly calculator: TimeDepositCalculator
  ) {}

  async execute(): Promise<{ updated: number }> {
    // 1. Fetch all deposits from database
    const deposits = await this.repository.findAll()

    if (deposits.length === 0) {
      return { updated: 0 }
    }

    // 2. Convert to TimeDeposit domain objects
    // Compute days from the first deposit date for each time deposit
    const timeDeposits = deposits.map((d) => {
      // Get the first deposit date (earliest)
      const firstDepositDate = d.deposits.length > 0
        ? d.deposits.reduce((earliest, dep) => {
            return dep.date < earliest ? dep.date : earliest
          }, d.deposits[0].date)
        : new Date()
      
      // Calculate days between today and first deposit date
      const today = new Date()
      const msPerDay = 1000 * 60 * 60 * 24
      const computedDays = Math.floor((today.getTime() - firstDepositDate.getTime()) / msPerDay)
      
      return new TimeDeposit(d.id, d.planType, d.balance, Math.max(0, computedDays))
    })

    // 3. Update balances using the existing calculator (preserves existing behavior)
    this.calculator.updateBalance(timeDeposits)

    // 4. Prepare updates for persistence (including computed days)
    const updates = timeDeposits.map((td) => ({
      id: td.id,
      balance: td.balance,
      days: td.days,
    }))

    // 5. Persist updates to database
    await this.repository.updateBalances(updates)

    return { updated: updates.length }
  }
}
