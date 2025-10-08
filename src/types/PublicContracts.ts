import { TimeDeposit } from '../TimeDeposit'
import { TimeDepositCalculator } from '../TimeDepositCalculator'

/**
 * ⚠️⚠️⚠️ PUBLIC API CONTRACTS - TYPE SAFETY GUARDRAILS ⚠️⚠️⚠️
 * 
 * These interfaces define the PUBLIC API contracts that cannot be changed.
 * They serve as compile-time guardrails against breaking changes.
 * 
 * If any of these type assertions fail, it indicates a BREAKING CHANGE.
 */

/**
 * PUBLIC CONTRACT: TimeDeposit class interface
 * 
 * This defines the exact shape that TimeDeposit must maintain.
 * Any deviation will cause compilation errors.
 */
export interface TimeDepositPublicContract {
  id: number
  planType: string
  balance: number
  days: number
}

/**
 * PUBLIC CONTRACT: TimeDepositCalculator.updateBalance method signature
 * 
 * This ensures the method signature remains unchanged.
 */
export interface TimeDepositCalculatorPublicContract {
  updateBalance(xs: TimeDeposit[]): void
}

/**
 * COMPILE-TIME ASSERTION: TimeDeposit matches the public contract
 * 
 * This will fail to compile if TimeDeposit doesn't match the contract.
 */
type AssertTimeDepositContract<T extends TimeDepositPublicContract> = T
type _TimeDepositCheck = AssertTimeDepositContract<TimeDeposit>

/**
 * COMPILE-TIME ASSERTION: TimeDepositCalculator matches the public contract
 * 
 * This will fail to compile if TimeDepositCalculator doesn't match the contract.
 */
type AssertCalculatorContract<T extends TimeDepositCalculatorPublicContract> = T
type _CalculatorCheck = AssertCalculatorContract<TimeDepositCalculator>

/**
 * RUNTIME VALIDATION: Validate that an object matches TimeDeposit contract
 * 
 * Use this to validate objects at runtime if needed.
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
 * RUNTIME VALIDATION: Validate that an object has the updateBalance method
 */
export function validateCalculatorContract(obj: any): obj is TimeDepositCalculatorPublicContract {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.updateBalance === 'function' &&
    obj.updateBalance.length === 1
  )
}

/**
 * TYPE GUARD: Ensure updateBalance signature
 * 
 * This type represents the exact signature of updateBalance.
 * Use it for type safety when working with the method.
 */
export type UpdateBalanceSignature = (xs: TimeDeposit[]) => void

/**
 * FROZEN CONTRACT: Exact properties that cannot change
 * 
 * This creates a readonly version of the contract for documentation.
 */
export type FrozenTimeDepositContract = Readonly<TimeDepositPublicContract>

/**
 * CONTRACT VERSION: Track API version for backward compatibility
 * 
 * Increment this if you somehow need to make breaking changes in the future
 * (though you shouldn't for this specific class).
 */
export const TIME_DEPOSIT_CONTRACT_VERSION = '1.0.0' as const

/**
 * EXAMPLE: How to use these contracts in new code
 * 
 * When creating DTOs, services, or other components, reference these contracts:
 * 
 * ```typescript
 * import { TimeDepositPublicContract } from './types/PublicContracts'
 * 
 * // DTO that extends the contract
 * interface TimeDepositDTO extends TimeDepositPublicContract {
 *   withdrawals?: Withdrawal[]
 * }
 * 
 * // Service that accepts the contract
 * class TimeDepositService {
 *   process(deposit: TimeDepositPublicContract) {
 *     // Your logic here
 *   }
 * }
 * ```
 */
