import { calculateWeightTrends, WeightEntry } from './weight';

describe('Weight Trend Smoothing Tests', () => {
  test('returns empty array when no weights are supplied', () => {
    expect(calculateWeightTrends([])).toEqual([]);
  });

  test('initializes trend with first day weight', () => {
    const weights: WeightEntry[] = [{ date: '2026-07-01', weightKg: 80.0 }];
    const trends = calculateWeightTrends(weights);
    expect(trends).toHaveLength(1);
    expect(trends[0]).toEqual({
      date: '2026-07-01',
      weightKg: 80.0,
      trendKg: 80.0,
    });
  });

  test('calculates correct daily trend using standard alpha = 0.1', () => {
    const weights: WeightEntry[] = [
      { date: '2026-07-01', weightKg: 80.0 },
      { date: '2026-07-02', weightKg: 81.0 }, // diff = 1 day, alpha = 0.1
    ];
    // S_2 = 80 + 0.1 * (81 - 80) = 80.1
    const trends = calculateWeightTrends(weights);
    expect(trends).toHaveLength(2);
    expect(trends[1].trendKg).toBe(80.1);
  });

  test('adjusts alpha correctly for multiple elapsed days (gaps)', () => {
    const weights: WeightEntry[] = [
      { date: '2026-07-01', weightKg: 80.0 },
      { date: '2026-07-03', weightKg: 81.0 }, // diff = 2 days
    ];
    // dt = 2. adjustedAlpha = 1 - (1 - 0.1)^2 = 1 - 0.81 = 0.19
    // S_3 = 80 + 0.19 * (81 - 80) = 80.19
    const trends = calculateWeightTrends(weights);
    expect(trends).toHaveLength(2);
    expect(trends[1].trendKg).toBe(80.19);
  });
});
