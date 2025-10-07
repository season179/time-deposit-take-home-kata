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
