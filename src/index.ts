import { createServer } from './api/server'
import { timeDepositRoutes } from './api/routes/timeDeposits'
import { db } from './infrastructure/database/connection'
import { DrizzleTimeDepositRepository } from './infrastructure/adapters/DrizzleTimeDepositRepository'
import { GetAllTimeDeposits } from './application/usecases/GetAllTimeDeposits'
import { UpdateAllTimeDepositBalances } from './application/usecases/UpdateAllTimeDepositBalances'
import { TimeDepositCalculator } from './TimeDepositCalculator'

/**
 * Application Bootstrap
 * 
 * Wires together all layers of the hexagonal architecture:
 * - Infrastructure: Database connection, Repository adapter
 * - Application: Use cases
 * - API: HTTP routes
 */

async function bootstrap() {
  try {
    // === Infrastructure Layer ===
    const repository = new DrizzleTimeDepositRepository(db)

    // === Application Layer ===
    const calculator = new TimeDepositCalculator()
    const getAllTimeDeposits = new GetAllTimeDeposits(repository)
    const updateAllTimeDepositBalances = new UpdateAllTimeDepositBalances(repository, calculator)

    // === API Layer ===
    const server = await createServer()

    // Register routes with dependency injection
    await server.register(timeDepositRoutes, {
      getAllTimeDeposits,
      updateAllTimeDepositBalances,
    })

    // Start server
    const port = Number(process.env.PORT) || 3000
    const host = process.env.HOST || '0.0.0.0'

    await server.listen({ port, host })

    console.log(`
╔═══════════════════════════════════════════════════╗
║  🏦 XA Bank Time Deposit API                      ║
╠═══════════════════════════════════════════════════╣
║  Server running at: http://localhost:${port}       ║
║  Swagger UI: http://localhost:${port}/docs         ║
╚═══════════════════════════════════════════════════╝
    `)
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

bootstrap()
