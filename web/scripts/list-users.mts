import { query, pool } from '../server/db.ts'

const u = await query<{ id: string; email: string; name: string; created_at: Date }>(
  'SELECT id, email, name, "createdAt" AS created_at FROM "user" ORDER BY "createdAt"'
)
console.log('Users:')
for (const r of u.rows) console.log(' ', r.id, '|', r.email, '|', r.name, '|', r.created_at)

const s = await query<{ user_id: string; value: unknown }>(
  "SELECT user_id, value FROM app_settings WHERE key = 'onboarding'"
)
console.log('\nOnboarding rows:', s.rows.length)
for (const r of s.rows) console.log(' ', r.user_id, '|', JSON.stringify(r.value))

const t = await query<{ user_id: string; n: string }>(
  "SELECT user_id, COUNT(*)::text n FROM todos GROUP BY user_id ORDER BY user_id"
)
console.log('\nTodos per user:')
for (const r of t.rows) console.log(' ', r.user_id, '|', r.n, 'rows')

await pool.end()
