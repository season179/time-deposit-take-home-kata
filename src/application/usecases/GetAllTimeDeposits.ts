import { TimeDepositRepository, TimeDepositWithWithdrawals } from '../../domain/ports/TimeDepositRepository'

/**
 * Use Case: Get All Time Deposits
 * 
 * Application layer use case that retrieves all time deposits with their withdrawal history.
 * This implements the GET endpoint requirement (INSTRUCTIONS.md lines 12-18)
 * 
 * Hexagonal Architecture:
 * - Application layer orchestrates domain logic
 * - Depends on repository port (not implementation)
 * - Returns DTOs suitable for API response
 */
export class GetAllTimeDeposits {
  constructor(private readonly repository: TimeDepositRepository) {}

  async execute(): Promise<Omit<TimeDepositWithWithdrawals, 'deposits'>[]> {
    const deposits = await this.repository.findAll()
    
    // Filter out deposits field as it's only needed internally for computation
    // API response per INSTRUCTIONS.md should only include: id, planType, balance, days, withdrawals
    return deposits.map(({ deposits: _, ...rest }) => rest)
  }
}
