import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

/**
 * Time Deposits Table (INSTRUCTIONS.md lines 23-27)
 */
export const timeDeposits = sqliteTable('timeDeposits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planType: text('planType').notNull(),
  days: integer('days').notNull(),
  balance: real('balance').notNull(),
})

/**
 * Deposits Table - Tracks deposit history; earliest date determines account age
 */
export const deposits = sqliteTable('deposits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timeDepositId: integer('timeDepositId')
    .notNull()
    .references(() => timeDeposits.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
})

/**
 * Withdrawals Table (INSTRUCTIONS.md lines 28-32)
 */
export const withdrawals = sqliteTable('withdrawals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timeDepositId: integer('timeDepositId')
    .notNull()
    .references(() => timeDeposits.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
})

/**
 * Interest Applications Table - Event sourcing for interest calculations
 */
export const interestApplications = sqliteTable('interestApplications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timeDepositId: integer('timeDepositId')
    .notNull()
    .references(() => timeDeposits.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
})

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

export type TimeDepositRecord = typeof timeDeposits.$inferSelect
export type NewTimeDepositRecord = typeof timeDeposits.$inferInsert
export type DepositRecord = typeof deposits.$inferSelect
export type NewDepositRecord = typeof deposits.$inferInsert
export type WithdrawalRecord = typeof withdrawals.$inferSelect
export type NewWithdrawalRecord = typeof withdrawals.$inferInsert
export type InterestApplicationRecord = typeof interestApplications.$inferSelect
export type NewInterestApplicationRecord = typeof interestApplications.$inferInsert
