import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import cors from '@fastify/cors'

/**
 * Create and configure Fastify server with OpenAPI/Swagger support
 */
export async function createServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  })

  // Register CORS
  await fastify.register(cors, {
    origin: true, // Allow all origins in development
  })

  // Register Swagger/OpenAPI
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'XA Bank Time Deposit API',
        description: 'RESTful API for managing time deposit accounts and calculating interest',
        version: '1.0.0',
      },
      tags: [
        {
          name: 'Time Deposits',
          description: 'Time deposit management endpoints',
        },
      ],
    },
  })

  // Register Swagger UI
  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  })

  // Health check endpoint (not counted as one of the two required endpoints)
  fastify.get('/health', {
    schema: {
      hide: true, // Hide from Swagger docs
    },
    handler: async () => ({ status: 'ok' }),
  })

  return fastify
}
