import { TimeDepositRepository, TimeDepositWithWithdrawals } from '../../domain/ports/TimeDepositRepository'

/**
 * Use Case: Get All Time Deposits
 * 
 * Retrieves all time deposits with withdrawal history for the GET endpoint.
 * Implements INSTRUCTIONS.md lines 12-18.
 */
export class GetAllTimeDeposits {
  constructor(private readonly repository: TimeDepositRepository) {}

  async execute(): Promise<Omit<TimeDepositWithWithdrawals, 'deposits'>[]> {
    const deposits = await this.repository.findAll()
    return deposits.map(({ deposits: _, ...rest }) => rest)
  }
}
