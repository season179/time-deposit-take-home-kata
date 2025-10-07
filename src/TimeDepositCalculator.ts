import { TimeDeposit } from './TimeDeposit'

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
