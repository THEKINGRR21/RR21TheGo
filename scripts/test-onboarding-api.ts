import crypto from 'crypto';

const API_BASE = 'http://localhost:3000/api';

async function run() {
  console.log('--- START ONBOARDING API INTEGRATION TESTS ---');

  const mockUserToken = `mock|user_${crypto.randomUUID()}`;
  const uniqueEmail = `adult_${crypto.randomUUID()}@example.com`;
  console.log(`Mock Authorization token: Bearer ${mockUserToken}`);
  console.log(`Unique Email: ${uniqueEmail}`);

  // Test Case 1: Fetch Profile for non-existent user
  console.log('\nTest Case 1: Fetching profile for non-existent user...');
  const resProfile1 = await fetch(`${API_BASE}/user/profile`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const profile1 = await resProfile1.json();
  console.log('  Profile response:', JSON.stringify(profile1));
  if (profile1.user !== null || profile1.target !== null) {
    throw new Error('Expected new user profile to be null');
  }
  console.log('  Success: New user profile is null.');

  // Test Case 2: Register with invalid age (Under 18)
  console.log('\nTest Case 2: Registering user under 18 years old...');
  const birthDateUnder18 = new Date();
  birthDateUnder18.setFullYear(birthDateUnder18.getFullYear() - 17); // 17 years old
  const dobUnder18 = birthDateUnder18.toISOString().split('T')[0];

  const resUnder18 = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      email: `youngster_${crypto.randomUUID()}@example.com`,
      birthDate: dobUnder18,
      sexAtBirth: 'female',
      heightCm: 165,
      weightKg: 55,
      activity: 'sedentary',
      goal: 'maintain',
      rateWeeklyPct: 0.5,
    }),
  });
  console.log(`  Response Status: ${resUnder18.status}`);
  const errorUnder18 = await resUnder18.json();
  console.log('  Error payload:', JSON.stringify(errorUnder18));
  if (resUnder18.status !== 400 || !errorUnder18.error.includes('Age gate')) {
    throw new Error('Expected 400 Bad Request with Age Gate error message');
  }
  console.log('  Success: Age-gate correctly blocked registration.');

  // Test Case 3: Register with invalid goal weight (BMI < 18.5)
  console.log('\nTest Case 3: Registering user with goal weight leading to BMI < 18.5...');
  const dobAdult = '1995-06-20';
  const resBmiFloor = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      email: uniqueEmail,
      birthDate: dobAdult,
      sexAtBirth: 'female',
      heightCm: 170, // 170cm height
      weightKg: 70,
      activity: 'sedentary',
      goal: 'cut',
      rateWeeklyPct: 0.5,
      goalWeightKg: 50, // BMI = 50 / 1.7^2 = 17.3 (< 18.5)
    }),
  });
  console.log(`  Response Status: ${resBmiFloor.status}`);
  const errorBmi = await resBmiFloor.json();
  console.log('  Error payload:', JSON.stringify(errorBmi));
  if (resBmiFloor.status !== 400 || !errorBmi.error.includes('below the healthy floor')) {
    throw new Error('Expected 400 Bad Request with BMI floor error');
  }
  console.log('  Success: BMI floor constraint correctly blocked registration.');

  // Test Case 4: Register successfully with valid details (Mifflin-St Jeor route)
  console.log('\nTest Case 4: Registering user with valid details (Mifflin-St Jeor)...');
  const resValid = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserToken}`,
    },
    body: JSON.stringify({
      email: uniqueEmail,
      birthDate: dobAdult,
      sexAtBirth: 'female',
      heightCm: 170,
      weightKg: 70,
      activity: 'moderately_active',
      goal: 'cut',
      rateWeeklyPct: 0.7,
      goalWeightKg: 62, // BMI = 62 / 1.7^2 = 21.5 (healthy)
    }),
  });
  console.log(`  Response Status: ${resValid.status}`);
  if (resValid.status !== 200) {
    const err = await resValid.json();
    throw new Error(`Expected 200 OK, got ${resValid.status}: ${JSON.stringify(err)}`);
  }
  const validPayload = await resValid.json();
  console.log('  User profile returned:', JSON.stringify(validPayload.user));
  console.log('  Calibrated target returned:', JSON.stringify(validPayload.target));
  
  if (validPayload.target.kcal !== 1704) {
    throw new Error(`Expected computed target calories to be 1704, got ${validPayload.target.kcal}`);
  }
  console.log('  Success: Calorie target calculation correct (1704 kcal).');

  // Test Case 5: Fetch profile for registered user
  console.log('\nTest Case 5: Fetching profile for registered user...');
  const resProfile2 = await fetch(`${API_BASE}/user/profile`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const profile2 = await resProfile2.json();
  if (profile2.user.email !== uniqueEmail || profile2.target.kcal !== 1704) {
    throw new Error('Returned profile does not match registered details');
  }
  console.log('  Success: Profile returns correct user and target details.');

  // Test Case 6: Register with body composition scan details (Katch-McArdle route)
  console.log('\nTest Case 6: Registering user with lean mass (Katch-McArdle)...');
  const mockUserTokenKatch = `mock|user_${crypto.randomUUID()}`;
  const emailKatch = `katch_${crypto.randomUUID()}@example.com`;
  
  const resKatch = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mockUserTokenKatch}`,
    },
    body: JSON.stringify({
      email: emailKatch,
      birthDate: dobAdult,
      sexAtBirth: 'male',
      heightCm: 180,
      weightKg: 85,
      activity: 'very_active',
      goal: 'cut',
      rateWeeklyPct: 1.0,
      leanMassKg: 70, // Has scan details
    }),
  });
  console.log(`  Response Status: ${resKatch.status}`);
  if (resKatch.status !== 200) {
    const err = await resKatch.json();
    throw new Error(`Expected 200 OK, got ${resKatch.status}: ${JSON.stringify(err)}`);
  }
  const katchPayload = await resKatch.json();
  console.log('  Calibrated target (Katch) returned:', JSON.stringify(katchPayload.target));
  
  // Verify Katch-McArdle target:
  // BMR = 370 + 21.6 * 70 = 370 + 1512 = 1882
  // TDEE = 1882 * 1.725 (very active) = 3246.45 => 3246
  // Deficit requested = 85 * 1.0 * 11 = 935.
  // But deficit is capped at 750 kcal!
  // Target Target = 3246 - 750 = 2496
  if (katchPayload.target.kcal !== 2496 || katchPayload.target.formula !== 'katch_mcardle') {
    throw new Error(`Expected computed target calories to be 2496 (Katch-McArdle), got ${katchPayload.target.kcal} with formula ${katchPayload.target.formula}`);
  }
  console.log('  Success: Katch-McArdle formula route calculated correctly (2496 kcal).');

  // Test Case 7: Soft Delete user account
  console.log('\nTest Case 7: Deleting user account (soft delete)...');
  const resDelete = await fetch(`${API_BASE}/user/delete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  console.log(`  Response Status: ${resDelete.status}`);
  const deleteResult = await resDelete.json();
  if (resDelete.status !== 200 || !deleteResult.success) {
    throw new Error('Failed to soft delete user account');
  }

  // Fetch profile again after deletion to confirm soft deletion works
  const resProfile3 = await fetch(`${API_BASE}/user/profile`, {
    headers: { 'Authorization': `Bearer ${mockUserToken}` }
  });
  const profile3 = await resProfile3.json();
  if (profile3.user !== null) {
    throw new Error('Profile was fetched successfully after account soft-deletion!');
  }
  console.log('  Success: Account soft delete verified (returned profile is null).');

  console.log('\n--- ALL ONBOARDING API INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('\n!!! ONBOARDING API INTEGRATION TEST FAILED !!!\n', err);
  process.exit(1);
});
