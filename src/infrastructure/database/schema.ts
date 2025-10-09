import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

/**
 * Time Deposits Table
 * 
 * Stores all time deposit plans according to INSTRUCTIONS.md requirements (lines 23-27)
 */
export const timeDeposits = sqliteTable('timeDeposits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planType: text('planType').notNull(), // 'basic' | 'student' | 'premium'
  days: integer('days').notNull(),
  balance: real('balance').notNull(), // SQLite real type for decimal values
})

/**
 * Deposits Table
 * 
 * Tracks deposit (money-in) history for time deposits.
 * Every time deposit must have at least one deposit record (the initial deposit).
 * The earliest deposit date is used to compute the account age (days).
 */
export const deposits = sqliteTable('deposits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timeDepositId: integer('timeDepositId')
    .notNull()
    .references(() => timeDeposits.id, { onDelete: 'cascade' }), // Foreign key with cascade delete
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(), // SQLite stores dates as integers (Unix timestamp)
})

/**
 * Withdrawals Table
 * 
 * Tracks withdrawal history for time deposits (INSTRUCTIONS.md lines 28-32)
 */
export const withdrawals = sqliteTable('withdrawals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timeDepositId: integer('timeDepositId')
    .notNull()
    .references(() => timeDeposits.id, { onDelete: 'cascade' }), // Foreign key with cascade delete
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(), // SQLite stores dates as integers (Unix timestamp)
})

/**
 * Interest Applications Table
 * 
 * Tracks interest application events for event sourcing.
 * Every time interest is calculated and applied, a record is created here.
 * This enables proper event replay to compute accurate balances.
 */
export const interestApplications = sqliteTable('interestApplications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timeDepositId: integer('timeDepositId')
    .notNull()
    .references(() => timeDeposits.id, { onDelete: 'cascade' }), // Foreign key with cascade delete
  amount: real('amount').notNull(), // Interest amount applied
  date: integer('date', { mode: 'timestamp' }).notNull(), // When interest was applied
})

/**
 * Relations for type-safe joins
 */
export const timeDepositsRelations = relations(timeDeposits, ({ many }) => ({
  deposits: many(deposits),
  withdrawals: many(withdrawals),
  interestApplications: many(interestApplications),
}))

export const depositsRelations = relations(deposits, ({ one }) => ({
  timeDeposit: one(timeDeposits, {
    fields: [deposits.timeDepositId],
    references: [timeDeposits.id],
  }),
}))

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  timeDeposit: one(timeDeposits, {
    fields: [withdrawals.timeDepositId],
    references: [timeDeposits.id],
  }),
}))

export const interestApplicationsRelations = relations(interestApplications, ({ one }) => ({
  timeDeposit: one(timeDeposits, {
    fields: [interestApplications.timeDepositId],
    references: [timeDeposits.id],
  }),
}))

// Type exports for use throughout the application
export type TimeDepositRecord = typeof timeDeposits.$inferSelect
export type NewTimeDepositRecord = typeof timeDeposits.$inferInsert
export type DepositRecord = typeof deposits.$inferSelect
export type NewDepositRecord = typeof deposits.$inferInsert
export type WithdrawalRecord = typeof withdrawals.$inferSelect
export type NewWithdrawalRecord = typeof withdrawals.$inferInsert
export type InterestApplicationRecord = typeof interestApplications.$inferSelect
export type NewInterestApplicationRecord = typeof interestApplications.$inferInsert
