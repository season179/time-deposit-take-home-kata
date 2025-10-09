import { TimeDeposit } from '../TimeDeposit'
import { TimeDepositCalculator } from '../TimeDepositCalculator'

/**
 * Type Safety Guardrails
 * 
 * Compile-time and runtime validation to prevent breaking changes to TimeDeposit
 * and TimeDepositCalculator public contracts (per kata requirements).
 */

/**
 * TimeDeposit public contract - any deviation causes compilation errors
 */
export interface TimeDepositPublicContract {
  id: number
  planType: string
  balance: number
  days: number
}

/**
 * TimeDepositCalculator.updateBalance method signature contract
 */
export interface TimeDepositCalculatorPublicContract {
  updateBalance(xs: TimeDeposit[]): void
}

// Compile-time assertion: TimeDeposit matches contract
type AssertTimeDepositContract<T extends TimeDepositPublicContract> = T
type _TimeDepositCheck = AssertTimeDepositContract<TimeDeposit>

// Compile-time assertion: TimeDepositCalculator matches contract
type AssertCalculatorContract<T extends TimeDepositCalculatorPublicContract> = T
type _CalculatorCheck = AssertCalculatorContract<TimeDepositCalculator>

/**
 * Runtime validation for TimeDeposit contract
 */
export function validateTimeDepositContract(obj: any): obj is TimeDepositPublicContract {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.id === 'number' &&
    typeof obj.planType === 'string' &&
    typeof obj.balance === 'number' &&
    typeof obj.days === 'number'
  )
}

/**
 * Runtime validation for Calculator contract
 */
export function validateCalculatorContract(obj: any): obj is TimeDepositCalculatorPublicContract {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.updateBalance === 'function' &&
    obj.updateBalance.length === 1
  )
}

export type UpdateBalanceSignature = (xs: TimeDeposit[]) => void
export type FrozenTimeDepositContract = Readonly<TimeDepositPublicContract>
export const TIME_DEPOSIT_CONTRACT_VERSION = '1.0.0' as const
