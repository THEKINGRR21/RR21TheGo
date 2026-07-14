export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_MULTIPLIERS;
export type SexAtBirth = 'male' | 'female';
export type Goal = 'cut' | 'maintain' | 'gain';

export function calculateAge(birthDateString: string): number {
  const today = new Date();
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) {
    throw new Error('Invalid birth date format');
  }
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function calculateBMR(params: {
  sex: SexAtBirth;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  leanMassKg?: number;
}): number {
  const age = calculateAge(params.birthDate);
  if (age < 18) {
    throw new Error('Age gate: Users under 18 are not permitted.');
  }

  if (params.leanMassKg && params.leanMassKg > 0) {
    // Katch-McArdle Formula: 370 + 21.6 * LBM
    return Math.round(370 + 21.6 * params.leanMassKg);
  } else {
    // Mifflin-St Jeor Formula: 10 * weight_kg + 6.25 * height_cm - 5 * age + s
    const s = params.sex === 'male' ? 5 : -161;
    return Math.round(10 * params.weightKg + 6.25 * params.heightCm - 5 * age + s);
  }
}

export function calculateMinWeightForBMI(heightCm: number): number {
  const heightM = heightCm / 100;
  // BMI = weight_kg / height_m^2 => min_weight = 18.5 * height_m^2
  return Math.round((18.5 * heightM * heightM) * 10) / 10;
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export interface TargetCalculationResult {
  bmr: number;
  tdee: number;
  rawTarget: number;
  clampedTarget: number;
  rationale: string;
  appliedDeficit: number;
  isClampedToKcalFloor: boolean;
  isClampedToBmrFloor: boolean;
}

export function computeTarget(params: {
  sex: SexAtBirth;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  rateWeeklyPct: number; // e.g., 0.5 for 0.5% weight change per week
  leanMassKg?: number;
  goalWeightKg?: number;
}): TargetCalculationResult {
  const age = calculateAge(params.birthDate);
  if (age < 18) {
    throw new Error('Age gate: Users under 18 are not permitted.');
  }

  // BMI Validation
  const currentBMI = calculateBMI(params.weightKg, params.heightCm);
  if (params.goalWeightKg) {
    const goalBMI = calculateBMI(params.goalWeightKg, params.heightCm);
    if (goalBMI < 18.5) {
      throw new Error(`Invalid goal weight: BMI of ${goalBMI} is below the healthy floor of 18.5.`);
    }
  } else if (params.goal === 'cut' && currentBMI < 18.5) {
    throw new Error(`Cannot select weight loss: your current BMI of ${currentBMI} is already below the healthy floor of 18.5.`);
  }

  const bmr = calculateBMR(params);
  const multiplier = ACTIVITY_MULTIPLIERS[params.activity];
  const tdee = Math.round(bmr * multiplier);

  let rawTarget = tdee;
  let appliedDeficit = 0;
  let rationale = '';

  if (params.goal === 'maintain') {
    rawTarget = tdee;
    rationale = `Maintenance target: set to your TDEE of ${tdee} kcal.`;
  } else if (params.goal === 'cut') {
    // 1% of bodyweight per week is the cap on rate of loss
    const rate = Math.min(params.rateWeeklyPct, 1.0);
    
    // Convert rate weekly percentage of weight to daily calorie deficit
    // 1% of weight in kg = weightKg * 0.01
    // 1 kg fat = 7700 kcal. Daily deficit = (weightKg * rate / 100) * 7700 / 7 = weightKg * rate * 11
    const rawDeficit = Math.round(params.weightKg * rate * 11);

    // Deficit cap: 25% of TDEE, or 750 kcal, whichever is smaller
    const maxDeficitByTdee = tdee * 0.25;
    const maxDeficitAbsolute = 750;
    const deficitCap = Math.min(maxDeficitByTdee, maxDeficitAbsolute);

    appliedDeficit = Math.min(rawDeficit, deficitCap);
    rawTarget = tdee - appliedDeficit;
    
    rationale = `Calculated TDEE: ${tdee} kcal. Applied deficit: ${appliedDeficit} kcal based on a weekly loss rate of ${rate}%.`;
  } else if (params.goal === 'gain') {
    // Bulking target: surplus is raw surplus based on rate
    const surplus = Math.round(params.weightKg * params.rateWeeklyPct * 11);
    rawTarget = tdee + surplus;
    rationale = `Calculated TDEE: ${tdee} kcal. Applied surplus: ${surplus} kcal based on a weekly gain rate of ${params.rateWeeklyPct}%.`;
  }

  // Enforce Hard Calorie Floors:
  // Target kcal may never be set below 1,500 (male) / 1,200 (female), and never below the user's calculated BMR.
  const absoluteFloor = params.sex === 'male' ? 1500 : 1200;
  
  let clampedTarget = rawTarget;
  let isClampedToKcalFloor = false;
  let isClampedToBmrFloor = false;

  if (clampedTarget < absoluteFloor) {
    clampedTarget = absoluteFloor;
    isClampedToKcalFloor = true;
  }

  if (clampedTarget < bmr) {
    clampedTarget = bmr;
    isClampedToBmrFloor = true;
    isClampedToKcalFloor = false; // BMR clamp overrides/takes precedence
  }

  if (isClampedToBmrFloor) {
    rationale += ` Target clamped to your BMR of ${bmr} kcal to prevent unsafe low energy intake.`;
  } else if (isClampedToKcalFloor) {
    rationale += ` Target clamped to the safety floor of ${absoluteFloor} kcal for ${params.sex} users.`;
  }

  return {
    bmr,
    tdee,
    rawTarget,
    clampedTarget,
    rationale,
    appliedDeficit,
    isClampedToKcalFloor,
    isClampedToBmrFloor,
  };
}
