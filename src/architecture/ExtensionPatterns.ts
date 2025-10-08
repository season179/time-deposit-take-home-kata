import { TimeDeposit } from '../TimeDeposit'
import { TimeDepositCalculator } from '../TimeDepositCalculator'

/**
 * ===============================================================================
 * ARCHITECTURAL PATTERNS FOR EXTENDING WITHOUT BREAKING CHANGES
 * ===============================================================================
 * 
 * This file demonstrates how to EXTEND functionality without modifying
 * the protected TimeDeposit and TimeDepositCalculator classes.
 * 
 * Key Principle: COMPOSITION OVER MODIFICATION
 * 
 * These patterns show how to:
 * 1. Add new behavior without changing existing code
 * 2. Maintain backward compatibility
 * 3. Follow SOLID principles (especially Open/Closed)
 */

// ============================================================================
// PATTERN 1: Service Layer with Delegation
// ============================================================================

/**
 * Service layer that DELEGATES to the original calculator.
 * Use this to add orchestration logic without modifying the calculator.
 */
export class TimeDepositService {
  private calculator: TimeDepositCalculator

  constructor() {
    this.calculator = new TimeDepositCalculator()
  }

  /**
   * Delegates to the original updateBalance method.
   * Add any pre/post processing here without changing the calculator.
   */
  updateBalances(deposits: TimeDeposit[]): void {
    // Pre-processing logic (e.g., logging, validation)
    console.log(`Updating ${deposits.length} deposits`)

    // DELEGATE to original method - DO NOT modify it
    this.calculator.updateBalance(deposits)

    // Post-processing logic (e.g., notifications, audit)
    console.log('Update complete')
  }

  /**
   * Example: Add new functionality through the service layer
   */
  updateBalancesWithAudit(deposits: TimeDeposit[]): TimeDeposit[] {
    // Clone for audit trail
    const beforeState = deposits.map(d => ({ ...d }))

    // Use original calculator
    this.calculator.updateBalance(deposits)

    // Return audit data without breaking the original contract
    return beforeState
  }
}

// ============================================================================
// PATTERN 2: Decorator Pattern for Additional Behavior
// ============================================================================

/**
 * Interface that matches TimeDepositCalculator's contract
 */
export interface IBalanceUpdater {
  updateBalance(xs: TimeDeposit[]): void
}

/**
 * Adapter to make TimeDepositCalculator implement the interface
 */
export class TimeDepositCalculatorAdapter implements IBalanceUpdater {
  private calculator: TimeDepositCalculator

  constructor() {
    this.calculator = new TimeDepositCalculator()
  }

  updateBalance(xs: TimeDeposit[]): void {
    this.calculator.updateBalance(xs)
  }
}

/**
 * Decorator that adds logging without modifying the original
 */
export class LoggingBalanceUpdater implements IBalanceUpdater {
  constructor(private wrapped: IBalanceUpdater) {}

  updateBalance(xs: TimeDeposit[]): void {
    console.log('Before update:', xs.map(d => d.balance))
    this.wrapped.updateBalance(xs)
    console.log('After update:', xs.map(d => d.balance))
  }
}

/**
 * Decorator that adds validation without modifying the original
 */
export class ValidatingBalanceUpdater implements IBalanceUpdater {
  constructor(private wrapped: IBalanceUpdater) {}

  updateBalance(xs: TimeDeposit[]): void {
    // Add validation
    xs.forEach(deposit => {
      if (deposit.balance < 0) {
        throw new Error(`Invalid balance for deposit ${deposit.id}`)
      }
    })

    this.wrapped.updateBalance(xs)
  }
}

/**
 * Usage Example:
 * 
 * const calculator = new TimeDepositCalculatorAdapter()
 * const withLogging = new LoggingBalanceUpdater(calculator)
 * const withValidation = new ValidatingBalanceUpdater(withLogging)
 * 
 * withValidation.updateBalance(deposits) // Validates, logs, then updates
 */

// ============================================================================
// PATTERN 3: Strategy Pattern for Interest Calculation
// ============================================================================

/**
 * Interest calculation strategy interface
 * Use this for NEW interest calculation logic
 */
export interface InterestStrategy {
  calculate(deposit: TimeDeposit): number
}

/**
 * Basic plan strategy (extracted from existing logic for reference)
 */
export class BasicPlanStrategy implements InterestStrategy {
  calculate(deposit: TimeDeposit): number {
    if (deposit.days <= 30) return 0
    return (deposit.balance * 0.01) / 12
  }
}

/**
 * Example of a NEW strategy without modifying existing code
 */
export class VIPPlanStrategy implements InterestStrategy {
  calculate(deposit: TimeDeposit): number {
    if (deposit.days <= 30) return 0
    // New business logic: 7% interest, no restrictions
    return (deposit.balance * 0.07) / 12
  }
}

/**
 * Service that uses strategies for NEW business requirements
 */
export class ExtensibleInterestService {
  private strategies: Map<string, InterestStrategy> = new Map()
  private legacyCalculator: TimeDepositCalculator

  constructor() {
    this.legacyCalculator = new TimeDepositCalculator()
    
    // Register new strategies
    this.strategies.set('vip', new VIPPlanStrategy())
    // Add more strategies as needed
  }

  updateBalances(deposits: TimeDeposit[]): void {
    // Separate deposits into legacy and new plan types
    const legacyDeposits = deposits.filter(d => 
      ['basic', 'student', 'premium'].includes(d.planType)
    )
    const newDeposits = deposits.filter(d => 
      !['basic', 'student', 'premium'].includes(d.planType)
    )

    // Use LEGACY calculator for existing plan types (no breaking changes)
    if (legacyDeposits.length > 0) {
      this.legacyCalculator.updateBalance(legacyDeposits)
    }

    // Use new strategies for new plan types
    newDeposits.forEach(deposit => {
      const strategy = this.strategies.get(deposit.planType)
      if (strategy) {
        const interest = strategy.calculate(deposit)
        const rounded = Math.round((interest + Number.EPSILON) * 100) / 100
        deposit.balance += rounded
      }
    })
  }
}

// ============================================================================
// PATTERN 4: Repository Pattern for Data Access
// ============================================================================

/**
 * Repository interface for time deposit data
 * Abstracts data access without touching the domain model
 */
export interface ITimeDepositRepository {
  findAll(): Promise<TimeDeposit[]>
  save(deposit: TimeDeposit): Promise<void>
  saveAll(deposits: TimeDeposit[]): Promise<void>
}

/**
 * Service that orchestrates repository and calculator
 * This is how you build the application without modifying core classes
 */
export class TimeDepositApplicationService {
  constructor(
    private repository: ITimeDepositRepository,
    private calculator: TimeDepositCalculator
  ) {}

  async updateAllBalances(): Promise<void> {
    // Fetch from repository
    const deposits = await this.repository.findAll()

    // Use ORIGINAL calculator (no modifications)
    this.calculator.updateBalance(deposits)

    // Save back to repository
    await this.repository.saveAll(deposits)
  }
}

// ============================================================================
// PATTERN 5: DTO/Mapper Pattern for API Responses
// ============================================================================

/**
 * DTO for API responses - extends without modifying TimeDeposit
 */
export interface TimeDepositDTO {
  id: number
  planType: string
  balance: number
  days: number
  withdrawals?: WithdrawalDTO[]
}

export interface WithdrawalDTO {
  id: number
  amount: number
  date: string
}

/**
 * Mapper to convert TimeDeposit to DTO
 * Add extra data without modifying the domain model
 */
export class TimeDepositMapper {
  static toDTO(
    deposit: TimeDeposit, 
    withdrawals: WithdrawalDTO[] = []
  ): TimeDepositDTO {
    return {
      id: deposit.id,
      planType: deposit.planType,
      balance: deposit.balance,
      days: deposit.days,
      withdrawals
    }
  }

  static toDomain(dto: TimeDepositDTO): TimeDeposit {
    return new TimeDeposit(
      dto.id,
      dto.planType,
      dto.balance,
      dto.days
    )
  }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Using Service Layer
 */
export function exampleServiceLayer() {
  const service = new TimeDepositService()
  const deposits = [
    new TimeDeposit(1, 'basic', 1000, 45),
    new TimeDeposit(2, 'student', 2000, 100)
  ]
  
  service.updateBalances(deposits)
}

/**
 * Example 2: Using Decorator Pattern
 */
export function exampleDecorator() {
  const base = new TimeDepositCalculatorAdapter()
  const withLogging = new LoggingBalanceUpdater(base)
  const withValidation = new ValidatingBalanceUpdater(withLogging)
  
  const deposits = [new TimeDeposit(1, 'basic', 1000, 45)]
  withValidation.updateBalance(deposits)
}

/**
 * Example 3: Using Strategy Pattern for Extension
 */
export function exampleStrategy() {
  const service = new ExtensibleInterestService()
  const deposits = [
    new TimeDeposit(1, 'basic', 1000, 45),      // Uses legacy calculator
    new TimeDeposit(2, 'vip', 5000, 100)        // Uses new strategy
  ]
  
  service.updateBalances(deposits)
}

/**
 * KEY TAKEAWAYS:
 * 
 * 1. NEVER modify TimeDeposit or TimeDepositCalculator.updateBalance
 * 2. Use composition and delegation to add behavior
 * 3. Create service layers for orchestration
 * 4. Use decorators for cross-cutting concerns
 * 5. Use strategies for new business logic
 * 6. Use DTOs/mappers for API concerns
 * 7. Keep the domain model pure and protected
 */
