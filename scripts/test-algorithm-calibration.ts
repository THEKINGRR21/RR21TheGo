import crypto from 'crypto';

const API_BASE = 'http://localhost:3000/api';

async function run() {
  console.log('--- START ALGORITHM CALIBRATION INTEGRATION TESTS ---');

  const mockUserToken = `mock|user_${crypto.randomUUID()}`;
  const uniqueEmail = `calib_${crypto.randomUUID()}@example.com`;
  console.log(`Mock Authorization token: Bearer ${mockUserToken}`);

  // 1. Register User (male, BMR = 1775 kcal, starting TDEE = 2751 kcal)
  console.log('\nStep 1: Registering a valid male user...');
  const resValid = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      email: uniqueEmail,
      birthDate: '1995-05-15',
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
  const initialTarget = payload.target;
  console.log(`  Success: User registered. Initial calorie target: ${initialTarget.kcal} kcal (basis: ${initialTarget.basis}).`);

  // 2. Seed 14 days of stable weight logs and food intake logs
  console.log('\nStep 2: Seeding 14 days of stable logs (Weight: 80kg, Food: 2200 kcal)...');
  const today = new Date();
  
  // Seed foods
  // Get seeded chicken food
  const resSearch = await fetch(`${API_BASE}/foods/search?q=chicken`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const searchResult = await resSearch.json();
  const chickenFood = searchResult[0];

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Seed weight
    await fetch(`${API_BASE}/weight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockUserToken}`,
      },
      body: JSON.stringify({
        weightKg: 80.0,
        date: dateStr,
      }),
    });

    // Seed food entry (lunch, 2200 kcal total)
    await fetch(`${API_BASE}/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockUserToken}`,
      },
      body: JSON.stringify({
        foodId: chickenFood.id,
        loggedFor: dateStr,
        meal: 'lunch',
        grams: 100,
        kcal: 2200, // force daily sum to 2200
        clientId: `client_${crypto.randomUUID()}`,
      }),
    });
  }
  console.log('  Success: 14 days of logs seeded.');

  // 3. Fetch Profile (should trigger calibration!)
  console.log('\nStep 3: Fetching profile to trigger algorithm correction...');
  const resProfile = await fetch(`${API_BASE}/user/profile`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const profilePayload = await resProfile.json();
  const calibratedTarget = profilePayload.target;
  console.log(`  Calibrated Target kcal: ${calibratedTarget.kcal}`);
  console.log(`  Basis: ${calibratedTarget.basis}`);
  console.log(`  Rationale: ${calibratedTarget.rationale}`);

  // Expected calibration:
  // Stable weight = 80kg (trend change = 0). Energy balance = 0.
  // Average food intake = 2200 kcal/day.
  // Calibrated TDEE = 2200 - 0 = 2200.
  // Goal: cut at 0.5% rate -> deficit = 80 * 0.5% * 1100 = 440 kcal.
  // Deficit Cap: min(750, 25% of TDEE = 550) -> Deficit = 440.
  // Budget = 2200 - 440 = 1760 kcal.
  // Clamped to user BMR floor = 1775 kcal!
  if (calibratedTarget.kcal !== 1775 || calibratedTarget.basis !== 'calibrated') {
    throw new Error(`Expected budget of 1775 kcal (BMR clamped) with basis 'calibrated', got ${calibratedTarget.kcal} (${calibratedTarget.basis})`);
  }
  if (!calibratedTarget.rationale.includes('Target clamped to your BMR floor of 1775 kcal')) {
    throw new Error('Expected rationale to indicate BMR floor clamp');
  }
  console.log('  Success: Calibrated calorie target matches prediction and includes safety rationale!');

  // 4. Clean up user
  console.log('\nStep 4: Cleaning up user...');
  await fetch(`${API_BASE}/user/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });

  console.log('\n--- ALL ALGORITHM CALIBRATION INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('\n!!! ALGORITHM CALIBRATION INTEGRATION TEST FAILED !!!\n', err);
  process.exit(1);
});
