import type { Config } from 'drizzle-kit'

export default {
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || './data/timedeposits.db',
  },
} satisfies Config
