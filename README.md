# XA Bank Time Deposit API

> Take-Home Assignment

This document outlines my implementation of the time deposit refactoring kata, including the approach, technical decisions, and reasoning behind key choices.

---

## My Approach

### Initial Setup: TypeScript + Bun

After forking the repository, I selected the TypeScript starter because I mainly use Typescript on my day job. I removed other language implementations to reduce noise and moved the original instructions into a separate INSTRUCTIONS.md file to keep the documentation organized.

For the runtime, I selected Bun, which offers significant performance improvements over Node.js while providing a built-in test runner, native TypeScript support, and eliminating compilation steps.

### Guardrails First: Test-Driven Constraints

The instructions were clear: the `TimeDeposit` class and `updateBalance()` method cannot be modified (INSTRUCTIONS.md lines 41-42). Before writing any implementation code, I created comprehensive test suites as guardrails.

The `BreakingChangeGuardrails.test.ts` suite protects the public API contract with over 20 test cases covering constructor signatures, property accessibility, method signatures, interest calculation behavior, and edge cases. In production systems, shared domain logic often serves multiple consumers, so tests act as executable contracts to prevent accidental breaking changes during refactoring.

### Database Choice: SQLite + Drizzle ORM

I chose SQLite for its zero infrastructure requirement, which allows for easy setup while maintaining production-ready patterns. It provides ACID transactions for data consistency and operates as a single portable file.

For the ORM layer, I selected Drizzle for its type safety with schema types that propagate throughout the codebase. It provides a SQL-like API with minimal abstraction, built-in migration management, and maintains a lightweight footprint.

### Critical Design Insight: Computed vs. Stored State

When implementing the two required APIs, I identified a design consideration. The specification requests static `balance` and `days` fields, but this approach presents some challenges in terms of how financial systems typically maintain state.

| Field | Spec | Reality |
|-------|------|---------|
| `balance` | Stored value | Should be computed from deposits, withdrawals, and accrued interest |
| `days` | Stored value | Should be computed from the account opening date |

Balance changes with every deposit and withdrawal, so storing it as a static value can create synchronization challenges. Similarly, days increases daily, requiring regular updates to stay current. Financial systems typically rely on immutable event logs for compliance and auditability, and computed values help eliminate drift between related tables.

### Solution: Event Sourcing with Chronological Replay

I extended the schema beyond what INSTRUCTIONS.md specified (which only required `timeDeposits` and `withdrawals` tables). I added two more tables to complete the event sourcing model:

```typescript
deposits:             - id, timeDepositId (FK), amount, date
interestApplications: - id, timeDepositId (FK), amount, date
```

A key consideration in this implementation is that **the order of events fundamentally matters**.

For example, with $1000 in an account: applying interest first (earning $0.83) then withdrawing $500 results in $500.83. However, withdrawing $500 first then applying interest (earning only $0.42 on the reduced balance) results in $500.42. The same operations in different order produce different final balances.

To address this, I implemented full event sourcing. Every financial event gets recorded as an immutable record: deposits for money coming in, withdrawals for money going out, and now interest applications for when interest gets calculated. The balance isn't just computed from deposits minus withdrawals anymore—it's computed by replaying all events in chronological order.

The `EventReplayService` merges all event types, sorts them by timestamp, and replays them sequentially. This provides an accurate current balance while maintaining a complete audit trail of every financial event. This approach aligns with how banking ledger systems typically operate.

Days are still computed dynamically from the earliest deposit date. All database operations use transactions to ensure consistency. And most importantly, this maintains backward compatibility—the `TimeDeposit` class remains completely unchanged.

---

## Architecture

I implemented Hexagonal Architecture (Ports & Adapters) with domain-driven design principles. The structure separates concerns into distinct layers:

```
src/
├── domain/                    # Domain layer (business rules)
│   └── ports/                 # Repository interfaces
├── application/               # Application layer (use cases)
│   └── usecases/             
├── infrastructure/            # Infrastructure layer (adapters)
│   ├── database/             # Database schema, connection, migrations
│   └── adapters/             # Repository implementations
├── api/                       # Presentation layer
│   ├── routes/               # HTTP routes
│   └── schemas.ts            # OpenAPI schemas
├── TimeDeposit.ts            # Core domain entity (PROTECTED)
└── TimeDepositCalculator.ts  # Core domain logic (PROTECTED)
```

This architecture keeps domain logic isolated from infrastructure concerns, making the system testable without database or HTTP dependencies. It also makes it easy to swap implementations if needed, like moving from SQLite to PostgreSQL or Fastify to Express.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0

### Installation

```bash
# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# (Optional) Seed sample data
bun run db:seed

# Start the server
bun start
```

The server will start on `http://localhost:3000` by default. If port 3000 is already in use, it will automatically find and use an available port, displaying the actual port in the startup message.

## API Endpoints

As required by INSTRUCTIONS.md (lines 10-18), I implemented exactly two APIs:

The GET `/time-deposits` endpoint retrieves all time deposits with their withdrawal history:

```bash
curl http://localhost:3000/time-deposits
```

The POST `/time-deposits/update-balances` endpoint updates balances using prorated daily interest calculation. Interest is calculated as `balance × (annualRate / 365) × daysElapsed`, where daysElapsed represents the number of days since the last interest application or account opening. This approach prevents unintended consequences from frequent API calls, as multiple calls within the same day result in zero additional interest due to the natural idempotency when no days have elapsed.

The interest calculation follows these rules: no interest is applied for the first 30 days on any plan. After that, the Basic plan earns 1% annual interest, the Student plan earns 3% annual interest (but only through day 365), and the Premium plan earns 5% annual interest after 45 days.

```bash
curl -X POST http://localhost:3000/time-deposits/update-balances
```

You can explore the API interactively through the Swagger UI at http://localhost:3000/docs.

---

## Testing Strategy

After implementing the event sourcing architecture, I developed comprehensive test scenarios organized into multiple categories to ensure the system handles edge cases correctly.

The core test categories cover event order scenarios, which prove that chronology matters. The tests show that deposit → interest → withdrawal gives you $500.83, while deposit → withdrawal → interest gives you $500.42. Same operations, different order, different results.

For boundary conditions, I tested all day thresholds (30, 45, 365 days) at boundary-1, boundary, and boundary+1 to catch potential off-by-one errors. Day 30 receives no interest while day 31 does. Day 365 for student plans still earns interest, but day 366 does not.

The extreme values tests range from $0.01 to $100 million to verify floating-point precision across different scales. One test performs 99 consecutive $1 withdrawals to verify balance computation accuracy.

I added multiple account scenarios to verify that batch processing works correctly. The system can handle 100 accounts in under a second, and each account is processed independently with proper isolation.

The real-world patterns tests simulate actual customer behavior: monthly savings plans, emergency withdrawals, account recovery after depletion, even comparing active vs passive investment strategies. These tests ensure the system handles what real users will actually do.

Finally, the data integrity tests verify that event replay is consistent and deterministic. The sum of all events always equals the final balance. The same events replayed multiple times always produce the same result.

Two additional test suites address critical system behaviors. The prorated interest tests verify that daily interest calculations work correctly and prevent scenarios where frequent endpoint calls would apply excessive interest. The idempotency tests ensure that multiple API calls on the same day result in zero additional interest since no days have elapsed, providing protection against accidental or malicious over-calling.

```bash
# Run all tests
bun test

# Run scenario tests
bun test src/tests/scenarios/

# Run specific category
bun test src/tests/scenarios/01-event-order.test.ts

# Breaking change guardrails
bun test src/tests/BreakingChangeGuardrails.test.ts
```

All 134 tests pass across 13 test files, providing comprehensive coverage of the system.

## Database Schema

The database evolved from the original three-table design to include a fourth table for interest application events:

```sql
timeDeposits         (id, planType, days, balance)
deposits             (id, timeDepositId FK, amount, date)  -- Money-in events
withdrawals          (id, timeDepositId FK, amount, date)  -- Money-out events
interestApplications (id, timeDepositId FK, amount, date)  -- Interest events
```

The balance field is still stored in the database, but now it's recomputed from events every time we update balances. Days is computed on the fly from the earliest deposit date whenever we read the data. The three event tables—deposits, withdrawals, and interest applications—are immutable audit logs. Once a record is written, it never changes. This gives us the complete event history needed to replay and reconstruct the balance at any point in time.

```bash
bun run db:migrate    # Run migrations
bun run db:seed       # Load sample data
```

---

## Tech Stack

The implementation uses Bun as the runtime (3-5x faster than Node with built-in TypeScript and test runner), Fastify as the web framework (high performance with plugin ecosystem and OpenAPI support), Drizzle as the ORM (type-safe with SQL-like API), SQLite as the database (zero setup with ACID compliance), and TypeScript as the language (type safety is critical for financial systems).

---

## Key Design Decisions

The most significant departure from the specification was implementing full event sourcing. Instead of only tracking withdrawals, the system tracks three types of events: deposits (money in), withdrawals (money out), and interest applications (when interest gets calculated and applied).

This matters because in financial systems, event sequence affects the final balance. Calculating interest on $1000 versus $500 produces different results. Replaying events in chronological order ensures accuracy while providing a complete audit trail for compliance. Every financial event is recorded and timestamped, which aligns with banking ledger practices and enables temporal queries such as "what was the balance on March 15th?"

For interest calculation, I implemented a prorated daily system that calculates interest as `balance × (annualRate / 365) × daysElapsed`. This addresses an important problem: without prorating, calling the update endpoint daily would apply a full month's interest every day, resulting in significantly excessive interest. The prorated approach ensures interest is proportional to actual time elapsed. When the endpoint is called multiple times on the same day, daysElapsed equals zero, so no additional interest is applied. This provides natural idempotency without requiring additional state tracking or locks.

The implementation follows Hexagonal Architecture to keep domain logic isolated from infrastructure concerns. The domain layer defines interfaces like `TimeDepositRepository`, while the infrastructure layer implements them with `DrizzleTimeDepositRepository`. This separation allows the core business rules to be tested independently of the database and enables swapping implementations (e.g., SQLite to PostgreSQL) without modifying domain logic.

For data integrity, all database operations use transactions. The `EventReplayService` ensures balance computation is deterministic, meaning replaying the same events always produces the same result. The breaking change guardrails protect the existing `TimeDepositCalculator` API, allowing the system to evolve without breaking existing consumers.

---

Thank you for reviewing my submission. I look forward to discussing my approach and technical decisions in the interview.
