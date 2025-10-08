# Code Review Guide

This guide helps reviewers navigate the implementation systematically. The changes implement a complete Time Deposit API with database persistence while maintaining backward compatibility with existing domain logic.

## 📊 Change Overview

**Files Added**: ~15 new files  
**Tests Added**: 32 new tests (all passing)  
**Architecture**: Hexagonal (Ports & Adapters)  
**Breaking Changes**: ❌ None (verified by 22 guardrail tests)

---

## 🎯 Review Strategy

### Recommended Review Order

Review in **bottom-up** order to understand dependencies:

```
1. Domain Layer (what didn't change) ⚠️
2. Infrastructure Layer (database)
3. Application Layer (use cases)
4. API Layer (HTTP endpoints)
5. Tests & Documentation
```

---

## 📋 Step-by-Step Review Guide

### Step 1: Verify No Breaking Changes (5 minutes)

**⚠️ CRITICAL: Start here to ensure requirements are met**

```bash
# Run breaking change protection tests
bun test src/tests/BreakingChangeGuardrails.test.ts
```

**Expected**: All 22 tests pass ✅

**Review**: `src/tests/BreakingChangeGuardrails.test.ts`
- Lines 6-14: Documentation explains the purpose
- Lines 19-46: TimeDeposit class contract tests
- Lines 49-78: updateBalance() method signature tests
- Lines 80-152: Interest calculation behavior tests (CRITICAL)
- Lines 154-186: Mutation behavior tests

**What to check**:
- ❌ No modifications to `TimeDeposit.ts` (except potentially constructor signature fix)
- ❌ No modifications to `TimeDepositCalculator.ts` logic
- ✅ All interest rates work exactly as before (1%, 3%, 5%)
- ✅ Day thresholds unchanged (30, 45, 366)

---

### Step 2: Database Schema & Infrastructure (15 minutes)

**Files to Review**:

#### 2.1 Schema Definition
📄 `src/infrastructure/database/schema.ts`

**What to check**:
- Lines 9-14: `timeDeposits` table matches requirements (id, planType, days, balance)
- Lines 20-26: `withdrawals` table with foreign key to timeDeposits
- Line 24: Cascade delete behavior (proper cleanup)
- Lines 30-43: Relations for type-safe joins
- Lines 46-49: Type exports for use in application

**Key Questions**:
- ✅ Are all required fields present per INSTRUCTIONS.md lines 23-32?
- ✅ Is the foreign key constraint properly defined?
- ✅ Are TypeScript types properly exported?

#### 2.2 Database Connection
📄 `src/infrastructure/database/connection.ts`

**What to check**:
- Lines 17-28: Singleton pattern for database connection
- Line 21: Foreign keys enabled (required for SQLite)
- Lines 33-37: Test database factory (in-memory)
- Line 49: Type export for dependency injection

**Key Questions**:
- ✅ Is the singleton pattern implemented correctly?
- ✅ Are foreign keys enabled?
- ✅ Can tests use in-memory databases?

#### 2.3 Migrations
📄 `drizzle/migrations/0000_shocking_stranger.sql`

**What to check**:
- Lines 1-6: timeDeposits table creation
- Lines 8-14: withdrawals table with foreign key
- Line 13: CASCADE delete constraint

**Verify**: `bun run db:migrate` runs without errors

---

### Step 3: Repository Pattern (Hexagonal Architecture) (20 minutes)

#### 3.1 Port (Interface)
📄 `src/domain/ports/TimeDepositRepository.ts`

**What to check**:
- Lines 14-42: Repository interface defines all persistence operations
- Lines 47-73: DTOs separate from domain entities
- This is the **contract** that infrastructure implements

**Key Questions**:
- ✅ Does the interface follow Interface Segregation Principle?
- ✅ Are DTOs clearly separated from domain entities?
- ✅ Is the interface technology-agnostic (no Drizzle specifics)?

#### 3.2 Adapter (Implementation)
📄 `src/infrastructure/adapters/DrizzleTimeDepositRepository.ts`

**What to check**:
- Line 25: Constructor accepts database via dependency injection
- Lines 27-35: `findAll()` uses Drizzle's relational queries
- Lines 37-45: `findById()` with null handling
- Lines 47-60: `create()` returns domain entity (TimeDeposit)
- Lines 67-76: `updateBalances()` uses transaction for atomicity
- Lines 90-105: Mapping helper converts database records to DTOs

**Key Questions**:
- ✅ Does the adapter only depend on the port interface?
- ✅ Are database operations atomic (transactions)?
- ✅ Does it properly map between database records and domain objects?
- ✅ Are TypeScript types properly inferred?

#### 3.3 Repository Tests
📄 `src/tests/DrizzleTimeDepositRepository.test.ts`

**What to check**:
- Lines 20-29: Setup uses in-memory database (fast tests)
- Lines 31-186: All CRUD operations tested
- Lines 169-184: Foreign key cascade delete verified

**Verify**: `bun test src/tests/DrizzleTimeDepositRepository.test.ts`

**Expected**: 10/10 tests pass ✅

---

### Step 4: Application Layer (Use Cases) (10 minutes)

#### 4.1 Get All Time Deposits
📄 `src/application/usecases/GetAllTimeDeposits.ts`

**What to check**:
- Lines 14-19: Simple use case that delegates to repository
- Line 15: Depends on repository **interface** (not implementation)
- Line 17: Returns DTOs suitable for API response

**Key Questions**:
- ✅ Does it follow Single Responsibility Principle?
- ✅ Does it depend on abstractions (Dependency Inversion)?

#### 4.2 Update All Time Deposit Balances
📄 `src/application/usecases/UpdateAllTimeDepositBalances.ts`

**⚠️ CRITICAL: This is where existing logic is preserved**

**What to check**:
- Lines 18-22: Constructor accepts both repository and calculator
- Lines 24-52: Orchestration logic
  - Line 26: Fetch from database
  - Line 33: Convert to domain objects (TimeDeposit)
  - Line 37: **Use existing TimeDepositCalculator** (no new logic!)
  - Line 40: Extract updated balances
  - Line 46: Persist to database

**Key Questions**:
- ✅ Does it use the **existing** `TimeDepositCalculator.updateBalance()`?
- ✅ Does it maintain backward compatibility?
- ✅ Is the orchestration clear and logical?
- ❌ Does it introduce NEW interest calculation logic? (should be NO)

---

### Step 5: API Layer (20 minutes)

#### 5.1 OpenAPI Schemas
📄 `src/api/schemas.ts`

**What to check**:
- Lines 10-17: Withdrawal schema
- Lines 19-40: TimeDeposit schema (matches INSTRUCTIONS.md lines 13-18)
- Lines 42-47: Response schema for update endpoint

**Key Questions**:
- ✅ Do schemas match the required API response format?
- ✅ Are all fields from requirements present (id, planType, balance, days, withdrawals)?

#### 5.2 Routes
📄 `src/api/routes/timeDeposits.ts`

**⚠️ CRITICAL: Verify exactly 2 endpoints (INSTRUCTIONS.md line 50)**

**What to check**:
- Lines 24-42: GET /time-deposits endpoint
  - Line 30: OpenAPI documentation
  - Line 40: Delegates to use case
- Lines 50-70: POST /time-deposits/update-balances endpoint
  - Line 56: OpenAPI documentation
  - Line 68: Delegates to use case

**Key Questions**:
- ✅ Are there exactly 2 endpoints? (no more, no less)
- ✅ Do they match the requirements?
- ✅ Is there proper OpenAPI documentation?
- ✅ Do routes only delegate (no business logic)?

#### 5.3 Server Setup
📄 `src/api/server.ts`

**What to check**:
- Lines 10-18: Fastify configuration with logging
- Lines 21-23: CORS enabled
- Lines 26-50: Swagger/OpenAPI setup
- Lines 53-62: Swagger UI configuration

**Key Questions**:
- ✅ Is logging configured properly?
- ✅ Is Swagger UI accessible at /docs?
- ✅ Are appropriate middleware registered?

#### 5.4 Application Bootstrap
📄 `src/index.ts`

**What to check**:
- Lines 20-21: Infrastructure layer setup (database, repository)
- Lines 24-26: Application layer setup (use cases)
- Lines 29-35: API layer setup (server, routes)
- Lines 32-35: Dependency injection (use cases passed to routes)

**Key Questions**:
- ✅ Is dependency injection used (not service locator)?
- ✅ Are layers wired together correctly?
- ✅ Is the bootstrap clean and understandable?

---

### Step 6: End-to-End Verification (10 minutes)

**Manual Testing**:

```bash
# 1. Clean setup
rm -rf data/
bun run db:migrate
bun run db:seed

# 2. Start server
bun start

# 3. Test GET endpoint (in another terminal)
curl http://localhost:3000/time-deposits | jq

# Expected: Array of 6 deposits with withdrawals

# 4. Test POST endpoint
curl -X POST http://localhost:3000/time-deposits/update-balances | jq

# Expected: {"updated": 6}

# 5. Verify balances updated
curl http://localhost:3000/time-deposits | jq '[.[] | {id, planType, balance, days}]'

# Expected: Balances should reflect interest calculations
# - ID 1 (basic, 45 days): 1000 -> 1000.83
# - ID 3 (student, 100 days): 5000 -> 5012.50
# - ID 5 (premium, 60 days): 10000 -> 10041.67

# 6. Check Swagger UI
open http://localhost:3000/docs
```

---

## 🔍 Critical Areas Requiring Extra Attention

### 1. Breaking Change Protection (HIGHEST PRIORITY)

**File**: `src/tests/BreakingChangeGuardrails.test.ts`

**Why Critical**: This ensures requirement compliance (INSTRUCTIONS.md lines 41-43)

**What to verify**:
- All 22 tests pass
- Interest calculations produce exact same results
- No changes to `TimeDeposit` or `TimeDepositCalculator` classes

### 2. Use Case Orchestration

**File**: `src/application/usecases/UpdateAllTimeDepositBalances.ts`

**Why Critical**: This is where existing logic meets new persistence

**What to verify**:
- Uses existing `TimeDepositCalculator.updateBalance()` (line 37)
- No new interest calculation logic introduced
- Properly converts between database records and domain objects

### 3. Repository Transactions

**File**: `src/infrastructure/adapters/DrizzleTimeDepositRepository.ts`

**Why Critical**: Data consistency

**What to verify**:
- `updateBalances()` uses transactions (lines 69-75)
- Foreign key constraints enforced (connection.ts line 21)
- Cascade delete works (test line 179)

### 4. API Contract

**Files**: `src/api/routes/timeDeposits.ts`, `src/api/schemas.ts`

**Why Critical**: Public API must match requirements exactly

**What to verify**:
- Exactly 2 endpoints (no more)
- Response schema matches INSTRUCTIONS.md lines 13-18
- OpenAPI docs are accurate

---

## 🏗️ Architecture Verification

### Hexagonal Architecture Checklist

- ✅ **Domain Layer** is independent (no infrastructure imports)
- ✅ **Ports** define what domain needs (interfaces in `domain/ports/`)
- ✅ **Adapters** implement ports (in `infrastructure/adapters/`)
- ✅ **Use Cases** orchestrate domain logic (in `application/usecases/`)
- ✅ **API** only calls use cases (no direct repository access)
- ✅ **Dependency flow**: API → Application → Domain ← Infrastructure

### SOLID Principles Checklist

- ✅ **Single Responsibility**: Each class has one reason to change
- ✅ **Open/Closed**: New plan types can be added without modifying existing code
- ✅ **Liskov Substitution**: Repository implementations are interchangeable
- ✅ **Interface Segregation**: Focused, minimal interfaces
- ✅ **Dependency Inversion**: High-level depends on abstractions (ports)

---

## ⚠️ Common Review Pitfalls

### 1. Don't Get Lost in Drizzle ORM Details
**Focus on**: Does the repository implement the port interface correctly?  
**Not on**: Specific Drizzle syntax (that's an implementation detail)

### 2. Don't Review Files Individually
**Instead**: Follow the request flow:
```
HTTP Request → Route → Use Case → Repository → Database
```

### 3. Don't Skip the Tests
**Tests are documentation**:
- `BreakingChangeGuardrails.test.ts` shows what must not change
- `DrizzleTimeDepositRepository.test.ts` shows expected repository behavior

### 4. Don't Ignore the OpenAPI Docs
**Verify by testing**: Visit `http://localhost:3000/docs` and try the endpoints

---

## ✅ Review Completion Checklist

### Requirements Compliance
- [ ] Breaking change tests all pass (22/22)
- [ ] Exactly 2 API endpoints implemented
- [ ] Database schema matches requirements
- [ ] Interest calculations unchanged
- [ ] OpenAPI/Swagger documentation available

### Architecture Quality
- [ ] Hexagonal architecture properly implemented
- [ ] SOLID principles followed
- [ ] Clear separation of concerns
- [ ] Dependency injection used throughout

### Code Quality
- [ ] All tests pass (33/33)
- [ ] No TypeScript errors
- [ ] Code is well-commented
- [ ] Naming is clear and consistent

### Functionality
- [ ] API endpoints work as expected
- [ ] Database persistence works
- [ ] Interest calculations correct
- [ ] Foreign key constraints enforced

### Documentation
- [ ] README.md is comprehensive
- [ ] IMPLEMENTATION_SUMMARY.md covers all requirements
- [ ] Code has helpful comments
- [ ] OpenAPI documentation is accurate

---

## 🎯 Key Takeaways

1. **No Breaking Changes**: The existing `TimeDepositCalculator` logic is preserved and reused
2. **Clean Architecture**: Hexagonal pattern with clear layer boundaries
3. **Type Safety**: TypeScript + Drizzle ORM throughout
4. **Well Tested**: 33 tests covering domain, infrastructure, and integration
5. **Self-Documenting**: OpenAPI/Swagger UI for interactive API exploration

---

## 📞 Questions for the Author

If anything is unclear during review, ask:

1. **"Why did you choose SQLite over PostgreSQL?"**
   - Answer: Bun has native support, zero infrastructure, meets requirements

2. **"Why no testcontainers?"**
   - Answer: SQLite in-memory databases are faster and simpler for this use case

3. **"How do I verify no breaking changes?"**
   - Answer: Run `bun test src/tests/BreakingChangeGuardrails.test.ts`

4. **"Can I add new plan types?"**
   - Answer: Yes, extend `TimeDepositCalculator` and add to schema enum

5. **"How do I run the full application?"**
   - Answer: See README.md "Quick Start" section

---

## 📊 Estimated Review Time

| Area | Time | Priority |
|------|------|----------|
| Breaking Change Verification | 5 min | 🔴 Critical |
| Database Schema & Tests | 15 min | 🟡 High |
| Repository Pattern | 20 min | 🟡 High |
| Use Cases | 10 min | 🟡 High |
| API Layer | 20 min | 🟠 Medium |
| End-to-End Testing | 10 min | 🟢 Low |
| Documentation Review | 10 min | 🟢 Low |
| **Total** | **~90 min** | |

**Quick Review Path (30 min)**:
1. Breaking change tests (5 min)
2. UpdateAllTimeDepositBalances use case (10 min)
3. API routes (5 min)
4. Manual endpoint testing (10 min)
