import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5439/rr21go',
});

const db = drizzle(pool);

async function run() {
  console.log('Enabling citext extension...');
  // Enable the citext extension required by the email column
  await db.execute(sql`create extension if not exists citext;`);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  console.log('Migrations complete!');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
