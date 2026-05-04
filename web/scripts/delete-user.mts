import { pool, query } from '../server/db.ts'

const email = process.argv[2]
if (!email) {
  console.error('Usage: tsx scripts/delete-user.mts <email>')
  process.exit(1)
}

const u = await query<{ id: string }>(
  `SELECT id FROM "user" WHERE email = $1`,
  [email]
)
if (u.rows.length === 0) {
  console.error(`No user found with email ${email}`)
  process.exit(1)
}
const userId = u.rows[0].id

const client = await pool.connect()
try {
  await client.query('BEGIN')
  const tables: { table: string; col: string; param: string }[] = [
    { table: 'subscription', col: '"referenceId"', param: userId },
    { table: 'session', col: '"userId"', param: userId },
    { table: 'account', col: '"userId"', param: userId },
    { table: 'todos', col: 'user_id', param: userId },
    { table: 'app_settings', col: 'user_id', param: userId },
    { table: 'verification', col: 'identifier', param: email },
  ]
  for (const t of tables) {
    const r = await client.query(
      `DELETE FROM "${t.table}" WHERE ${t.col} = $1`,
      [t.param]
    )
    console.log(`  ${t.table}: ${r.rowCount} row(s) deleted`)
  }
  const userDel = await client.query(`DELETE FROM "user" WHERE id = $1`, [userId])
  console.log(`  user: ${userDel.rowCount} row(s) deleted`)
  await client.query('COMMIT')
  console.log(`\nFully removed ${email} (id=${userId}).`)
} catch (err) {
  await client.query('ROLLBACK')
  console.error('Rolled back due to error:', err)
  process.exit(1)
} finally {
  client.release()
  await pool.end()
}
