import { pool, seedUserDefaults } from '../server/db.ts'

const [, , userId] = process.argv
if (!userId) {
  console.error('Usage: tsx scripts/seed-user.mts <user_id>')
  process.exit(1)
}

await seedUserDefaults(userId)
console.log(`Seeded defaults for user ${userId}`)
await pool.end()
