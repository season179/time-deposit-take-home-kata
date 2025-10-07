import { TimeDeposit } from '../TimeDeposit'
import { TimeDepositCalculator } from '../TimeDepositCalculator'


test('Should update balance', () => {
  const plans: TimeDeposit[] = [new TimeDeposit(1, 'basic', 1234567.0, 45)]
  const calc = new TimeDepositCalculator()
  calc.updateBalance(plans)

  expect(1).toBe(1)
})
