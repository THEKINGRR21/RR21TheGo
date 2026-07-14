import crypto from 'crypto';

const API_BASE = 'http://localhost:3000/api';

async function run() {
  console.log('--- START WEIGHT API INTEGRATION TESTS ---');

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
      weightKg: 80, // initial weight
      activity: 'moderately_active',
      goal: 'cut',
      rateWeeklyPct: 0.5,
    }),
  });
  if (resValid.status !== 200) {
    throw new Error('Registration failed');
  }
  console.log('  Success: User registered.');

  // 2. Fetch initial weight history (should have exactly 1 record from registration seed)
  console.log('\nStep 2: Fetching weight history (post-registration)...');
  const resHist1 = await fetch(`${API_BASE}/weight/history`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const hist1 = await resHist1.json();
  console.log(`  Weight history records: ${hist1.length}`);
  if (hist1.length !== 1 || Number(hist1[0].weightKg) !== 80) {
    throw new Error('Expected 1 weight record of 80 kg from registration initial seed');
  }
  console.log('  Success: Initial weight entry verified.');

  // 3. Log a new weight entry on a future date
  console.log('\nStep 3: Logging a weight entry on 2026-07-02...');
  const resLog1 = await fetch(`${API_BASE}/weight`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      weightKg: 81,
      date: '2026-07-02',
    }),
  });
  console.log(`  Response Status: ${resLog1.status}`);
  if (resLog1.status !== 200) {
    throw new Error('Failed to log weight');
  }
  const entry1 = await resLog1.json();
  console.log('  Logged Entry:', JSON.stringify(entry1));

  // 4. Upsert (Modify) weight on same date
  console.log('\nStep 4: Modifying weight on 2026-07-02 (upsert)...');
  const resLog2 = await fetch(`${API_BASE}/weight`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      weightKg: 80.5,
      date: '2026-07-02',
    }),
  });
  const entry2 = await resLog2.json();
  console.log('  Modified Entry:', JSON.stringify(entry2));
  if (Number(entry2.weightKg) !== 80.5) {
    throw new Error('Expected upsert weight update to be 80.5 kg');
  }
  console.log('  Success: Weight entry upsert update verified.');

  // 5. Fetch updated history
  console.log('\nStep 5: Fetching updated weight history...');
  const resHist2 = await fetch(`${API_BASE}/weight/history`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const hist2 = await resHist2.json();
  console.log(`  Weight history records: ${hist2.length}`);
  if (hist2.length !== 2) {
    throw new Error('Expected exactly 2 weight records');
  }
  console.log('  Success: History records returned correctly.');

  // 6. Delete the weight entry
  console.log('\nStep 6: Deleting weight entry...');
  const resDel = await fetch(`${API_BASE}/weight/${entry2.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  console.log(`  Response Status: ${resDel.status}`);
  if (resDel.status !== 200) {
    throw new Error('Failed to delete weight entry');
  }

  // Fetch weight history again to confirm deletion
  const resHist3 = await fetch(`${API_BASE}/weight/history`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const hist3 = await resHist3.json();
  console.log(`  Weight history records after deletion: ${hist3.length}`);
  if (hist3.length !== 1) {
    throw new Error('Expected 1 weight record remaining after deletion');
  }
  console.log('  Success: Weight deletion verified.');

  // 7. Clean up user
  console.log('\nStep 7: Cleaning up user...');
  await fetch(`${API_BASE}/user/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });

  console.log('\n--- ALL WEIGHT API INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('\n!!! WEIGHT API INTEGRATION TEST FAILED !!!\n', err);
  process.exit(1);
});
