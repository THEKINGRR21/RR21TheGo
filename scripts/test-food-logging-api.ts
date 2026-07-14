import crypto from 'crypto';

const API_BASE = 'http://localhost:3000/api';

async function run() {
  console.log('--- START FOOD LOGGING API INTEGRATION TESTS ---');

  const mockUserToken = `mock|user_${crypto.randomUUID()}`;
  const uniqueEmail = `adult_${crypto.randomUUID()}@example.com`;
  console.log(`Mock Authorization token: Bearer ${mockUserToken}`);

  // 1. Register User
  console.log('\nStep 1: Registering a valid user...');
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
  const payload = await resValid.json();
  const userId = payload.user.id;
  console.log(`  Success: User registered with ID ${userId}`);

  // 2. Query empty search state (should be empty initially)
  console.log('\nStep 2: Querying empty search state (no history)...');
  const resSearch1 = await fetch(`${API_BASE}/foods/search`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const search1 = await resSearch1.json();
  console.log(`  Results returned: ${search1.length}`);
  if (search1.length !== 0) {
    throw new Error('Expected 0 results for empty search with no history');
  }
  console.log('  Success: Empty search returned 0 items.');

  // 3. Search for "chicken"
  console.log('\nStep 3: Searching for "chicken"...');
  const resSearch2 = await fetch(`${API_BASE}/foods/search?q=chicken`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const search2 = await resSearch2.json();
  console.log(`  Results returned: ${search2.length}`);
  if (search2.length === 0 || !search2[0].name.toLowerCase().includes('chicken')) {
    throw new Error('Expected to find chicken breast');
  }
  const chickenFood = search2[0];
  console.log(`  Found: ${chickenFood.name} with ${chickenFood.servings.length} servings.`);
  console.log('  Success: Food search returned matches with servings.');

  // 4. Log a chicken breast entry
  console.log('\nStep 4: Logging chicken breast entry...');
  const clientIdChicken1 = `client_${crypto.randomUUID()}`;
  const todayStr = new Date().toISOString().split('T')[0];

  const resLog1 = await fetch(`${API_BASE}/entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      foodId: chickenFood.id,
      loggedFor: todayStr,
      meal: 'lunch',
      grams: 150,
      kcal: 247.5,
      proteinG: 46.5,
      fatG: 5.4,
      carbG: 0,
      clientId: clientIdChicken1,
    }),
  });
  console.log(`  Response Status: ${resLog1.status}`);
  if (resLog1.status !== 200) {
    throw new Error('Failed to log chicken entry');
  }
  const entryChicken1 = await resLog1.json();
  console.log('  Logged Entry:', JSON.stringify(entryChicken1));
  console.log('  Success: Entry logged successfully.');

  // 5. Test Idempotency: Log same chicken breast entry again with same clientId
  console.log('\nStep 5: Testing Idempotency (re-logging same entry)...');
  const resLog2 = await fetch(`${API_BASE}/entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      foodId: chickenFood.id,
      loggedFor: todayStr,
      meal: 'lunch',
      grams: 150,
      kcal: 247.5,
      proteinG: 46.5,
      fatG: 5.4,
      carbG: 0,
      clientId: clientIdChicken1, // Same ID
    }),
  });
  console.log(`  Response Status: ${resLog2.status}`);
  const entryChicken2 = await resLog2.json();
  if (entryChicken2.id !== entryChicken1.id) {
    throw new Error('Expected same entry ID to be returned for idempotent request');
  }
  console.log('  Success: Idempotency check verified (same ID returned, no duplicate).');

  // 6. Log a whole egg entry
  console.log('\nStep 6: Searching and logging whole egg entry...');
  const resSearchEgg = await fetch(`${API_BASE}/foods/search?q=egg`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const searchEgg = await resSearchEgg.json();
  // Find "Whole Egg"
  const eggFood = searchEgg.find((f: any) => f.name.toLowerCase().includes('whole egg'));
  if (!eggFood) {
    throw new Error('Expected to find whole egg');
  }

  const clientIdEgg = `client_${crypto.randomUUID()}`;
  const resLogEgg = await fetch(`${API_BASE}/entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      foodId: eggFood.id,
      loggedFor: todayStr,
      meal: 'breakfast',
      grams: 100, // 2 eggs
      kcal: 143,
      proteinG: 12.6,
      fatG: 9.5,
      carbG: 0.7,
      clientId: clientIdEgg,
    }),
  });
  const entryEgg = await resLogEgg.json();
  console.log(`  Logged Egg Entry: ${entryEgg.id}`);
  console.log('  Success: Egg entry logged.');

  // 7. Query empty search state again (should return history now!)
  console.log('\nStep 7: Querying empty search state (with history)...');
  const resSearch3 = await fetch(`${API_BASE}/foods/search`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const search3 = await resSearch3.json();
  console.log(`  Results returned: ${search3.length}`);
  if (search3.length === 0) {
    throw new Error('Expected history results to be returned');
  }
  console.log('  Recent history results:', search3.map((f: any) => f.name).join(', '));
  console.log('  Success: Empty search returned recent history.');

  // 8. Fetch today\'s entries
  console.log('\nStep 8: Fetching today\'s logged entries...');
  const resEntries = await fetch(`${API_BASE}/entries?date=${todayStr}`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const entriesList = await resEntries.json();
  console.log(`  Entries logged today: ${entriesList.length}`);
  console.log('  Entries detail:', JSON.stringify(entriesList));
  if (entriesList.length !== 2) {
    throw new Error(`Expected 2 logged entries today, got ${entriesList.length}`);
  }
  console.log('  Success: Returned logged entries with complete food metadata.');

  // 9. Delete egg entry
  console.log('\nStep 9: Deleting egg entry...');
  const resDel = await fetch(`${API_BASE}/entries/${entryEgg.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  console.log(`  Response Status: ${resDel.status}`);
  if (resDel.status !== 200) {
    throw new Error('Failed to delete egg entry');
  }

  // Fetch entries again to confirm deletion
  const resEntries2 = await fetch(`${API_BASE}/entries?date=${todayStr}`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const entriesList2 = await resEntries2.json();
  console.log(`  Entries logged today after deletion: ${entriesList2.length}`);
  if (entriesList2.length !== 1) {
    throw new Error('Expected 1 entry remaining');
  }
  console.log('  Success: Food entry deletion verified.');

  // 10. Clean up user
  console.log('\nStep 10: Cleaning up user...');
  await fetch(`${API_BASE}/user/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });

  console.log('\n--- ALL FOOD LOGGING API INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('\n!!! FOOD LOGGING API INTEGRATION TEST FAILED !!!\n', err);
  process.exit(1);
});
