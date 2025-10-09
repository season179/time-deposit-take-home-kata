import { db } from './connection'
import { timeDeposits, deposits, withdrawals } from './schema'

/**
 * Database Seeder - populates with sample data
 * Run: bun src/infrastructure/database/seed.ts
 */

async function seed() {
  console.log('🌱 Seeding database...')

  try {
    const today = new Date()
    
    const seedData = [
      { planType: 'basic', days: 45, balance: 1000 },
      { planType: 'basic', days: 30, balance: 2000 },
      { planType: 'student', days: 100, balance: 5000 },
      { planType: 'student', days: 366, balance: 3000 },
      { planType: 'premium', days: 60, balance: 10000 },
      { planType: 'premium', days: 45, balance: 7500 },
    ]

    const createdDeposits = await db
      .insert(timeDeposits)
      .values(seedData)
      .returning()

    console.log(`✅ Created ${createdDeposits.length} time deposits`)
    
    const initialDeposits = createdDeposits.map((td, index) => {
      const depositDate = new Date(today)
      depositDate.setDate(depositDate.getDate() - seedData[index].days)
      
      return {
        timeDepositId: td.id,
        amount: td.balance,
        date: depositDate,
      }
    })
    
    await db.insert(deposits).values(initialDeposits)
    console.log(`✅ Created ${initialDeposits.length} initial deposit records`)

    await db.insert(withdrawals).values([
      {
        timeDepositId: createdDeposits[0].id,
        amount: 100,
        date: new Date('2024-01-15'),
      },
      {
        timeDepositId: createdDeposits[0].id,
        amount: 50,
        date: new Date('2024-02-01'),
      },
      {
        timeDepositId: createdDeposits[2].id,
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
