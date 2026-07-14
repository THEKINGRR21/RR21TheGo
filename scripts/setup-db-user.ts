import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5439/rr21go',
});

const db = drizzle(pool);

async function run() {
  console.log('Creating app_user database role...');
  await db.execute(sql`
    do $$
    begin
      if not exists (select from pg_catalog.pg_roles where rolname = 'app_user') then
        create role app_user with login password 'app_user_password';
      end if;
    end
    $$;
  `);

  console.log('Granting permissions to app_user...');
  await db.execute(sql`grant usage on schema public to app_user;`);
  await db.execute(sql`grant all privileges on all tables in schema public to app_user;`);
  await db.execute(sql`grant all privileges on all sequences in schema public to app_user;`);

  console.log('Forcing Row Level Security on all tables...');
  await db.execute(sql`alter table users force row level security;`);
  await db.execute(sql`alter table targets force row level security;`);
  await db.execute(sql`alter table body_metrics force row level security;`);
  await db.execute(sql`alter table entries force row level security;`);
  await db.execute(sql`alter table foods force row level security;`);
  await db.execute(sql`alter table food_servings force row level security;`);

  console.log('Database user configuration completed successfully!');
  await pool.end();
}

run().catch((err) => {
  console.error('Setup DB user failed:', err);
  process.exit(1);
});
