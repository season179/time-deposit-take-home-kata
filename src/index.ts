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

    // Start server with automatic port fallback
    const preferredPort = Number(process.env.PORT) || 3000
    const host = process.env.HOST || '0.0.0.0'
    let actualPort = preferredPort

    try {
      await server.listen({ port: preferredPort, host })
    } catch (error: any) {
      // If preferred port is in use, try any available port
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${preferredPort} is in use, finding an available port...`)
        await server.listen({ port: 0, host })
        actualPort = (server.server.address() as any).port
      } else {
        throw error
      }
    }

    console.log(`Server running at: http://localhost:${actualPort}`);
    console.log(`Swagger UI: http://localhost:${actualPort}/docs`);
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

bootstrap()
