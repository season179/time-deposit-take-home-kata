import { TimeDeposit } from './TimeDeposit'

/**
 * TimeDepositCalculator
 * 
 * Per kata requirements (INSTRUCTIONS.md lines 41-42, 49), the updateBalance method
 * signature and behavior cannot be modified as it's a functioning public contract.
 * 
 * Interest Calculation Rules (INSTRUCTIONS.md lines 34-40):
 * - No interest for first 30 days (all plans)
 * - Basic: 1% annual interest (after 30 days)
 * - Student: 3% annual interest (after 30 days, stops after 1 year)
 * - Premium: 5% annual interest (after 45 days)
 * - Formula: (balance × annual rate) ÷ 12 months
 * - Mutates array in place
 */
export class TimeDepositCalculator {
  public updateBalance(xs: TimeDeposit[]) {
    for (let i = 0; i < xs.length; i++) {
      let a = 0

      if (xs[i].days > 30) {
        if (xs[i].planType === 'student') {
          if (xs[i].days < 366) {
            a += (xs[i].balance * 0.03) / 12
          }
        } else if (xs[i].planType === 'premium') {
          if (xs[i].days > 45) {
            a += (xs[i].balance * 0.05) / 12
          }
        } else if (xs[i].planType === 'basic') {
          a += (xs[i].balance * 0.01) / 12
        }
      }

      const a2d = Math.round((a + Number.EPSILON) * 100) / 100
      xs[i].balance += a2d
    }
  };
}
