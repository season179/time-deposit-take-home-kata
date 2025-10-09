# XA Bank Time Deposit API

> Take-Home Assignment

This is my implementation of the time deposit refactoring kata. I've documented my approach, technical decisions, and the reasoning behind them.

---

## My Approach

### Initial Setup: TypeScript + Bun

After forking the repository, I chose the TypeScript starter since I work with TypeScript daily and it provides the type safety that's critical for financial systems. I cleaned up the repository by removing other language implementations to reduce noise and maintain focus. I also moved the original instructions from the README into a separate INSTRUCTIONS.md file to keep the documentation organized.

For the runtime, I selected Bun. The requirements didn't prohibit it, and Bun is significantly faster than Node.js and npm while offering a built-in test runner, native TypeScript support, and an overall better developer experience without compilation steps.

### Guardrails First: Test-Driven Constraints

The instructions were clear: the `TimeDeposit` class and `updateBalance()` method cannot be modified (INSTRUCTIONS.md lines 41-42). Before writing any implementation code, I created comprehensive test suites as guardrails.

The `BreakingChangeGuardrails.test.ts` suite locks down the public API contract with over 20 test cases covering constructor signatures, property accessibility, method signatures, interest calculation behavior, and edge cases. This matters because in production systems, shared domain logic often serves multiple consumers. Tests act as executable contracts that prevent accidental breaking changes during refactoring.

### Database Choice: SQLite + Drizzle ORM

I chose SQLite for its zero infrastructure requirement, which is perfect for a kata while still using production-ready patterns. It provides ACID transactions for data consistency and comes as a single portable file that's easy to review.

For the ORM layer, I selected Drizzle because it's type-safe with schema types that propagate throughout the codebase. It uses a SQL-like API with minimal abstraction for better performance, includes built-in migration management, and stays lightweight without the overhead of heavier ORMs.

### Critical Design Insight: Computed vs. Stored State

When implementing the two required APIs, I noticed a fundamental issue. The spec asks for static `balance` and `days` fields, but this doesn't reflect how real-world financial systems work.

| Field | Spec | Reality |
|-------|------|---------|
| `balance` | Stored value | Should be computed from deposits, withdrawals, and accrued interest |
| `days` | Stored value | Should be computed from the account opening date |

Consider this: balance changes with every deposit and withdrawal. Storing it as a static value creates synchronization issues between tables. Similarly, days increases daily, which would require nightly batch jobs to keep current. Financial systems need immutable event logs for compliance and auditability. Computed values eliminate the drift that inevitably happens between related tables.

### Solution: Event Sourcing with Chronological Replay

I extended the schema beyond what INSTRUCTIONS.md specified (which only required `timeDeposits` and `withdrawals` tables). I added two more tables to complete the event sourcing model:

```typescript
deposits:             - id, timeDepositId (FK), amount, date
interestApplications: - id, timeDepositId (FK), amount, date
```

Here's the key insight I discovered while implementing this: **the order of events fundamentally matters**. Let me show you why.

Imagine you have $1000 in your account. If you apply interest first (earning $0.83) and then withdraw $500, you end up with $500.83. But if you withdraw $500 first and then apply interest (earning only $0.42 on the reduced balance), you end up with $500.42. Same operations, different order, different final balance.

This is why I implemented full event sourcing. Every financial event gets recorded as an immutable record: deposits for money coming in, withdrawals for money going out, and now interest applications for when interest gets calculated. The balance isn't just computed from deposits minus withdrawals anymore—it's computed by replaying all events in chronological order.

I created an `EventReplayService` that merges all event types, sorts them by timestamp, and replays them sequentially. This gives us the accurate current balance while maintaining a complete audit trail of every single financial event that ever happened to the account. It's exactly how real banking ledger systems work.

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

The POST `/time-deposits/update-balances` endpoint updates balances using the `TimeDepositCalculator.updateBalance()` method. The interest calculation follows these rules: no interest is applied for the first 30 days on any plan. After that, the Basic plan earns 1% annual interest, the Student plan earns 3% annual interest (but only through day 365), and the Premium plan earns 5% annual interest after 45 days.

```bash
curl -X POST http://localhost:3000/time-deposits/update-balances
```

You can explore the API interactively through the Swagger UI at http://localhost:3000/docs.

---

## Testing Strategy

After implementing the event sourcing architecture, I realized I needed to be absolutely certain it handles every possible edge case. So I went deep on testing—really deep. I ended up writing 74 comprehensive test scenarios organized into 6 categories.

The first category tests **event order scenarios**, which is THE core requirement. I wanted to prove beyond doubt that chronology matters. The tests show that deposit → interest → withdrawal gives you $500.83, while deposit → withdrawal → interest gives you $500.42. Same operations, different order, different results.

For **boundary conditions**, I tested all the day thresholds (30, 45, 365 days) at boundary-1, boundary, and boundary+1. You know those subtle off-by-one bugs that can slip through? These tests catch them. Day 30 gets no interest, but day 31 does. Day 365 for student plans still earns interest, but day 366 doesn't.

The **extreme values** tests go from $0.01 all the way up to $100 million. I wanted to make sure floating-point precision works correctly whether you're dealing with pennies or millions. There's even a test that does 99 consecutive $1 withdrawals to verify the balance computation stays accurate.

I added **multiple account scenarios** to verify that batch processing works correctly. The system can handle 100 accounts in under a second, and each account is processed independently with proper isolation.

The **real-world patterns** tests simulate actual customer behavior: monthly savings plans, emergency withdrawals, account recovery after depletion, even comparing active vs passive investment strategies. These tests ensure the system handles what real users will actually do.

Finally, the **data integrity** tests verify that event replay is consistent and deterministic. The sum of all events always equals the final balance. The same events replayed multiple times always produce the same result.

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

All 74 scenario tests pass, plus the 33 core tests from earlier, giving us 107 total tests passing.

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

The biggest departure from the specification was going all-in on event sourcing. Instead of just tracking withdrawals, I track three types of events: deposits (money in), withdrawals (money out), and interest applications (when interest gets calculated and applied).

Why does this matter? Because in financial systems, event sequence affects the final balance. If you calculate interest on $1000 versus $500, you get different results. The only way to get this right is to replay events in chronological order. This also gives us a complete audit trail for compliance—every single financial event is recorded and timestamped. It's exactly how real banking ledger systems work, and it even enables temporal queries if we ever need to answer "what was the balance on March 15th?"

I stuck with Hexagonal Architecture to keep domain logic isolated from infrastructure concerns. The domain layer defines interfaces like `TimeDepositRepository`, and the infrastructure layer implements them with `DrizzleTimeDepositRepository`. This means the core business rules are testable independently of the database, and we could swap out SQLite for PostgreSQL without touching the domain logic.

For data integrity, every database operation uses transactions. The `EventReplayService` ensures balance computation is deterministic—replaying the same events always produces the same result. And the breaking change guardrails I set up at the beginning protect the existing `TimeDepositCalculator` API, so the system can evolve without breaking existing consumers.

---

Thank you for reviewing my submission. I look forward to discussing my approach and technical decisions in the interview.
