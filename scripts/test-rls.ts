import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users, targets } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

// Setup connection strings
const ADMIN_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5439/rr21go';
const APP_USER_URL = 'postgresql://app_user:app_user_password@localhost:5439/rr21go';

async function run() {
  console.log('--- START RLS ISOLATION TEST ---');
  
  const adminPool = new Pool({ connectionString: ADMIN_URL });
  const appUserPool = new Pool({ connectionString: APP_USER_URL });

  const adminDb = drizzle(adminPool);
  const userDb = drizzle(appUserPool);

  // Generate test IDs
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  console.log(`Generated Test IDs:\n  User A: ${userAId}\n  User B: ${userBId}`);

  try {
    // 1. Admin setup: Insert User A and User B
    console.log('Inserting User A and User B as Admin...');
    await adminDb.insert(users).values([
      {
        id: userAId,
        authSubject: 'auth|userA',
        email: 'usera@example.com',
        birthDate: '1990-01-01',
      },
      {
        id: userBId,
        authSubject: 'auth|userB',
        email: 'userb@example.com',
        birthDate: '1992-05-15',
      }
    ]);

    // Insert targets for both users
    console.log('Inserting targets as Admin...');
    await adminDb.insert(targets).values([
      {
        userId: userAId,
        effectiveFrom: '2026-07-14',
        kcal: 2500,
        proteinG: 150,
        fatG: 70,
        carbG: 300,
        basis: 'estimated',
        rationale: 'User A initial estimate',
      },
      {
        userId: userBId,
        effectiveFrom: '2026-07-14',
        kcal: 2200,
        proteinG: 140,
        fatG: 60,
        carbG: 275,
        basis: 'estimated',
        rationale: 'User B initial estimate',
      }
    ]);

    // Create client connection and set session context for User A
    console.log('Connecting as app_user and setting session context to User A...');
    const client = await appUserPool.connect();
    
    // Start transaction
    await client.query('begin');
    await client.query(`set local app.current_user_id = '${userAId}'`);

    // 2. Read test: Query User A's data
    console.log("Querying User A's own profile...");
    const resA = await client.query('select * from users where id = $1', [userAId]);
    console.log(`  Profiles returned: ${resA.rows.length}`);
    if (resA.rows.length !== 1) {
      await client.query('rollback');
      throw new Error(`Expected 1 profile for User A, got ${resA.rows.length}`);
    }

    // 3. Read test: Attempt to query User B's data
    console.log("Querying User B's profile directly...");
    const resB = await client.query('select * from users where id = $1', [userBId]);
    console.log(`  Profiles returned: ${resB.rows.length}`);
    if (resB.rows.length !== 0) {
      await client.query('rollback');
      throw new Error(`SECURITY VIOLATION: Read User B's profile directly and got ${resB.rows.length} rows!`);
    }

    // 4. Read test: Query all targets
    console.log('Querying all targets...');
    const resTargets = await client.query('select * from targets');
    console.log(`  Targets returned: ${resTargets.rows.length}`);
    const hasUserBTarget = resTargets.rows.some((row: any) => row.user_id === userBId);
    if (hasUserBTarget) {
      await client.query('rollback');
      throw new Error("SECURITY VIOLATION: Found User B's target in target list!");
    }
    console.log("  Success: User B's targets were isolated and not returned.");

    // 5. Write test: Attempt to insert a target for User B under User A's session
    console.log("Attempting to insert a target for User B under User A's session...");
    try {
      await client.query(
        'insert into targets (user_id, effective_from, kcal, protein_g, fat_g, carb_g, basis, rationale) values ($1, $2, $3, $4, $5, $6, $7, $8)',
        [userBId, '2026-07-15', 3000, 200, 80, 350, 'manual', 'Malicious insert']
      );
      await client.query('rollback');
      throw new Error("SECURITY VIOLATION: Successfully inserted a target for User B under User A's session!");
    } catch (err: any) {
      if (err.message.includes('SECURITY VIOLATION')) {
        throw err;
      }
      console.log('  Success: Insert was blocked as designed:', err.message);
    }

    await client.query('commit');
    // Release the client
    client.release();

    console.log('\n--- ALL RLS ISOLATION TESTS PASSED SUCCESSFULLY! ---');

  } finally {
    // Cleanup database
    console.log('Cleaning up test data as Admin...');
    await adminDb.delete(users).where(sql`id in (${userAId}, ${userBId})`);
    
    await adminPool.end();
    await appUserPool.end();
  }
}

run().catch((err) => {
  console.error('\n!!! RLS ISOLATION TEST FAILED !!!\n', err);
  process.exit(1);
});
