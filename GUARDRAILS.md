# Breaking Change Guardrails

## ⚠️ Critical Constraint

**The `TimeDeposit` class and `TimeDepositCalculator.updateBalance()` method are PUBLIC APIs that CANNOT be modified.**

These components are shared across multiple systems. Any changes will cause breaking changes in other services.

## 🛡️ Guardrail System

This project implements a multi-layered defense system to prevent accidental breaking changes:

### 1. **Comprehensive Test Suite** ✅ IMPLEMENTED
**Location:** `src/tests/BreakingChangeGuardrails.test.ts`

This test suite validates:
- ✓ Constructor signatures remain unchanged
- ✓ Public properties are accessible and mutable
- ✓ Method signatures are preserved
- ✓ Interest calculation behavior is exact
- ✓ Mutation behavior is preserved
- ✓ Edge cases behave consistently
- ✓ Rounding logic is maintained

**Run the guardrails:**
```bash
bun test src/tests/BreakingChangeGuardrails.test.ts
```

**⚠️ If ANY test fails, you have introduced a breaking change!**

### 2. **Type Safety Contracts** ✅ IMPLEMENTED
**Location:** `src/types/PublicContracts.ts`

Compile-time type assertions that will fail if:
- TimeDeposit structure changes
- TimeDepositCalculator method signature changes
- Required properties are modified

These provide **compile-time** protection against breaking changes.

### 3. **Documentation Warnings** ✅ IMPLEMENTED
**Location:** 
- `src/TimeDeposit.ts` (class-level documentation)
- `src/TimeDepositCalculator.ts` (class-level documentation)

Clear warnings at the top of each protected class that explain:
- What cannot be changed
- Why it cannot be changed
- How to extend functionality properly
- Where to find guardrails

### 4. **Architectural Patterns** ✅ IMPLEMENTED
**Location:** `src/architecture/ExtensionPatterns.ts`

Examples of how to extend functionality WITHOUT breaking changes:
- Service Layer Pattern (delegation)
- Decorator Pattern (add behavior)
- Strategy Pattern (new business logic)
- Repository Pattern (data access)
- DTO/Mapper Pattern (API responses)

## 📋 Protected Elements

### TimeDeposit Class
```typescript
export class TimeDeposit {
  public id: number         // ✗ Cannot change
  public planType: string   // ✗ Cannot change
  public balance: number    // ✗ Cannot change
  public days: number       // ✗ Cannot change

  constructor(id, planType, balance, days)  // ✗ Cannot change signature
}
```

### TimeDepositCalculator.updateBalance Method
```typescript
public updateBalance(xs: TimeDeposit[]): void  // ✗ Cannot change signature
```

**Behavior that MUST be preserved:**
- No interest for first 30 days (any plan)
- Basic plan: 1% interest (days > 30)
- Student plan: 3% interest (days > 30 AND days < 366)
- Premium plan: 5% interest (days > 45)
- Calculation: `(balance * rate) / 12`
- Rounding: `Math.round((value + Number.EPSILON) * 100) / 100`
- Mutates array in place

## ✅ How to Extend Functionality

### ❌ DON'T DO THIS:
```typescript
// WRONG - Modifying the protected class
export class TimeDeposit {
  public id: number
  public planType: string
  public balance: number
  public days: number
  public withdrawals: Withdrawal[]  // ❌ Breaking change!
}
```

### ✅ DO THIS INSTEAD:

#### Option 1: Service Layer
```typescript
export class TimeDepositService {
  private calculator = new TimeDepositCalculator()
  
  updateBalances(deposits: TimeDeposit[]): void {
    // Add your logic here
    this.calculator.updateBalance(deposits)  // Delegate to original
    // Add more logic here
  }
}
```

#### Option 2: DTO for API Responses
```typescript
export interface TimeDepositDTO {
  id: number
  planType: string
  balance: number
  days: number
  withdrawals?: Withdrawal[]  // ✅ Add here, not to domain model
}

export class TimeDepositMapper {
  static toDTO(deposit: TimeDeposit, withdrawals: Withdrawal[]): TimeDepositDTO {
    return { ...deposit, withdrawals }
  }
}
```

#### Option 3: Decorator Pattern
```typescript
export class EnhancedBalanceUpdater implements IBalanceUpdater {
  constructor(private calculator: TimeDepositCalculator) {}
  
  updateBalance(xs: TimeDeposit[]): void {
    // Pre-processing
    this.calculator.updateBalance(xs)  // Delegate
    // Post-processing
  }
}
```

#### Option 4: Strategy Pattern for New Plan Types
```typescript
export class ExtensibleInterestService {
  private legacyCalculator = new TimeDepositCalculator()
  private strategies = new Map<string, InterestStrategy>()
  
  updateBalances(deposits: TimeDeposit[]): void {
    // Use legacy calculator for basic/student/premium
    const legacy = deposits.filter(d => ['basic', 'student', 'premium'].includes(d.planType))
    this.legacyCalculator.updateBalance(legacy)
    
    // Use new strategies for new plan types
    const newPlans = deposits.filter(d => !['basic', 'student', 'premium'].includes(d.planType))
    // Apply strategies...
  }
}
```

## 🔍 Verification Checklist

Before committing code, ensure:

- [ ] `TimeDeposit` class is unchanged
- [ ] `TimeDepositCalculator.updateBalance()` method is unchanged
- [ ] All breaking change guardrail tests pass
- [ ] Type contracts compile without errors
- [ ] New functionality uses composition/delegation patterns
- [ ] No modifications to protected files

**Run verification:**
```bash
# Run breaking change tests
bun test src/tests/BreakingChangeGuardrails.test.ts

# Run all tests
bun test

# Type check
bun run tsc --noEmit
```

## 📚 Reference

- **Instructions:** See `INSTRUCTIONS.md` lines 41-42, 49
- **Test Suite:** `src/tests/BreakingChangeGuardrails.test.ts`
- **Type Contracts:** `src/types/PublicContracts.ts`
- **Extension Patterns:** `src/architecture/ExtensionPatterns.ts`

## 🚨 If You Must Make Breaking Changes

1. **DON'T** - This is a hard constraint for this project
2. If absolutely required in a real-world scenario:
   - Get architecture team approval
   - Create a new version of the class (v2)
   - Maintain backward compatibility
   - Create migration path for all consumers
   - Update all dependent systems
   - Increment contract version in `PublicContracts.ts`

## 💡 Key Principle

> **Composition over Modification**
> 
> Always extend through composition, delegation, and design patterns.
> Never modify the protected core classes.

---

**For questions or concerns, contact the Architecture team.**
