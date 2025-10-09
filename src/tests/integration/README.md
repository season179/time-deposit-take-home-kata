# Integration Test Suite

## Overview

This directory contains comprehensive integration tests for the Time Deposit API endpoints. These tests validate the complete system behavior including HTTP endpoints, business logic, and database persistence.

## Test Categories

### 1. **api.get-time-deposits.test.ts** - Data Retrieval (8 tests)
Tests the `GET /time-deposits` endpoint:
- Happy path scenarios
- Empty database handling
- Deposits with/without withdrawals
- Multiple withdrawals per deposit
- Days calculation accuracy
- Mixed plan types
- Balance integrity

### 2. **api.update-balances-basic.test.ts** - Basic Balance Updates (7 tests)
Tests the `POST /time-deposits/update-balances` endpoint:
- Happy path with multiple deposits
- Empty database handling
- Zero balance deposits
- Response schema validation
- Multiple deposits of same plan
- Large dataset performance (50 deposits)
- Persistence verification

### 3. **api.boundaries.test.ts** - CRITICAL Business Rules (20 tests)
Tests precise boundary conditions for interest calculation:
- **30-day threshold** (all plans): days 29, 30, 31
- **45-day threshold** (premium): days 44, 45, 46
- **365-day cutoff** (student): days 100, 365, 366, 400, 1000
- Multiple plans at critical boundaries
- Edge cases near boundaries

### 4. **api.interest-calculations.test.ts** - Interest Rate Accuracy (20 tests)
Tests correct application of interest rates:
- **Basic plan**: 1% annual (0.01/12 monthly)
- **Student plan**: 3% annual (0.03/12 monthly)
- **Premium plan**: 5% annual (0.05/12 monthly)
- Plan comparisons with identical conditions
- Rounding and precision (up, down, exact half)
- Small and large balances
- Decimal precision

### 5. **api.withdrawals.test.ts** - Withdrawal Impact (13 tests)
Tests how withdrawals affect balances and interest:
- Single and multiple withdrawals
- Balance reduction verification
- Interest calculation on reduced balances
- Withdrawal history integrity
- Complex sequences (interest → withdrawal → interest)
- Large withdrawal percentages
- Date tracking

### 6. **api.compounding.test.ts** - Interest Compounding (14 tests)
Tests compounding behavior across multiple updates:
- Single vs multiple updates
- Compounding chains (2x, 3x, 5x updates)
- Compounding across all plan types
- Compounding with withdrawals
- Student plan cutoff after day 365
- Small vs large balances
- Compound vs simple interest verification

### 7. **api.e2e.test.ts** - End-to-End Lifecycles (10 tests)
Tests complete workflows:
- Full deposit lifecycle (create → update → withdraw → update)
- Multi-plan comparisons
- Complex withdrawal and interest sequences
- Boundary transition scenarios
- Multiple deposits with varied operations
- Rapid successive operations
- API contract validation

## Test Statistics

| Category | Tests | Focus Area |
|----------|-------|------------|
| Data Retrieval | 8 | GET endpoint |
| Basic Updates | 7 | POST endpoint basics |
| Boundaries | 20 | Critical business rules |
| Interest Calculations | 20 | Rate accuracy |
| Withdrawals | 13 | Balance impacts |
| Compounding | 14 | Multiple updates |
| End-to-End | 10 | Complete workflows |
| **TOTAL** | **92** | **Full API coverage** |

## Running the Tests

### Run All Integration Tests
```bash
bun test src/tests/integration/
```

### Run Specific Test Suite
```bash
# Data retrieval tests
bun test src/tests/integration/api.get-time-deposits.test.ts

# Boundary tests (CRITICAL)
bun test src/tests/integration/api.boundaries.test.ts

# Interest calculation tests
bun test src/tests/integration/api.interest-calculations.test.ts

# Withdrawal tests
bun test src/tests/integration/api.withdrawals.test.ts

# Compounding tests
bun test src/tests/integration/api.compounding.test.ts

# End-to-end tests
bun test src/tests/integration/api.e2e.test.ts
```

### Run with Watch Mode
```bash
bun test --watch src/tests/integration/
```

### Run All Tests (Including Unit Tests)
```bash
bun test
```

## Key Test Scenarios

### Critical Business Rule Coverage

#### 30-Day Threshold (All Plans)
- ✅ Day 29: NO interest
- ✅ Day 30: NO interest (threshold is exclusive)
- ✅ Day 31: Interest applied

#### Premium Plan 45-Day Threshold
- ✅ Day 44: NO interest
- ✅ Day 45: NO interest (threshold is exclusive)
- ✅ Day 46: Interest applied

#### Student Plan 365-Day Cutoff
- ✅ Day 365: Interest applied (last eligible day)
- ✅ Day 366: NO interest (after cutoff)
- ✅ Day 400+: NO interest

### Interest Rate Verification

For a balance of 10,000 at day 100:
- **Basic**: 10,000 × 0.01 / 12 = 8.33 → **10,008.33**
- **Student**: 10,000 × 0.03 / 12 = 25.00 → **10,025.00**
- **Premium**: 10,000 × 0.05 / 12 = 41.67 → **10,041.67**

### Rounding Precision
- Uses `Math.round((value + Number.EPSILON) * 100) / 100`
- Rounds to 2 decimal places (cents)
- Handles floating-point precision correctly

## Test Infrastructure

### Database Strategy
- **In-memory SQLite** for each test suite
- Fresh database created for each test via `beforeEach`
- Migrations applied automatically
- No test pollution between suites

### Test Isolation
- Each test is fully isolated
- Server instance created/destroyed per test
- No shared state between tests
- Parallel execution safe

### Assertion Helpers
- `toBeCloseTo(expected, decimals)` for floating-point comparisons
- Precision set to 2 decimal places for monetary values
- Tolerance accounts for rounding differences

## API Contract Compliance

All tests validate against the OpenAPI schema:

### GET /time-deposits Response
```typescript
{
  id: number
  planType: 'basic' | 'student' | 'premium'
  balance: number
  days: number
  withdrawals: Array<{
    id: number
    timeDepositId: number
    amount: number
    date: string (ISO 8601)
  }>
}[]
```

### POST /time-deposits/update-balances Response
```typescript
{
  updated: number
}
```

## Coverage Goals

- ✅ All API endpoints (2/2)
- ✅ All plan types (3/3)
- ✅ All critical boundaries
- ✅ All interest rates
- ✅ Withdrawal scenarios
- ✅ Compounding behavior
- ✅ Edge cases
- ✅ Error-free operation
- ✅ Schema compliance
- ✅ Business logic accuracy

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (in-memory database)
- No external dependencies
- Deterministic results
- Clear failure messages

## Extending the Tests

To add new test scenarios:

1. Choose appropriate test file based on category
2. Add test within relevant `describe` block
3. Follow naming convention: `Scenario X.Y: Description`
4. Use `toBeCloseTo()` for monetary value assertions
5. Include clear comments explaining expected calculations
6. Update this README with new test count

## Notes

- Tests use Bun's built-in test runner
- SQLite foreign keys are enabled (`PRAGMA foreign_keys = ON`)
- Migrations are located in `drizzle/migrations`
- All monetary calculations preserve 2-decimal precision
- Days calculation may vary by ±1 due to timing (tests account for this)
