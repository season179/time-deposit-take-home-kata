import { TimeDeposit } from '../../TimeDeposit'

/**
 * Repository Port (Interface)
 * 
 * Defines the contract for time deposit persistence operations.
 * This is part of the hexagonal architecture - the domain defines what it needs,
 * and infrastructure adapters implement these requirements.
 * 
 * Following the Dependency Inversion Principle:
 * - High-level domain logic depends on this abstraction
 * - Low-level infrastructure implements this abstraction
 */
export interface TimeDepositRepository {
  /**
   * Retrieve all time deposits with their withdrawal history
   */
  findAll(): Promise<TimeDepositWithWithdrawals[]>

  /**
   * Find a single time deposit by ID
   */
  findById(id: number): Promise<TimeDepositWithWithdrawals | null>

  /**
   * Create a new time deposit
   */
  create(deposit: CreateTimeDepositDto): Promise<TimeDeposit>

  /**
   * Update the balance of a time deposit
   */
  updateBalance(id: number, newBalance: number): Promise<void>

  /**
   * Update balances for multiple time deposits (bulk operation)
   */
  updateBalances(updates: { id: number; balance: number }[]): Promise<void>

  /**
   * Add a withdrawal record
   */
  addWithdrawal(withdrawal: CreateWithdrawalDto): Promise<void>
}

/**
 * DTOs (Data Transfer Objects)
 */
export interface CreateTimeDepositDto {
  planType: string
  days: number
  balance: number
}

export interface CreateWithdrawalDto {
  timeDepositId: number
  amount: number
  date: Date
}

export interface WithdrawalDto {
  id: number
  timeDepositId: number
  amount: number
  date: Date
}

/**
 * Time Deposit enriched with withdrawal history
 * This is what the GET API endpoint should return (INSTRUCTIONS.md lines 13-18)
 */
export interface TimeDepositWithWithdrawals {
  id: number
  planType: string
  balance: number
  days: number
  withdrawals: WithdrawalDto[]
}
