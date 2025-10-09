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

### Solution: Event-Sourced Money Movement

I extended the schema beyond what INSTRUCTIONS.md specified (which only required `timeDeposits` and `withdrawals` tables). I added a `deposits` table to track money-in events:

```typescript
deposits:
  - id, timeDepositId (FK), amount, date
```

In this model, every time deposit has at least one deposit record representing the initial deposit when the account opens. Both deposits and withdrawals are immutable records. Balance is computed as the sum of all deposits minus the sum of all withdrawals plus accrued interest. Days are computed dynamically from the earliest deposit date.

To ensure data consistency, creating a time deposit inserts both a `timeDeposits` record and an initial `deposits` record in a single transaction. Similarly, withdrawals atomically insert a record and decrement the stored balance.

This approach gives us immutability where historical records never change, full auditability for compliance and reconciliation, and follows real-world patterns used in banking ledger systems. Most importantly, it maintains backward compatibility since the `TimeDeposit` class remains unchanged with computed values mapped only on read.

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

The server will start on `http://localhost:3000`

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

I created extensive tests to ensure correctness across multiple layers. The `BreakingChangeGuardrails.test.ts` suite locks down the `TimeDeposit` and `updateBalance()` signatures with over 20 test cases covering edge cases and validating interest calculation behavior. This prevents accidental breaking changes to the protected API.

The integration tests (`api.*.test.ts`) perform end-to-end API testing with real HTTP requests via Fastify, validating database transactions work correctly. The repository tests (`DrizzleTimeDepositRepository.test.ts`) focus on the database layer, verifying type-safe queries and edge case handling.

```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Specific suite
bun test src/tests/BreakingChangeGuardrails.test.ts
```

The test suite provides regression protection and serves as living documentation for the system's behavior.

## Database Schema

The database uses three tables with foreign key relationships:

```sql
timeDeposits (id, planType, days, balance)
deposits     (id, timeDepositId FK, amount, date)  -- Money-in events
withdrawals  (id, timeDepositId FK, amount, date)  -- Money-out events
```

The balance field is stored but updated atomically with withdrawals, while days is computed on read from the earliest deposit date. Both deposits and withdrawals are immutable audit logs that never change once created.

```bash
bun run db:migrate    # Run migrations
bun run db:seed       # Load sample data
bun run db:studio     # Open database GUI
```

---

## Tech Stack

The implementation uses Bun as the runtime (3-5x faster than Node with built-in TypeScript and test runner), Fastify as the web framework (high performance with plugin ecosystem and OpenAPI support), Drizzle as the ORM (type-safe with SQL-like API), SQLite as the database (zero setup with ACID compliance), and TypeScript as the language (type safety is critical for financial systems).

---

## Key Design Decisions

The main departure from the specification was adding the `deposits` table to track money-in events. This enables computing balance and days dynamically rather than storing them as static values. In financial systems, immutable event logs are standard practice for audit trails and reconciliation.

The architecture uses Hexagonal principles to isolate domain logic from infrastructure. This makes the core business rules testable independently and allows swapping implementations without affecting the domain layer.

All database operations use transactions to ensure consistency, and the schema includes foreign key constraints with cascade deletes. The breaking change guardrails protect the existing public API while allowing the system to evolve.

---

Thank you for reviewing my submission. I look forward to discussing my approach and technical decisions in the interview.
