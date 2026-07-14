import { calibrateTDEE, CalibrationInput } from './algorithm';

describe('TDEE Calibration Algorithm Tests', () => {
  // Test Case 1: Fallback when not enough data
  test('falls back to estimated TDEE when data history is less than 7 days', () => {
    const input: CalibrationInput = {
      sex: 'female',
      weightHistory: [
        { date: '2026-07-01', weightKg: 65.0 },
      ],
      foodHistory: [
        { date: '2026-07-01', kcalLogged: 1800 },
      ],
      bmrKcal: 1350,
      goal: 'cut',
      rateWeeklyPct: 0.5,
      currentWeightKg: 65.0,
    };

    const result = calibrateTDEE(input);
    expect(result.basis).toBe('estimated');
    expect(result.calibratedTdee).toBe(Math.round(1350 * 1.55)); // Mifflin Moderately Active fallback
  });

  // Test Case 2: Stable weight calibration
  test('calibrates TDEE equal to average intake when trend weight is stable', () => {
    // Generate 14 days of stable weight and food entries
    const weightHistory = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      weightKg: 80.0,
    }));
    const foodHistory = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      kcalLogged: 2200,
    }));

    const input: CalibrationInput = {
      sex: 'male',
      weightHistory,
      foodHistory,
      bmrKcal: 1600,
      goal: 'maintain',
      rateWeeklyPct: 0,
      currentWeightKg: 80.0,
    };

    const result = calibrateTDEE(input);
    expect(result.basis).toBe('calibrated');
    expect(result.calibratedTdee).toBe(2200);
    expect(result.dailyCalorieBudget).toBe(2200);
  });

  // Test Case 3: Weight decreasing calibration (calorie deficit)
  test('calibrates TDEE higher than logged intake when weight is decreasing', () => {
    // Weight decreases from 81kg to 80kg over 14 days (-1kg change)
    // Due to EWMA trend smoothing lag, the calculated trend change is -0.48kg
    // Energy balance: -0.48 * 7700 = -3696 kcal, daily energy balance = -3696 / 14 = -264 kcal/day
    // Average logged intake = 2000 kcal/day
    // Calibrated TDEE = 2000 - (-264) = 2264 kcal
    const weightHistory = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      weightKg: 81.0 - (i * (1.0 / 13)), // linear drop from 81 to 80
    }));
    const foodHistory = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      kcalLogged: 2000,
    }));

    const input: CalibrationInput = {
      sex: 'male',
      weightHistory,
      foodHistory,
      bmrKcal: 1600,
      goal: 'maintain',
      rateWeeklyPct: 0,
      currentWeightKg: 80.0,
    };

    const result = calibrateTDEE(input);
    expect(result.basis).toBe('calibrated');
    expect(result.calibratedTdee).toBeCloseTo(2264, 0);
  });

  // Test Case 4: Under-reporting worked failure mode (Section 9 floors clamp)
  test('safely handles user food under-reporting by enforcing gender safety calorie floors', () => {
    // Scenario: User eats 2000 kcal but logs only 1200 kcal.
    // Weight is stable at 80kg (weightChange = 0).
    // Naive TDEE calculation = 1200 kcal.
    // Deficit requested: cut at 0.5% rate -> deficit = 80 * 0.5% * 1100 = 440 kcal.
    // Naive Target = 1200 - 440 = 760 kcal (dangerously low!).
    
    const weightHistory = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      weightKg: 80.0,
    }));
    const foodHistory = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      kcalLogged: 1200, // Under-reported log
    }));

    // Test for Male under-reporting (floor = 1500, bmr = 1600)
    // Since BMR (1600) is higher than the male floor (1500), it must clamp to BMR (1600)!
    const maleInput: CalibrationInput = {
      sex: 'male',
      weightHistory,
      foodHistory,
      bmrKcal: 1600,
      goal: 'cut',
      rateWeeklyPct: 0.5,
      currentWeightKg: 80.0,
    };

    const maleResult = calibrateTDEE(maleInput);
    expect(maleResult.calibratedTdee).toBe(1600); // capped at BMR floor (1600)
    // Target = 1600 - 400 (deficit) = 1200.
    // Capped to BMR floor = 1600!
    expect(maleResult.dailyCalorieBudget).toBe(1600);
    expect(maleResult.isClampedToBmrFloor).toBe(true);

    // Test for Female under-reporting (floor = 1200, bmr = 1100)
    // Since BMR (1100) is lower than the female floor (1200), it must clamp to 1200!
    const femaleInput: CalibrationInput = {
      sex: 'female',
      weightHistory,
      foodHistory,
      bmrKcal: 1100,
      goal: 'cut',
      rateWeeklyPct: 0.5,
      currentWeightKg: 80.0,
    };

    const femaleResult = calibrateTDEE(femaleInput);
    expect(femaleResult.calibratedTdee).toBe(1200); // TDEE starts at 1200 (logs: 1200)
    // Deficit cap: 25% of 1200 = 300.
    // Target = 1200 - 300 = 900.
    // Clamped to female floor = 1200!
    expect(femaleResult.dailyCalorieBudget).toBe(1200);
    expect(femaleResult.isClampedToKcalFloor).toBe(true);
  });
});
