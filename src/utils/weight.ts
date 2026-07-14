export interface WeightEntry {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export interface TrendPoint {
  date: string;
  weightKg: number;
  trendKg: number;
}

/**
 * Calculates exponentially smoothed weight trends matching Excel's Exponential Smoothing.
 * Accounts for variable time gaps between logs using an adjusted smoothing factor.
 *
 * S_t = S_{t-1} + alpha_adjusted * (Y_t - S_{t-1})
 * where alpha_adjusted = 1 - (1 - alpha)^dt
 */
export function calculateWeightTrends(entries: WeightEntry[], alpha = 0.1): TrendPoint[] {
  if (entries.length === 0) return [];

  // Sort entries by date ascending
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const result: TrendPoint[] = [];

  // Initialize trend with the first weight entry
  let currentTrend = sorted[0].weightKg;
  result.push({
    date: sorted[0].date,
    weightKg: sorted[0].weightKg,
    trendKg: Number(currentTrend.toFixed(2)),
  });

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    // Compute elapsed days
    const d1 = new Date(prev.date);
    const d2 = new Date(curr.date);
    const diffTime = d2.getTime() - d1.getTime();
    const dt = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    // Scale alpha for time gap
    const adjustedAlpha = 1 - Math.pow(1 - alpha, dt);

    // Apply exponential smoothing update
    currentTrend = currentTrend + adjustedAlpha * (curr.weightKg - currentTrend);

    result.push({
      date: curr.date,
      weightKg: curr.weightKg,
      trendKg: Number(currentTrend.toFixed(2)),
    });
  }

  return result;
}
