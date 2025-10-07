import { TimeDeposit } from './TimeDeposit'
import { TimeDepositCalculator } from './TimeDepositCalculator'

const calc = new TimeDepositCalculator()
const plans: TimeDeposit[] = [new TimeDeposit('basic', 1234567.0, 45)]
const interest = calc.updateBalance(plans)
console.log({ interest })
