/**
 * ⚠️⚠️⚠️ CRITICAL - DO NOT MODIFY - SHARED PUBLIC API ⚠️⚠️⚠️
 * 
 * This class is used by MULTIPLE SYSTEMS and represents a PUBLIC API CONTRACT.
 * ANY changes to this class are BREAKING CHANGES that will affect other services.
 * 
 * PROTECTED ELEMENTS (cannot be changed):
 * ✗ Constructor signature: (id: number, planType: string, balance: number, days: number)
 * ✗ Public properties: id, planType, balance, days
 * ✗ Property types and mutability
 * 
 * TO EXTEND FUNCTIONALITY:
 * ✓ Create wrapper classes
 * ✓ Use composition/delegation patterns
 * ✓ Implement the Strategy pattern for new behavior
 * ✓ Create DTOs or adapters for API responses
 * 
 * GUARDRAILS:
 * - Breaking change tests: src/tests/BreakingChangeGuardrails.test.ts
 * - Type contracts: src/types/PublicContracts.ts
 * 
 * Reference: INSTRUCTIONS.md lines 41-42
 * Contact: Architecture team before ANY modifications
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
