# Time Deposit Refinement Plan

This plan assumes we cannot clarify requirements further (take-home constraints). We will introduce inflow tracking, keep the public contracts untouched, and make balances/days consistent before applying the existing calculator.

## Goals

1. Preserve the public `TimeDeposit` class and `TimeDepositCalculator.updateBalance` behavior.
2. Track money-in vs. money-out explicitly.
3. Ensure `days` reflects elapsed time without manual upkeep.
4. Deliver API responses that match the assignment contract.

## Key Assumptions

- `balance` in the API represents “current available balance” (principal + accrued interest – withdrawals).
- `withdrawals` are immutable audit events; we will introduce symmetric inflow events via a new `deposits` table.
- Every time deposit is opened via a deposit record; the earliest deposit date acts as the account start date.
- We can evolve the database schema and repository internals as long as the public API surface stays the same.

## Implementation Outline

### 1. Database Schema Changes

- Add a new `deposits` table:
  - Columns: `id` (PK, auto-increment), `timeDepositId` (FK → `timeDeposits.id`, cascade delete), `amount` (decimal), `date` (timestamp).
- Update existing migrations/new migration to include the above changes.
- Adjust `seed.ts` to populate `deposits` rows that mirror the original balances and assign deposit dates that reproduce the original `days` offsets (e.g., earliest deposit = `today - days`).

### 2. Balance Computation Strategy

- Keep `timeDeposits.balance` as the authoritative running balance (deposits – withdrawals + prior interest).
- Ensure movement handlers mutate `timeDeposits.balance` whenever deposits or withdrawals are recorded so stored balances reflect event timing.
- Before calculating interest:
  1. Load each aggregate with its related `deposits` and `withdrawals` rows (for DTO completeness and earliest-date lookup).
  2. Derive `days = floor((today - earliestDepositDate) / 1 day)`.
  3. Build `TimeDeposit` objects using the persisted `balance` and derived `days`.
- After `updateBalance` runs, persist the mutated balances back to `timeDeposits` in a transaction.

### 3. Repository & Use Case Updates

- Extend `DrizzleTimeDepositRepository` to join/aggregate `deposits` and `withdrawals` when building DTOs.
- Add helper methods to compute principal and `days` before constructing `TimeDeposit` objects.
- Ensure `create` persists both the starting row in `timeDeposits` (with zero balance initially) and a matching `deposits` record for the initial amount/opening date.
- Ensure withdrawal creation continues to insert into `withdrawals` and decrements the stored balance atomically.

### 4. API Layer

- `GET /time-deposits` remains unchanged, but the underlying repository now returns balances based on aggregated movements + interest.
- `POST /time-deposits/update-balances` uses the same use case; only the repository internals change to provide accurate inputs.

### 5. Testing Strategy

- Update/extend repository integration tests:
  - Verify principal computation using seeded deposits/withdrawals.
  - Confirm `days` recomputation uses the earliest deposit date.
- Add a use case test covering the full flow: create deposit, add withdrawal, run balance update, confirm final balance matches expectations.
- Ensure breaking-change guardrails continue to pass.

### 6. Documentation & Developer Notes

- Update README or a dedicated section to explain the money-movement model and how `timeDeposits.balance` is derived.
- Document the assumption that `balance` is net of withdrawals plus accrued interest.
- Mention the new tables/columns and seed behavior so reviewers can follow along quickly.

### 7. Migration/Deployment Steps

- Generate and run new migration (`bun run db:generate`, `bun run db:migrate`).
- Re-seed the database for local testing (`bun run db:seed`).
- Execute the full test suite (`bun test`).

## Out of Scope / Open Questions

- Scheduled jobs or background tasks to automate daily recalculation (not required for the kata but now enabled via earliest deposit dates).
- Multi-currency handling or interest compounding frequency changes.
- API endpoints for creating deposits/withdrawals (assignment only requires read + bulk update).


