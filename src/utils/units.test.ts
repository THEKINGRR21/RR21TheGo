import { kgToLbs, lbsToKg, cmToInches, inchesToCm, formatWeight, formatHeight } from './units';

describe('Unit Conversion Tests', () => {
  test('converts weight between kg and lbs correctly', () => {
    expect(kgToLbs(70)).toBeCloseTo(154.32, 1);
    expect(lbsToKg(kgToLbs(70))).toBeCloseTo(70, 5);
  });

  test('converts height between cm and inches correctly', () => {
    expect(cmToInches(170)).toBeCloseTo(66.92, 1);
    expect(inchesToCm(cmToInches(170))).toBeCloseTo(170, 5);
  });

  test('formats weight based on global user setting', () => {
    expect(formatWeight(70, 'metric')).toBe('70.0 kg');
    expect(formatWeight(70, 'imperial')).toBe('154 lbs');
  });

  test('formats height based on global user setting', () => {
    expect(formatHeight(170, 'metric')).toBe('170 cm');
    expect(formatHeight(170, 'imperial')).toBe('5\'7"');
  });
});
