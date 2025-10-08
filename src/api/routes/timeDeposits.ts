import { FastifyInstance } from 'fastify'
import { GetAllTimeDeposits } from '../../application/usecases/GetAllTimeDeposits'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositSchema, UpdateBalancesResponseSchema } from '../schemas'

/**
 * Time Deposits API Routes
 * 
 * Implements exactly 2 endpoints as required by INSTRUCTIONS.md line 50:
 * 1. GET /time-deposits - Retrieve all time deposits
 * 2. POST /time-deposits/update-balances - Update balances of all time deposits
 */
export async function timeDepositRoutes(
  fastify: FastifyInstance,
  options: {
    getAllTimeDeposits: GetAllTimeDeposits
    updateAllTimeDepositBalances: UpdateAllTimeDepositBalances
  }
) {
  /**
   * GET /time-deposits
   * 
   * Returns all time deposits with their withdrawal history.
   * Schema matches INSTRUCTIONS.md lines 13-18
   */
  fastify.get(
    '/time-deposits',
    {
      schema: {
        description: 'Retrieve all time deposits with withdrawal history',
        tags: ['Time Deposits'],
        response: {
          200: {
            description: 'List of all time deposits',
            type: 'array',
            items: TimeDepositSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const deposits = await options.getAllTimeDeposits.execute()
      return deposits
    }
  )

  /**
   * POST /time-deposits/update-balances
   * 
   * Updates the balances of all time deposits based on their plan type and days.
   * This endpoint applies the interest calculation logic to all deposits in the database.
   */
  fastify.post(
    '/time-deposits/update-balances',
    {
      schema: {
        description: 'Update balances for all time deposits based on interest rates',
        tags: ['Time Deposits'],
        response: {
          200: {
            description: 'Balance update result',
            ...UpdateBalancesResponseSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const result = await options.updateAllTimeDepositBalances.execute()
      return result
    }
  )
}
