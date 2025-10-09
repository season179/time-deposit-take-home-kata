import {
  DepositDto,
  WithdrawalDto,
  InterestApplicationDto,
} from '../ports/TimeDepositRepository'
import { roundToTwoDecimals } from '../../utils/math'

/**
 * Event Replay Service
 * 
 * Replays deposit, withdrawal, and interest events in chronological order to compute
 * accurate balances. Event order is critical: the same events in different order
 * produce different results (e.g., deposit → interest → withdrawal ≠ deposit → withdrawal → interest).
 */

type TimeDepositEvent = {
  type: 'deposit' | 'withdrawal' | 'interest'
  amount: number
  date: Date
}

export function replayEventsToComputeBalance(
  deposits: DepositDto[],
  withdrawals: WithdrawalDto[],
  interestApplications: InterestApplicationDto[]
): number {
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

  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime())

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

  return roundToTwoDecimals(balance)
}

export function getInitialDepositAmount(deposits: DepositDto[]): number {
  if (deposits.length === 0) return 0
  const sortedDeposits = [...deposits].sort((a, b) => a.date.getTime() - b.date.getTime())
  return sortedDeposits[0].amount
}
