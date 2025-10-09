import {
  DepositDto,
  WithdrawalDto,
  InterestApplicationDto,
} from '../ports/TimeDepositRepository'

/**
 * Event Replay Service
 * 
 * Core domain service for event sourcing.
 * Replays deposit, withdrawal, and interest application events in chronological order
 * to compute the accurate current balance.
 * 
 * Event order matters significantly for balance computation:
 * Example: $1000 deposit → apply $10 interest → withdraw $500 = $510
 *          $1000 deposit → withdraw $500 → apply $5 interest = $505
 * 
 * This service ensures we maintain data integrity by computing balances from events
 * rather than storing a mutable balance that could get out of sync.
 */

/**
 * Unified event type for chronological replay
 */
type TimeDepositEvent = {
  type: 'deposit' | 'withdrawal' | 'interest'
  amount: number
  date: Date
}

/**
 * Compute the current balance by replaying all events in chronological order.
 * 
 * Algorithm:
 * 1. Merge all event types (deposits, withdrawals, interest) into a single list
 * 2. Sort by timestamp (ascending - oldest first)
 * 3. Replay events sequentially:
 *    - Deposits: add to balance
 *    - Interest: add to balance
 *    - Withdrawals: subtract from balance
 * 4. Return final balance
 * 
 * @param deposits - All deposit events for this time deposit
 * @param withdrawals - All withdrawal events for this time deposit
 * @param interestApplications - All interest application events for this time deposit
 * @returns The computed balance after replaying all events
 */
export function replayEventsToComputeBalance(
  deposits: DepositDto[],
  withdrawals: WithdrawalDto[],
  interestApplications: InterestApplicationDto[]
): number {
  // Step 1: Convert all event types to a unified format
  const allEvents: TimeDepositEvent[] = [
    ...deposits.map((d) => ({
      type: 'deposit' as const,
      amount: d.amount,
      date: d.date,
    })),
    ...withdrawals.map((w) => ({
      type: 'withdrawal' as const,
      amount: w.amount,
      date: w.date,
    })),
    ...interestApplications.map((i) => ({
      type: 'interest' as const,
      amount: i.amount,
      date: i.date,
    })),
  ]

  // Step 2: Sort events by timestamp (oldest first)
  // This ensures we replay events in the exact order they occurred
  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime())

  // Step 3: Replay events sequentially to compute balance
  let balance = 0

  for (const event of allEvents) {
    switch (event.type) {
      case 'deposit':
        balance += event.amount
        break
      case 'interest':
        balance += event.amount
        break
      case 'withdrawal':
        balance -= event.amount
        break
    }
  }

  // Step 4: Round to 2 decimal places to handle floating point precision
  return Math.round((balance + Number.EPSILON) * 100) / 100
}

/**
 * Compute the initial deposit amount (the first deposit in the timeline).
 * This is useful for certain interest calculations that need the original principal.
 * 
 * @param deposits - All deposit events for this time deposit
 * @returns The amount of the first deposit, or 0 if no deposits exist
 */
export function getInitialDepositAmount(deposits: DepositDto[]): number {
  if (deposits.length === 0) return 0

  // Find the earliest deposit
  const sortedDeposits = [...deposits].sort((a, b) => a.date.getTime() - b.date.getTime())
  return sortedDeposits[0].amount
}
