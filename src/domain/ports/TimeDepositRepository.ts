import { TimeDeposit } from '../../TimeDeposit'

/**
 * Repository Port
 * 
 * Defines persistence contract for time deposits following hexagonal architecture.
 * Domain defines the interface; infrastructure provides the implementation.
 */
export interface TimeDepositRepository {
  findAll(): Promise<TimeDepositWithWithdrawals[]>

  findById(id: number): Promise<TimeDepositWithWithdrawals | null>

  create(deposit: CreateTimeDepositDto): Promise<TimeDeposit>

  updateBalance(id: number, newBalance: number): Promise<void>

  updateBalances(updates: { id: number; balance: number; days: number }[]): Promise<void>

  addWithdrawal(withdrawal: CreateWithdrawalDto): Promise<void>

  addInterestApplication(interest: CreateInterestApplicationDto): Promise<void>

  addInterestApplications(interests: CreateInterestApplicationDto[]): Promise<void>
}

export interface CreateTimeDepositDto {
  planType: string
  days: number
  balance: number
  openingDate?: Date
}

export interface CreateDepositDto {
  timeDepositId: number
  amount: number
  date: Date
}

export interface CreateWithdrawalDto {
  timeDepositId: number
  amount: number
  date: Date
}

export interface CreateInterestApplicationDto {
  timeDepositId: number
  amount: number
  date: Date
}

export interface DepositDto {
  id: number
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

export interface InterestApplicationDto {
  id: number
  timeDepositId: number
  amount: number
  date: Date
}

export interface TimeDepositWithWithdrawals {
  id: number
  planType: string
  balance: number
  days: number
  withdrawals: WithdrawalDto[]
  deposits: DepositDto[]
  interestApplications: InterestApplicationDto[]
}
