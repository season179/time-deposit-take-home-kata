import { test, expect, describe } from 'bun:test'
import { replayEventsToComputeBalance } from '../domain/services/EventReplayService'
import { DepositDto, WithdrawalDto, InterestApplicationDto } from '../domain/ports/TimeDepositRepository'

describe('EventReplayService', () => {
  describe('replayEventsToComputeBalance', () => {
    test('should compute balance from deposits only', () => {
      const deposits: DepositDto[] = [
        { id: 1, timeDepositId: 1, amount: 1000, date: new Date('2024-01-01') },
        { id: 2, timeDepositId: 1, amount: 500, date: new Date('2024-02-01') },
      ]
      const withdrawals: WithdrawalDto[] = []
      const interestApplications: InterestApplicationDto[] = []

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      expect(balance).toBe(1500)
    })

    test('should compute balance from deposits and withdrawals', () => {
      const deposits: DepositDto[] = [
        { id: 1, timeDepositId: 1, amount: 1000, date: new Date('2024-01-01') },
      ]
      const withdrawals: WithdrawalDto[] = [
        { id: 1, timeDepositId: 1, amount: 300, date: new Date('2024-02-01') },
      ]
      const interestApplications: InterestApplicationDto[] = []

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      expect(balance).toBe(700)
    })

    test('should compute balance with interest applications', () => {
      const deposits: DepositDto[] = [
        { id: 1, timeDepositId: 1, amount: 1000, date: new Date('2024-01-01') },
      ]
      const withdrawals: WithdrawalDto[] = []
      const interestApplications: InterestApplicationDto[] = [
        { id: 1, timeDepositId: 1, amount: 8.33, date: new Date('2024-02-01') },
      ]

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      expect(balance).toBe(1008.33)
    })

    test('CRITICAL: should respect chronological order - deposit then interest then withdrawal', () => {
      const deposits: DepositDto[] = [
        { id: 1, timeDepositId: 1, amount: 1000, date: new Date('2024-01-01T10:00:00') },
      ]
      const interestApplications: InterestApplicationDto[] = [
        { id: 1, timeDepositId: 1, amount: 10, date: new Date('2024-02-01T12:00:00') },
      ]
      const withdrawals: WithdrawalDto[] = [
        { id: 1, timeDepositId: 1, amount: 500, date: new Date('2024-03-01T14:00:00') },
      ]

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      // Order: 1000 (deposit) + 10 (interest) - 500 (withdrawal) = 510
      expect(balance).toBe(510)
    })

    test('CRITICAL: should respect chronological order - deposit then withdrawal then interest', () => {
      const deposits: DepositDto[] = [
        { id: 1, timeDepositId: 1, amount: 1000, date: new Date('2024-01-01T10:00:00') },
      ]
      const withdrawals: WithdrawalDto[] = [
        { id: 1, timeDepositId: 1, amount: 500, date: new Date('2024-02-01T12:00:00') },
      ]
      const interestApplications: InterestApplicationDto[] = [
        { id: 1, timeDepositId: 1, amount: 5, date: new Date('2024-03-01T14:00:00') },
      ]

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      // Order: 1000 (deposit) - 500 (withdrawal) + 5 (interest) = 505
      // Different from previous test because withdrawal happened BEFORE interest
      expect(balance).toBe(505)
    })

    test('should handle complex event sequences', () => {
      const deposits: DepositDto[] = [
        { id: 1, timeDepositId: 1, amount: 1000, date: new Date('2024-01-01') },
        { id: 2, timeDepositId: 1, amount: 200, date: new Date('2024-03-01') },
      ]
      const withdrawals: WithdrawalDto[] = [
        { id: 1, timeDepositId: 1, amount: 300, date: new Date('2024-02-15') },
        { id: 2, timeDepositId: 1, amount: 100, date: new Date('2024-04-01') },
      ]
      const interestApplications: InterestApplicationDto[] = [
        { id: 1, timeDepositId: 1, amount: 8.33, date: new Date('2024-02-01') },
        { id: 2, timeDepositId: 1, amount: 7.51, date: new Date('2024-03-15') },
      ]

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      // Chronological order:
      // 2024-01-01: deposit 1000 -> balance: 1000
      // 2024-02-01: interest 8.33 -> balance: 1008.33
      // 2024-02-15: withdrawal 300 -> balance: 708.33
      // 2024-03-01: deposit 200 -> balance: 908.33
      // 2024-03-15: interest 7.51 -> balance: 915.84
      // 2024-04-01: withdrawal 100 -> balance: 815.84
      expect(balance).toBe(815.84)
    })

    test('should handle empty events', () => {
      const deposits: DepositDto[] = []
      const withdrawals: WithdrawalDto[] = []
      const interestApplications: InterestApplicationDto[] = []

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      expect(balance).toBe(0)
    })

    test('should round to 2 decimal places', () => {
      const deposits: DepositDto[] = [
        { id: 1, timeDepositId: 1, amount: 100.555, date: new Date('2024-01-01') },
      ]
      const withdrawals: WithdrawalDto[] = []
      const interestApplications: InterestApplicationDto[] = []

      const balance = replayEventsToComputeBalance(deposits, withdrawals, interestApplications)

      expect(balance).toBe(100.56)
    })
  })
})
