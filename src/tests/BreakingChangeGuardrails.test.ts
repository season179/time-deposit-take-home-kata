import { test, expect, describe } from 'bun:test'
import { TimeDeposit } from '../TimeDeposit'
import { TimeDepositCalculator } from '../TimeDepositCalculator'

/**
 * ⚠️⚠️⚠️ CRITICAL BREAKING CHANGE GUARDRAILS ⚠️⚠️⚠️
 * 
 * These tests protect the public API contracts that CANNOT be changed.
 * If ANY test in this suite fails, it indicates a BREAKING CHANGE.
 * 
 * DO NOT modify these tests to "make them pass" - fix the breaking change instead.
 * 
 * Reference: INSTRUCTIONS.md lines 41-42, 49
 */

describe('CRITICAL: Breaking Change Guardrails', () => {
  
  describe('TimeDeposit Class Contract', () => {
    test('Constructor signature must remain: (id, planType, balance, days)', () => {
      const deposit = new TimeDeposit(1, 'basic', 1000, 45)
      
      expect(deposit.id).toBe(1)
      expect(deposit.planType).toBe('basic')
      expect(deposit.balance).toBe(1000)
      expect(deposit.days).toBe(45)
    })

    test('All public properties must exist and be accessible', () => {
      const deposit = new TimeDeposit(1, 'basic', 1000, 45)
      
      expect(deposit).toHaveProperty('id')
      expect(deposit).toHaveProperty('planType')
      expect(deposit).toHaveProperty('balance')
      expect(deposit).toHaveProperty('days')
    })

    test('Properties must be mutable (public fields)', () => {
      const deposit = new TimeDeposit(1, 'basic', 1000, 45)
      
      // Test mutability
      deposit.balance = 2000
      expect(deposit.balance).toBe(2000)
      
      deposit.days = 100
      expect(deposit.days).toBe(100)
    })
  })

  describe('TimeDepositCalculator.updateBalance Method Contract', () => {
    test('Method signature: updateBalance(xs: TimeDeposit[]) => void', () => {
      const calc = new TimeDepositCalculator()
      const plans = [new TimeDeposit(1, 'basic', 1000, 45)]
      
      const result = calc.updateBalance(plans)
      
      // Must return void (undefined)
      expect(result).toBeUndefined()
      
      // Method must exist and be callable
      expect(typeof calc.updateBalance).toBe('function')
    })

    test('Method must accept an array parameter', () => {
      const calc = new TimeDepositCalculator()
      
      // Should work with empty array
      expect(() => calc.updateBalance([])).not.toThrow()
      
      // Should work with single item
      expect(() => calc.updateBalance([new TimeDeposit(1, 'basic', 1000, 45)])).not.toThrow()
      
      // Should work with multiple items
      expect(() => calc.updateBalance([
        new TimeDeposit(1, 'basic', 1000, 45),
        new TimeDeposit(2, 'student', 2000, 100)
      ])).not.toThrow()
    })
  })

  describe('Interest Calculation Behavior - Must Remain Unchanged', () => {
    test('Basic Plan: 1% interest after 30 days', () => {
      const plans = [new TimeDeposit(1, 'basic', 1000, 45)]
      new TimeDepositCalculator().updateBalance(plans)
      
      // Expected: (1000 * 0.01) / 12 = 0.833... → rounded to 0.83
      expect(plans[0].balance).toBe(1000.83)
    })

    test('Basic Plan: No interest in first 30 days', () => {
      const plans = [new TimeDeposit(1, 'basic', 1000, 30)]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000)
    })

    test('Student Plan: 3% interest within 1 year (days < 366)', () => {
      const plans = [new TimeDeposit(1, 'student', 1000, 100)]
      new TimeDepositCalculator().updateBalance(plans)
      
      // Expected: (1000 * 0.03) / 12 = 2.5
      expect(plans[0].balance).toBe(1002.50)
    })

    test('Student Plan: No interest after 1 year (days >= 366)', () => {
      const plans = [new TimeDeposit(1, 'student', 1000, 366)]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000)
    })

    test('Student Plan: No interest in first 30 days', () => {
      const plans = [new TimeDeposit(1, 'student', 1000, 30)]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000)
    })

    test('Premium Plan: 5% interest after 45 days', () => {
      const plans = [new TimeDeposit(1, 'premium', 1000, 60)]
      new TimeDepositCalculator().updateBalance(plans)
      
      // Expected: (1000 * 0.05) / 12 = 4.166... → rounded to 4.17
      expect(plans[0].balance).toBe(1004.17)
    })

    test('Premium Plan: No interest before or at 45 days', () => {
      const plans = [
        new TimeDeposit(1, 'premium', 1000, 44),
        new TimeDeposit(2, 'premium', 1000, 45)
      ]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000)
      expect(plans[1].balance).toBe(1000)
    })

    test('Premium Plan: No interest in first 30 days (even though threshold is 45)', () => {
      const plans = [new TimeDeposit(1, 'premium', 1000, 25)]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000)
    })

    test('Rounding behavior: Must round to 2 decimal places', () => {
      // Test edge case with rounding
      const plans = [new TimeDeposit(1, 'basic', 1234567, 45)]
      new TimeDepositCalculator().updateBalance(plans)
      
      // Expected: (1234567 * 0.01) / 12 = 1028.8058... → rounded to 1028.81
      expect(plans[0].balance).toBe(1235595.81)
    })
  })

  describe('Mutation Behavior - Must Remain Unchanged', () => {
    test('updateBalance must mutate the original array in place', () => {
      const plans = [new TimeDeposit(1, 'basic', 1000, 45)]
      const originalReference = plans[0]
      
      new TimeDepositCalculator().updateBalance(plans)
      
      // Same object reference must be mutated
      expect(plans[0]).toBe(originalReference)
      expect(originalReference.balance).toBe(1000.83)
    })

    test('updateBalance must mutate all items in array', () => {
      const plans = [
        new TimeDeposit(1, 'basic', 1000, 45),
        new TimeDeposit(2, 'student', 2000, 100),
        new TimeDeposit(3, 'premium', 3000, 60)
      ]
      
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000.83)  // basic: (1000 * 0.01) / 12
      expect(plans[1].balance).toBe(2005.00)  // student: (2000 * 0.03) / 12
      expect(plans[2].balance).toBe(3012.50)  // premium: (3000 * 0.05) / 12
    })

    test('Empty array must not cause errors', () => {
      const plans: TimeDeposit[] = []
      
      expect(() => new TimeDepositCalculator().updateBalance(plans)).not.toThrow()
      expect(plans.length).toBe(0)
    })
  })

  describe('Edge Cases - Existing Behavior', () => {
    test('Unknown plan types should have no interest (implicit behavior)', () => {
      const plans = [new TimeDeposit(1, 'unknown', 1000, 45)]
      new TimeDepositCalculator().updateBalance(plans)
      
      // Based on current code logic, unknown plans get no interest
      expect(plans[0].balance).toBe(1000)
    })

    test('Negative days should have no interest (day <= 30 check)', () => {
      const plans = [new TimeDeposit(1, 'basic', 1000, -10)]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000)
    })

    test('Day 31 should apply interest for basic plan', () => {
      const plans = [new TimeDeposit(1, 'basic', 1000, 31)]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1000.83)
    })

    test('Day 365 for student plan should still get interest', () => {
      const plans = [new TimeDeposit(1, 'student', 1000, 365)]
      new TimeDepositCalculator().updateBalance(plans)
      
      // 365 < 366, so interest applies
      expect(plans[0].balance).toBe(1002.50)
    })

    test('Day 46 for premium plan should get interest', () => {
      const plans = [new TimeDeposit(1, 'premium', 1000, 46)]
      new TimeDepositCalculator().updateBalance(plans)
      
      expect(plans[0].balance).toBe(1004.17)
    })
  })
})
