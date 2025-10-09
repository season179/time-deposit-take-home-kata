import { FastifyInstance } from 'fastify'
import { GetAllTimeDeposits } from '../../application/usecases/GetAllTimeDeposits'
import { UpdateAllTimeDepositBalances } from '../../application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositSchema, UpdateBalancesResponseSchema } from '../schemas'

/**
 * Time Deposits API Routes
 * 
 * Implements the 2 required endpoints (INSTRUCTIONS.md line 50):
 * - GET /time-deposits
 * - POST /time-deposits/update-balances
 */
export async function timeDepositRoutes(
  fastify: FastifyInstance,
  options: {
    getAllTimeDeposits: GetAllTimeDeposits
    updateAllTimeDepositBalances: UpdateAllTimeDepositBalances
  }
) {
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

  fastify.post(
    '/time-deposits/update-balances',
    {
      schema: {
        description: 'Update balances for all time deposits based on interest rates',
        tags: ['Time Deposits'],
        body: {
          type: 'object',
          additionalProperties: false,
        },
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
