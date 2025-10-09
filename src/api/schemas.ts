/**
 * OpenAPI/JSON Schema Definitions for Swagger UI and validation
 */

export const WithdrawalSchema = {
  type: 'object',
  properties: {
    id: { type: 'number', description: 'Withdrawal ID' },
    timeDepositId: { type: 'number', description: 'Associated time deposit ID' },
    amount: { type: 'number', description: 'Withdrawal amount' },
    date: { type: 'string', format: 'date-time', description: 'Withdrawal date' },
  },
  required: ['id', 'timeDepositId', 'amount', 'date'],
} as const

export const TimeDepositSchema = {
  type: 'object',
  properties: {
    id: { type: 'number', description: 'Time deposit ID' },
    planType: {
      type: 'string',
      description: 'Plan type (basic, student, or premium)',
      enum: ['basic', 'student', 'premium'],
    },
    balance: { type: 'number', description: 'Current balance' },
    days: { type: 'number', description: 'Number of days since deposit creation' },
    withdrawals: {
      type: 'array',
      items: WithdrawalSchema,
      description: 'Withdrawal history',
    },
  },
  required: ['id', 'planType', 'balance', 'days', 'withdrawals'],
} as const

export const UpdateBalancesResponseSchema = {
  type: 'object',
  properties: {
    updated: { type: 'number', description: 'Number of deposits updated' },
  },
  required: ['updated'],
} as const
