import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5439/rr21go',
});

const db = drizzle(pool);

async function run() {
  console.log('Enabling Row Level Security...');
  await db.execute(sql`alter table users enable row level security;`);
  await db.execute(sql`alter table targets enable row level security;`);
  await db.execute(sql`alter table body_metrics enable row level security;`);
  await db.execute(sql`alter table entries enable row level security;`);
  await db.execute(sql`alter table foods enable row level security;`);
  await db.execute(sql`alter table food_servings enable row level security;`);

  console.log('Setting up RLS policies on "users" table...');
  await db.execute(sql`
    drop policy if exists users_select_policy on users;
    drop policy if exists users_insert_policy on users;
    drop policy if exists users_update_policy on users;
    drop policy if exists users_delete_policy on users;

    create policy users_select_policy on users
      for select
      using (
        current_user != 'app_user'
        or id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );

    create policy users_insert_policy on users
      for insert
      with check (
        current_user != 'app_user'
        or true -- Allows user registration
      );

    create policy users_update_policy on users
      for update
      using (
        current_user != 'app_user'
        or id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );

    create policy users_delete_policy on users
      for delete
      using (
        current_user != 'app_user'
        or id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );
  `);

  console.log('Setting up RLS policies on "targets" table...');
  await db.execute(sql`
    drop policy if exists targets_all_policy on targets;
    
    create policy targets_all_policy on targets
      for all
      using (
        current_user != 'app_user'
        or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      )
      with check (
        current_user != 'app_user'
        or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );
  `);

  console.log('Setting up RLS policies on "body_metrics" table...');
  await db.execute(sql`
    drop policy if exists body_metrics_all_policy on body_metrics;

    create policy body_metrics_all_policy on body_metrics
      for all
      using (
        current_user != 'app_user'
        or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      )
      with check (
        current_user != 'app_user'
        or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );
  `);

  console.log('Setting up RLS policies on "entries" table...');
  await db.execute(sql`
    drop policy if exists entries_all_policy on entries;

    create policy entries_all_policy on entries
      for all
      using (
        current_user != 'app_user'
        or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      )
      with check (
        current_user != 'app_user'
        or user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );
  `);

  console.log('Setting up RLS policies on "foods" table...');
  await db.execute(sql`
    drop policy if exists foods_select_policy on foods;
    drop policy if exists foods_insert_policy on foods;
    drop policy if exists foods_update_policy on foods;
    drop policy if exists foods_delete_policy on foods;

    create policy foods_select_policy on foods
      for select
      using (
        current_user != 'app_user'
        or owner_user_id is null 
        or owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );

    create policy foods_insert_policy on foods
      for insert
      with check (
        current_user != 'app_user'
        or owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );

    create policy foods_update_policy on foods
      for update
      using (
        current_user != 'app_user'
        or owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );

    create policy foods_delete_policy on foods
      for delete
      using (
        current_user != 'app_user'
        or owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
      );
  `);

  console.log('Setting up RLS policies on "food_servings" table...');
  await db.execute(sql`
    drop policy if exists food_servings_all_policy on food_servings;

    create policy food_servings_all_policy on food_servings
      for all
      using (
        current_user != 'app_user'
        or exists (
          select 1 from foods
          where foods.id = food_servings.food_id
        )
      );
  `);

  console.log('RLS policies setup successfully!');
  await pool.end();
}

run().catch((err) => {
  console.error('RLS setup failed:', err);
  process.exit(1);
});
