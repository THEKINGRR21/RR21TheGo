import { calculateAge, calculateBMR, calculateBMI, computeTarget } from './nutrition';

describe('Nutrition Utility Tests', () => {
  // Helper to set birthdate based on age in years
  function getBirthdateForAge(years: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    // ensure month and day are aligned
    return d.toISOString().split('T')[0];
  }

  describe('Age Calculations & Age Gate', () => {
    test('calculateAge returns correct age in years', () => {
      const birthDate = getBirthdateForAge(25);
      expect(calculateAge(birthDate)).toBe(25);
    });

    test('calculateBMR throws error if age under 18', () => {
      const youngBirthDate = getBirthdateForAge(17);
      expect(() => {
        calculateBMR({
          sex: 'male',
          birthDate: youngBirthDate,
          heightCm: 180,
          weightKg: 80,
        });
      }).toThrow('Age gate');
    });

    test('computeTarget throws error if age under 18', () => {
      const youngBirthDate = getBirthdateForAge(15);
      expect(() => {
        computeTarget({
          sex: 'female',
          birthDate: youngBirthDate,
          heightCm: 165,
          weightKg: 60,
          activity: 'sedentary',
          goal: 'maintain',
          rateWeeklyPct: 0.5,
        });
      }).toThrow('Age gate');
    });
  });

  describe('BMR Formulas', () => {
    test('calculateBMR computes Mifflin-St Jeor for males', () => {
      // 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      // 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780
      const bmr = calculateBMR({
        sex: 'male',
        birthDate: getBirthdateForAge(30),
        heightCm: 180,
        weightKg: 80,
      });
      expect(bmr).toBe(1780);
    });

    test('calculateBMR computes Mifflin-St Jeor for females', () => {
      // 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
      // 10 * 60 + 6.25 * 165 - 5 * 25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25 => 1345
      const bmr = calculateBMR({
        sex: 'female',
        birthDate: getBirthdateForAge(25),
        heightCm: 165,
        weightKg: 60,
      });
      expect(bmr).toBe(1345);
    });

    test('calculateBMR computes Katch-McArdle when lean mass is provided', () => {
      // BMR = 370 + 21.6 * leanMassKg
      // 370 + 21.6 * 65 = 370 + 1404 = 1774
      const bmr = calculateBMR({
        sex: 'male',
        birthDate: getBirthdateForAge(25),
        heightCm: 180,
        weightKg: 80,
        leanMassKg: 65,
      });
      expect(bmr).toBe(1774);
    });
  });

  describe('BMI Limits & Floors', () => {
    test('calculateBMI returns correct BMI', () => {
      // 80 / (1.8^2) = 24.69 => 24.7
      expect(calculateBMI(80, 180)).toBe(24.7);
    });

    test('computeTarget throws error if cut requested when BMI < 18.5', () => {
      const skinnyBirthDate = getBirthdateForAge(20);
      expect(() => {
        computeTarget({
          sex: 'female',
          birthDate: skinnyBirthDate,
          heightCm: 170,
          weightKg: 50, // BMI = 50 / 1.7^2 = 17.3 (< 18.5)
          activity: 'sedentary',
          goal: 'cut',
          rateWeeklyPct: 0.5,
        });
      }).toThrow('BMI of 17.3 is already below the healthy floor');
    });

    test('computeTarget throws error if goal weight implies BMI < 18.5', () => {
      const birthDate = getBirthdateForAge(20);
      expect(() => {
        computeTarget({
          sex: 'male',
          birthDate: birthDate,
          heightCm: 180,
          weightKg: 80,
          activity: 'sedentary',
          goal: 'cut',
          rateWeeklyPct: 0.5,
          goalWeightKg: 55, // BMI = 55 / 1.8^2 = 17.0 (< 18.5)
        });
      }).toThrow('BMI of 17 is below the healthy floor');
    });
  });

  describe('Deficit Caps & Caloric Floors', () => {
    test('Deficit is capped at 25% of TDEE or 750 kcal', () => {
      // Weight 100kg, height 180, age 30, active.
      // BMR = 10*100 + 6.25*180 - 5*30 + 5 = 1000 + 1125 - 150 + 5 = 1980
      // TDEE = 1980 * 1.55 = 3069
      // 25% of TDEE = 767.25 kcal. 750 kcal is smaller.
      // Deficit requested at 1% of bodyweight = 100 * 1.0 * 11 = 1100 kcal.
      // Clamped deficit should be 750 kcal.
      const result = computeTarget({
        sex: 'male',
        birthDate: getBirthdateForAge(30),
        heightCm: 180,
        weightKg: 100,
        activity: 'moderately_active',
        goal: 'cut',
        rateWeeklyPct: 1.0,
      });
      expect(result.appliedDeficit).toBe(750);
      expect(result.clampedTarget).toBe(3069 - 750); // 2319
    });

    test('Male target kcal clamp is enforced (floor = 1500)', () => {
      // Let's force a low target:
      // Weight 60kg, height 160, age 40, sedentary.
      // BMR = 10*60 + 6.25*160 - 5*40 + 5 = 600 + 1000 - 200 + 5 = 1405
      // TDEE = 1405 * 1.2 = 1686
      // Deficit requested: 1% => 60 * 1 * 11 = 660 kcal.
      // Raw Target: 1686 - 660 = 1026
      // Floor is 1500 (since 1500 > BMR of 1405).
      const result = computeTarget({
        sex: 'male',
        birthDate: getBirthdateForAge(40),
        heightCm: 160,
        weightKg: 60,
        activity: 'sedentary',
        goal: 'cut',
        rateWeeklyPct: 1.0,
      });
      expect(result.clampedTarget).toBe(1500);
      expect(result.isClampedToKcalFloor).toBe(true);
    });

    test('Female target kcal clamp is enforced (floor = 1200)', () => {
      // Weight 50kg, height 155, age 45, sedentary.
      // BMR = 10*50 + 6.25*155 - 5*45 - 161 = 500 + 968.75 - 225 - 161 = 1082.75 => 1083
      // TDEE = 1083 * 1.2 = 1300
      // Deficit requested: 1% => 50 * 1.0 * 11 = 550.
      // Raw Target: 1300 - 550 = 750
      // Floor is 1200 (since 1200 > BMR of 1083).
      const result = computeTarget({
        sex: 'female',
        birthDate: getBirthdateForAge(45),
        heightCm: 155,
        weightKg: 50,
        activity: 'sedentary',
        goal: 'cut',
        rateWeeklyPct: 1.0,
      });
      expect(result.clampedTarget).toBe(1200);
      expect(result.isClampedToKcalFloor).toBe(true);
    });

    test('Target is clamped to BMR if target goes below BMR but is above kcal floor', () => {
      // Male user:
      // BMR = 1900
      // TDEE = 1900 * 1.2 = 2280
      // Deficit: 2280 * 0.25 = 570.
      // Raw Target: 2280 - 570 = 1710 (above absolute floor 1500, but below BMR 1900)
      // Clamped Target should be BMR (1900).
      const result = computeTarget({
        sex: 'male',
        birthDate: getBirthdateForAge(30),
        heightCm: 190,
        weightKg: 95,
        activity: 'sedentary',
        goal: 'cut',
        rateWeeklyPct: 1.0, // Will request maximum deficit of 750, clamped by 25% = 570.
      });
      expect(result.clampedTarget).toBe(result.bmr);
      expect(result.isClampedToBmrFloor).toBe(true);
    });
  });
});
