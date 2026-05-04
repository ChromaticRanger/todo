import { query, pool } from '../server/db.ts'

const email = process.argv[2]
if (!email) {
  console.error('Usage: tsx scripts/inspect-stripe-state.mts <email>')
  process.exit(1)
}

const u = await query<{ id: string; email: string }>(
  'SELECT id, email FROM "user" WHERE email = $1',
  [email]
)
if (u.rows.length === 0) {
  console.log('No user with that email.')
  await pool.end()
  process.exit(0)
}
const user = u.rows[0]
console.log('User:', user)

// Show all columns on the user row so we can see if there's a stripeCustomerId field
const cols = await query<{ column_name: string }>(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'user' ORDER BY ordinal_position`
)
console.log('\n"user" table columns:', cols.rows.map((r) => r.column_name).join(', '))

const userFull = await query('SELECT * FROM "user" WHERE id = $1', [user.id])
console.log('\nUser row:', userFull.rows[0])

// Look for any subscription / stripe-related tables
const tables = await query<{ table_name: string }>(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name`
)
console.log('\nTables:', tables.rows.map((r) => r.table_name).join(', '))

for (const t of tables.rows) {
  if (/stripe|subscript|customer/i.test(t.table_name)) {
    const rows = await query(
      `SELECT * FROM "${t.table_name}" WHERE ($1::text IS NOT NULL)`,
      [user.id]
    )
    // Filter for rows that reference this user
    const userCols = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [t.table_name]
    )
    const refCol = userCols.rows.find((c) =>
      /user|reference|owner/i.test(c.column_name)
    )?.column_name
    if (refCol) {
      const filtered = await query(
        `SELECT * FROM "${t.table_name}" WHERE "${refCol}" = $1`,
        [user.id]
      )
      console.log(`\n[${t.table_name}] (filtered by ${refCol}):`, filtered.rows)
    } else {
      console.log(`\n[${t.table_name}] (no user-ref column found):`, rows.rows.slice(0, 3))
    }
  }
}

await pool.end()
