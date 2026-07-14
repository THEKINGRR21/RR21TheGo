import crypto from 'crypto';
import { LocalStore, syncOfflineQueue } from '../src/utils/sync';

const API_BASE = 'http://localhost:3000/api';

async function run() {
  console.log('--- START OFFLINE SYNC QUEUE INTEGRATION TESTS ---');

  const mockUserToken = `mock|user_${crypto.randomUUID()}`;
  const uniqueEmail = `offline_${crypto.randomUUID()}@example.com`;
  console.log(`Mock Authorization token: Bearer ${mockUserToken}`);

  // Clear local stores
  LocalStore.clearAll();

  // 1. Register User (seeds registration weight of 65 kg on today)
  console.log('\nStep 1: Registering a valid user...');
  const resValid = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      email: uniqueEmail,
      birthDate: '1992-05-15',
      sexAtBirth: 'female',
      heightCm: 170,
      weightKg: 65,
      activity: 'moderately_active',
      goal: 'cut',
      rateWeeklyPct: 0.5,
    }),
  });
  if (resValid.status !== 200) {
    throw new Error('Registration failed');
  }
  console.log('  Success: User registered.');

  // Find chicken food to log
  const resSearch = await fetch(`${API_BASE}/foods/search?q=chicken`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const searchResult = await resSearch.json();
  const chickenFood = searchResult[0];

  // 2. Simulate Offline Write Logging (Enqueues items)
  console.log('\nStep 2: Simulating offline logging...');
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Yesterday's date for weight log to prevent daily upsert overwrite
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const clientId = `client_${crypto.randomUUID()}`;
  
  // Enqueue food log
  LocalStore.enqueue('INSERT_ENTRY', {
    foodId: chickenFood.id,
    loggedFor: todayStr,
    meal: 'breakfast',
    grams: 150,
    kcal: 300,
    proteinG: 45,
    fatG: 10,
    carbG: 0,
    clientId,
  });

  // Enqueue weight log on yesterday
  LocalStore.enqueue('UPSERT_WEIGHT', {
    weightKg: 64.5,
    date: yesterdayStr,
    bodyFatPct: 22,
  });

  const queue = LocalStore.getQueue();
  console.log(`  Items in sync queue: ${queue.length}`);
  if (queue.length !== 2) {
    throw new Error('Expected exactly 2 items in the sync queue');
  }
  console.log('  Success: Offline enqueuing verified.');

  // 3. Reconnect & Replay Sync (simulates connection restoration)
  console.log('\nStep 3: Triggering sync replay (simulating reconnect)...');
  const syncSuccess = await syncOfflineQueue(mockUserToken);
  console.log(`  Sync completed successfully: ${syncSuccess}`);
  if (!syncSuccess) {
    throw new Error('Sync replay failed');
  }

  const queuePostSync = LocalStore.getQueue();
  console.log(`  Items in sync queue after replay: ${queuePostSync.length}`);
  if (queuePostSync.length !== 0) {
    throw new Error('Expected queue to be completely empty after successful sync');
  }
  console.log('  Success: Reconnect replay synchronized.');

  // 4. Verify server received the synced entries
  console.log('\nStep 4: Verifying server database has received the synced logs...');
  const resEntries = await fetch(`${API_BASE}/entries?date=${todayStr}`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const entries = await resEntries.json();
  console.log(`  Food entries returned from server: ${entries.length}`);
  if (entries.length !== 1 || Number(entries[0].kcal) !== 300) {
    throw new Error('Expected 1 synced food entry of 300 kcal on server');
  }

  const resWeights = await fetch(`${API_BASE}/weight/history`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const weights = await resWeights.json();
  console.log(`  Weight history entries returned from server: ${weights.length}`);
  // 2 records: 65kg (today) + 64.5kg (yesterday)
  if (weights.length !== 2) {
    throw new Error('Expected exactly 2 weight entries on server');
  }
  console.log('  Success: Server replication verified.');

  // 5. Clean up user
  console.log('\nStep 5: Cleaning up user...');
  await fetch(`${API_BASE}/user/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });

  console.log('\n--- ALL OFFLINE SYNC QUEUE INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('\n!!! OFFLINE SYNC QUEUE INTEGRATION TEST FAILED !!!\n', err);
  process.exit(1);
});
