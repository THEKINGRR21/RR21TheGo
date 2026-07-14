import crypto from 'crypto';
import { db } from '../src/server/db';
import { users, targets, bodyMetrics, entries } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { runHardPurge } from './hard-purge';

const API_BASE = 'http://localhost:3000/api';

async function run() {
  console.log('--- START EXPORT & PURGE INTEGRATION TESTS ---');

  const mockUserToken = `mock|user_${crypto.randomUUID()}`;
  const uniqueEmail = `purge_${crypto.randomUUID()}@example.com`;
  console.log(`Mock Authorization token: Bearer ${mockUserToken}`);

  // 1. Register User
  console.log('\nStep 1: Registering a user...');
  const resValid = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      email: uniqueEmail,
      birthDate: '1990-05-15',
      sexAtBirth: 'male',
      heightCm: 180,
      weightKg: 80,
      activity: 'moderately_active',
      goal: 'cut',
      rateWeeklyPct: 0.5,
    }),
  });
  if (resValid.status !== 200) {
    throw new Error('Registration failed');
  }
  const regPayload = await resValid.json();
  const userId = regPayload.user.id;
  console.log(`  Success: User registered with ID ${userId}.`);

  // Seed 1 food log and 1 weight log
  const resSearch = await fetch(`${API_BASE}/foods/search?q=chicken`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const searchResult = await resSearch.json();
  const chickenFood = searchResult[0];

  const todayStr = new Date().toISOString().split('T')[0];
  await fetch(`${API_BASE}/entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      foodId: chickenFood.id,
      loggedFor: todayStr,
      meal: 'breakfast',
      grams: 200,
      kcal: 400,
      clientId: `client_${crypto.randomUUID()}`,
    }),
  });

  // 2. Export user data
  console.log('\nStep 2: Exporting user logs JSON...');
  const resExport = await fetch(`${API_BASE}/user/export`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  if (resExport.status !== 200) {
    throw new Error('Data export failed');
  }
  const exportData = await resExport.json();
  console.log(`  Export keys: ${Object.keys(exportData).join(', ')}`);
  console.log(`  Target count: ${exportData.targets.length}`);
  console.log(`  Weight count: ${exportData.bodyMetrics.length}`);
  console.log(`  Logged entries count: ${exportData.entries.length}`);

  if (exportData.entries.length !== 1 || exportData.bodyMetrics.length !== 1) {
    throw new Error('Expected exactly 1 food entry and 1 weight entry in export data');
  }
  console.log('  Success: Export validation complete.');

  // 3. Soft Delete Account
  console.log('\nStep 3: Triggering account soft-deletion...');
  const resDel = await fetch(`${API_BASE}/user/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  if (resDel.status !== 200) {
    throw new Error('Soft deletion failed');
  }
  console.log('  Success: Account soft deleted.');

  // 4. Assert Instant Blocking (GET export should fail with 401 Unauthorized)
  console.log('\nStep 4: Verifying API access is instantly blocked...');
  const resProfile = await fetch(`${API_BASE}/user/export`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  console.log(`  Export GET status code: ${resProfile.status}`);
  if (resProfile.status !== 401) {
    throw new Error('Expected 401 Unauthorized for soft deleted account');
  }
  console.log('  Success: Instant block verified.');

  // 5. Simulate 40-day time-travel state change
  console.log('\nStep 5: Simulating 40 days time travel for soft delete timestamp...');
  await db.execute(sql`
    UPDATE users
    SET deleted_at = now() - interval '40 days'
    WHERE id = ${userId}::uuid
  `);
  console.log('  Success: Timestamp updated.');

  // 6. Run Hard Purge Routine
  console.log('\nStep 6: Executing hard purge deletion routine...');
  await runHardPurge();
  console.log('  Success: Hard purge complete.');

  // 7. Verify Cascade Deletion of all user rows
  console.log('\nStep 7: Verifying cascade physical deletion from database...');
  const userRows = await db.select().from(users).where(eq(users.id, userId));
  const targetRows = await db.select().from(targets).where(eq(targets.userId, userId));
  const metricRows = await db.select().from(bodyMetrics).where(eq(bodyMetrics.userId, userId));
  const entryRows = await db.select().from(entries).where(eq(entries.userId, userId));

  console.log(`  Users remaining: ${userRows.length}`);
  console.log(`  Targets remaining: ${targetRows.length}`);
  console.log(`  Weight metrics remaining: ${metricRows.length}`);
  console.log(`  Entries remaining: ${entryRows.length}`);

  if (userRows.length !== 0 || targetRows.length !== 0 || metricRows.length !== 0 || entryRows.length !== 0) {
    throw new Error('Expected all rows to be physically cascade deleted from the database');
  }
  console.log('  Success: Cascade verification verified. All user logs are completely erased.');

  console.log('\n--- ALL EXPORT & PURGE INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('\n!!! EXPORT & PURGE INTEGRATION TEST FAILED !!!\n', err);
  process.exit(1);
});
