/**
 * TimeDeposit Domain Model
 * 
 * Per kata requirements (INSTRUCTIONS.md lines 41-42), this class cannot be modified
 * as it represents a shared API contract. Type safety guardrails are enforced in
 * src/types/PublicContracts.ts and src/tests/BreakingChangeGuardrails.test.ts
 */
export class TimeDeposit {
  public id: number
  public planType: string
  public balance: number
  public days: number

  constructor(id: number, planType: string, balance: number, days: number) {
    this.id = id
    this.planType = planType;
    this.balance = balance;
    this.days = days
  }
}
