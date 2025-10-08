import { db } from './connection'
import { timeDeposits, withdrawals } from './schema'

/**
 * Database Seeder
 * 
 * Populates the database with sample data for testing and demonstration
 */

async function seed() {
  console.log('🌱 Seeding database...')

  try {
    // Create sample time deposits
    const deposits = await db
      .insert(timeDeposits)
      .values([
        { planType: 'basic', days: 45, balance: 1000 },
        { planType: 'basic', days: 30, balance: 2000 },
        { planType: 'student', days: 100, balance: 5000 },
        { planType: 'student', days: 366, balance: 3000 },
        { planType: 'premium', days: 60, balance: 10000 },
        { planType: 'premium', days: 45, balance: 7500 },
      ])
      .returning()

    console.log(`✅ Created ${deposits.length} time deposits`)

    // Add some sample withdrawals
    await db.insert(withdrawals).values([
      {
        timeDepositId: deposits[0].id,
        amount: 100,
        date: new Date('2024-01-15'),
      },
      {
        timeDepositId: deposits[0].id,
        amount: 50,
        date: new Date('2024-02-01'),
      },
      {
        timeDepositId: deposits[2].id,
        amount: 500,
        date: new Date('2024-01-20'),
      },
    ])

    console.log('✅ Created sample withdrawals')
    console.log('🌱 Database seeded successfully!')
  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  }
}

seed()
