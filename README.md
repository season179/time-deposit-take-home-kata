# XA Bank Time Deposit API

A RESTful API for managing time deposit accounts with automated interest calculation.

## 🏗️ Architecture

This project implements **Hexagonal Architecture** (Ports & Adapters) with clear separation of concerns:

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
├── TimeDeposit.ts            # Core domain entity (DO NOT MODIFY)
└── TimeDepositCalculator.ts  # Core domain logic (DO NOT MODIFY)
```

## 🚀 Quick Start

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

## 📡 API Endpoints

### Interactive Documentation

Access the Swagger UI at: **http://localhost:3000/docs**

### Endpoints

#### 1. GET `/time-deposits`

Retrieves all time deposits with their withdrawal history.

**Response:**
```json
[
  {
    "id": 1,
    "planType": "basic",
    "balance": 1000.83,
    "days": 45,
    "withdrawals": [
      {
        "id": 1,
        "timeDepositId": 1,
        "amount": 100,
        "date": "2024-01-15T00:00:00.000Z"
      }
    ]
  }
]
```

**Example:**
```bash
curl http://localhost:3000/time-deposits
```

#### 2. POST `/time-deposits/update-balances`

Updates balances for all time deposits based on their plan type and days.

**Interest Rates:**
- **Basic Plan**: 1% annual interest (applied after 30 days)
- **Student Plan**: 3% annual interest (no interest after 1 year)
- **Premium Plan**: 5% annual interest (starts after 45 days)

**Response:**
```json
{
  "updated": 6
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/time-deposits/update-balances
```

## 🧪 Testing

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test suite
bun test src/tests/BreakingChangeGuardrails.test.ts
bun test src/tests/DrizzleTimeDepositRepository.test.ts
```

### Test Suites

1. **BreakingChangeGuardrails.test.ts** - Ensures no breaking changes to core domain logic
2. **DrizzleTimeDepositRepository.test.ts** - Integration tests for database layer
3. **TimeDepositCalculator.test.ts** - Unit tests for interest calculation

## 🗄️ Database

This project uses **SQLite** with **Drizzle ORM** for:
- Type-safe database queries
- Migration management
- Zero infrastructure setup

### Database Scripts

```bash
# Generate migrations from schema changes
bun run db:generate

# Run pending migrations
bun run db:migrate

# Seed sample data
bun run db:seed

# Open Drizzle Studio (database GUI)
bun run db:studio
```

### Schema

**timeDeposits**
- `id` (integer, primary key)
- `planType` (text, required)
- `days` (integer, required) - Computed from earliest deposit date on read
- `balance` (real, required) - Running total: deposits - withdrawals + accrued interest

**deposits** (Money-in events)
- `id` (integer, primary key)
- `timeDepositId` (integer, foreign key → timeDeposits.id, cascade delete)
- `amount` (real, required)
- `date` (timestamp, required)

**withdrawals** (Money-out events)
- `id` (integer, primary key)
- `timeDepositId` (integer, foreign key → timeDeposits.id, cascade delete)
- `amount` (real, required)
- `date` (timestamp, required)

### Money-Movement Model

The system tracks all money movements as immutable event records:

- **Deposits**: Track all money-in events (including the initial deposit when an account is opened)
- **Withdrawals**: Track all money-out events
- **Balance Computation**: The `balance` field in `timeDeposits` is a running total that reflects:
  - Sum of all deposits
  - Minus sum of all withdrawals
  - Plus accrued interest from the `updateBalance` operation
- **Days Computation**: Instead of storing a static `days` value, the system computes it dynamically from the earliest deposit date:
  - `days = floor((today - earliestDepositDate) / 1 day)`
  - This ensures accurate time-based interest calculations without manual upkeep

**Atomicity Guarantees:**
- Creating a time deposit inserts both a `timeDeposits` record and an initial `deposits` record in a single transaction
- Adding a withdrawal inserts a `withdrawals` record and decrements the stored balance atomically

## 🛡️ Breaking Change Protection

The `BreakingChangeGuardrails.test.ts` suite protects critical contracts:
- ✅ `TimeDeposit` class signature
- ✅ `TimeDepositCalculator.updateBalance()` method signature
- ✅ Interest calculation behavior
- ✅ Mutation semantics

**Never modify these tests to make them pass** - they represent the public API contract.

## 🔧 Development

```bash
# Start development server with hot reload
bun run dev
```

## 📦 Tech Stack

- **Runtime**: Bun
- **Web Framework**: Fastify
- **ORM**: Drizzle ORM
- **Database**: SQLite
- **API Documentation**: OpenAPI 3.0 / Swagger
- **Language**: TypeScript

## 📝 Design Principles

- **SOLID Principles** - Single Responsibility, Open/Closed, Dependency Inversion
- **Hexagonal Architecture** - Domain-centric design with adapters
- **Type Safety** - Full TypeScript coverage with strict mode
- **Contract-First API** - OpenAPI schema definitions
- **Test-Driven** - Breaking change protection and integration tests

## 📄 License

MIT
