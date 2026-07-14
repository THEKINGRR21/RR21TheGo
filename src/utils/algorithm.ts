import { WeightEntry, calculateWeightTrends } from './weight';

export interface DailyLog {
  date: string; // YYYY-MM-DD
  kcalLogged: number;
}

export interface CalibrationInput {
  sex: 'male' | 'female';
  weightHistory: WeightEntry[];
  foodHistory: DailyLog[];
  bmrKcal: number;
  goal: 'cut' | 'maintain' | 'gain';
  rateWeeklyPct: number;
  currentWeightKg: number;
}

export interface CalibrationResult {
  basis: 'estimated' | 'calibrated';
  calibratedTdee: number;
  dailyCalorieBudget: number;
  appliedDeficit: number;
  isClampedToKcalFloor: boolean;
  isClampedToBmrFloor: boolean;
  rationale: string;
}

/**
 * Calibrates TDEE using a 14-day window of trend weight changes and food intake.
 * Enforces §9 wellbeing floors and deficit ceilings.
 */
export function calibrateTDEE(input: CalibrationInput): CalibrationResult {
  const {
    sex,
    weightHistory,
    foodHistory,
    bmrKcal,
    goal,
    rateWeeklyPct,
    currentWeightKg,
  } = input;

  const kcalFloor = sex === 'male' ? 1500 : 1200;

  // 1. Calculate smoothed weight trend points
  const trendPoints = calculateWeightTrends(weightHistory);
  if (trendPoints.length < 7 || foodHistory.length < 7) {
    // Insufficient data fallback: return default target based on starting calculations
    const defaultTdee = bmrKcal * 1.55; // moderately active default multiplier
    let deficit = 0;
    if (goal === 'cut') {
      deficit = Math.round(currentWeightKg * (rateWeeklyPct / 100) * 1100);
      deficit = Math.min(deficit, Math.min(750, Math.round(defaultTdee * 0.25)));
    } else if (goal === 'gain') {
      deficit = -Math.round(currentWeightKg * (rateWeeklyPct / 100) * 1100);
      deficit = -Math.min(Math.abs(deficit), 500); // cap surplus at 500
    }

    let budget = defaultTdee - deficit;
    let clampedToKcal = false;
    let clampedToBmr = false;

    if (budget < kcalFloor) {
      budget = kcalFloor;
      clampedToKcal = true;
    }
    if (budget < bmrKcal) {
      budget = bmrKcal;
      clampedToBmr = true;
    }

    return {
      basis: 'estimated',
      calibratedTdee: Math.round(defaultTdee),
      dailyCalorieBudget: Math.round(budget),
      appliedDeficit: deficit,
      isClampedToKcalFloor: clampedToKcal,
      isClampedToBmrFloor: clampedToBmr,
      rationale: `Insufficient data (< 7 days of logs). Fallback to estimated TDEE: ${Math.round(defaultTdee)} kcal.`,
    };
  }

  // 2. Filter 14-day trailing window
  // Find start and end dates of the trailing 14-day window based on the latest weight entry
  const sortedTrends = [...trendPoints].sort((a, b) => b.date.localeCompare(a.date)); // descending
  const endDate = new Date(sortedTrends[0].date);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 13); // 14 days inclusive

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Get trend weights at boundary dates
  const endTrend = sortedTrends[0].trendKg;
  const startTrendPoint = sortedTrends.find(p => p.date <= startDateStr) || sortedTrends[sortedTrends.length - 1];
  const startTrend = startTrendPoint.trendKg;

  const weightChangeKg = endTrend - startTrend;

  // Calculate average daily calorie intake in this window
  const windowFood = foodHistory.filter(f => f.date >= startDateStr && f.date <= endDateStr);
  const totalKcal = windowFood.reduce((sum, curr) => sum + curr.kcalLogged, 0);
  // Default to BMR * 1.55 if no food logs exist at all
  const averageLoggedKcal = windowFood.length > 0 ? totalKcal / windowFood.length : bmrKcal * 1.55;

  // 3. Compute dynamic TDEE: CalibratedTDEE = AverageLoggedKcal - (WeightChangeKg * 7700 / 14)
  const daysInWindow = 14;
  const dailyEnergyBalance = (weightChangeKg * 7700) / daysInWindow;
  let calibratedTdee = Math.round(averageLoggedKcal - dailyEnergyBalance);

  // Guardrail: Calibrated TDEE must never drop below calculated BMR (metabolic baseline limit)
  if (calibratedTdee < bmrKcal) {
    calibratedTdee = bmrKcal;
  }

  // 4. Calculate daily budget based on goal
  let targetDeficit = 0;
  if (goal === 'cut') {
    targetDeficit = Math.round(currentWeightKg * (rateWeeklyPct / 100) * 1100);
    // Cap deficit at min(750 kcal, 25% of Calibrated TDEE) as per §9
    const deficitLimit = Math.min(750, Math.round(calibratedTdee * 0.25));
    targetDeficit = Math.min(targetDeficit, deficitLimit);
  } else if (goal === 'gain') {
    targetDeficit = -Math.round(currentWeightKg * (rateWeeklyPct / 100) * 1100);
    // Cap surplus at 500 kcal
    targetDeficit = -Math.min(Math.abs(targetDeficit), 500);
  }

  let dailyCalorieBudget = calibratedTdee - targetDeficit;
  let clampedToKcal = false;
  let clampedToBmr = false;

  // Enforce Section 9 caloric floors
  if (dailyCalorieBudget < kcalFloor) {
    dailyCalorieBudget = kcalFloor;
    clampedToKcal = true;
  }
  if (dailyCalorieBudget < bmrKcal) {
    dailyCalorieBudget = bmrKcal;
    clampedToBmr = true;
  }

  let rationale = `Calibrated TDEE: ${calibratedTdee} kcal. Trend weight change: ${weightChangeKg.toFixed(2)} kg over 14 days. Average logged intake: ${Math.round(averageLoggedKcal)} kcal/day.`;
  if (clampedToBmr) {
    rationale += ` Target clamped to your BMR floor of ${bmrKcal} kcal.`;
  } else if (clampedToKcal) {
    rationale += ` Target clamped to safety floor of ${kcalFloor} kcal.`;
  }

  return {
    basis: 'calibrated',
    calibratedTdee,
    dailyCalorieBudget: Math.round(dailyCalorieBudget),
    appliedDeficit: targetDeficit,
    isClampedToKcalFloor: clampedToKcal,
    isClampedToBmrFloor: clampedToBmr,
    rationale,
  };
}
