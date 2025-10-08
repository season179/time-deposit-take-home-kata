import { TimeDeposit } from './TimeDeposit'

/**
 * ⚠️⚠️⚠️ CRITICAL - DO NOT MODIFY - PUBLIC API METHOD ⚠️⚠️⚠️
 * 
 * The updateBalance method is a PUBLIC CONTRACT used by multiple systems.
 * This implementation is FUNCTIONING CORRECTLY and must remain unchanged.
 * 
 * PROTECTED ELEMENTS (cannot be changed):
 * ✗ Method signature: updateBalance(xs: TimeDeposit[]): void
 * ✗ Method behavior and logic
 * ✗ Parameter types (must accept TimeDeposit[])
 * ✗ Return type (must be void)
 * ✗ Side effects (must mutate array in place)
 * 
 * CURRENT BEHAVIOR (must be preserved):
 * - No interest for first 30 days (any plan)
 * - Basic plan: 1% interest (days > 30)
 * - Student plan: 3% interest (days > 30 AND days < 366)
 * - Premium plan: 5% interest (days > 45)
 * - Interest calculation: (balance * rate) / 12
 * - Rounding: Math.round((value + Number.EPSILON) * 100) / 100
 * - Mutates array in place
 * 
 * TO EXTEND FUNCTIONALITY:
 * ✓ Create a service layer that delegates to this calculator
 * ✓ Use decorator pattern to add behavior
 * ✓ Implement new calculators for new requirements
 * ✓ DO NOT modify this class
 * 
 * GUARDRAILS:
 * - Breaking change tests: src/tests/BreakingChangeGuardrails.test.ts
 * - Type contracts: src/types/PublicContracts.ts
 * 
 * Reference: INSTRUCTIONS.md lines 41-42, 49
 * Contact: Architecture team before ANY modifications
 */
export class TimeDepositCalculator {
  /**
   * Updates the balance of all time deposits by calculating and applying monthly interest.
   * 
   * This method mutates the input array in place - it directly modifies the balance
   * property of each TimeDeposit object.
   * 
   * @param xs - Array of TimeDeposit objects to update
   */
  public updateBalance(xs: TimeDeposit[]) {
    // Loop through each time deposit in the array
    for (let i = 0; i < xs.length; i++) {
      // 'a' will store the calculated interest amount for this deposit
      let a = 0

      // BUSINESS RULE: No interest is applied for the first 30 days
      // Only calculate interest if the deposit has been active for more than 30 days
      if (xs[i].days > 30) {
        
        // STUDENT PLAN: 3% annual interest rate
        if (xs[i].planType === 'student') {
          // BUSINESS RULE: Student plan only earns interest for the first year
          // Stop applying interest after 365 days (before day 366)
          if (xs[i].days < 366) {
            // Calculate monthly interest: (balance × 3%) ÷ 12 months
            // 0.03 = 3% annual rate
            a += (xs[i].balance * 0.03) / 12
          }
        } 
        
        // PREMIUM PLAN: 5% annual interest rate
        else if (xs[i].planType === 'premium') {
          // BUSINESS RULE: Premium plan has a grace period
          // Interest only starts AFTER 45 days (day 46 onwards)
          if (xs[i].days > 45) {
            // Calculate monthly interest: (balance × 5%) ÷ 12 months
            // 0.05 = 5% annual rate
            a += (xs[i].balance * 0.05) / 12
          }
        } 
        
        // BASIC PLAN: 1% annual interest rate
        else if (xs[i].planType === 'basic') {
          // Basic plan has no additional restrictions beyond the 30-day threshold
          // Calculate monthly interest: (balance × 1%) ÷ 12 months
          // 0.01 = 1% annual rate
          a += (xs[i].balance * 0.01) / 12
        }
        
        // Note: If planType is none of the above (e.g., 'unknown'), no interest is added
      }

      // ROUNDING LOGIC: Round the interest to 2 decimal places (cents)
      // Number.EPSILON is a tiny number that helps fix floating-point precision errors
      // Example: If a = 0.835, this becomes 0.84
      // Step 1: Multiply by 100 → 83.5
      // Step 2: Round → 84
      // Step 3: Divide by 100 → 0.84
      const a2d = Math.round((a + Number.EPSILON) * 100) / 100

      // MUTATION: Add the calculated interest to the original balance
      // This modifies the TimeDeposit object directly (in-place mutation)
      xs[i].balance += a2d
    }
  };
}
