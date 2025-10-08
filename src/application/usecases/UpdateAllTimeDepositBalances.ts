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
    const timeDeposits = deposits.map(
      (d) => new TimeDeposit(d.id, d.planType, d.balance, d.days)
    )

    // 3. Update balances using the existing calculator (preserves existing behavior)
    this.calculator.updateBalance(timeDeposits)

    // 4. Prepare updates for persistence
    const updates = timeDeposits.map((td) => ({
      id: td.id,
      balance: td.balance,
    }))

    // 5. Persist updates to database
    await this.repository.updateBalances(updates)

    return { updated: updates.length }
  }
}
