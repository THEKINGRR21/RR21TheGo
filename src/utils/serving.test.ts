export function scaleMacro(macroPer100g: number | null, grams: number): number {
  if (macroPer100g === null) return 0;
  return Number(((macroPer100g * grams) / 100).toFixed(1));
}

export function multiplierToGrams(servingGrams: number, multiplier: number): number {
  return Number((servingGrams * multiplier).toFixed(1));
}

export function gramsToMultiplier(totalGrams: number, servingGrams: number): number {
  if (servingGrams === 0) return 0;
  return Number((totalGrams / servingGrams).toFixed(2));
}

describe('Serving & Macro Calculation Tests', () => {
  test('scales kcal and macros proportionally by grams logged', () => {
    // Chicken Breast: 165 kcal, 31g Protein, 3.6g Fat per 100g
    expect(scaleMacro(165, 150)).toBe(247.5);
    expect(scaleMacro(31.0, 150)).toBe(46.5);
    expect(scaleMacro(3.6, 150)).toBe(5.4);
    expect(scaleMacro(0, 150)).toBe(0);
    expect(scaleMacro(null, 150)).toBe(0);
  });

  test('converts multiplier to total grams correctly', () => {
    // 1 scoop of protein (31g) at 1.5x multiplier
    expect(multiplierToGrams(31, 1.5)).toBe(46.5);
    // 1 banana (118g) at 0.8x multiplier
    expect(multiplierToGrams(118, 0.8)).toBe(94.4);
  });

  test('converts total grams back to multiplier correctly', () => {
    // 46.5g logged for a 31g serving
    expect(gramsToMultiplier(46.5, 31)).toBe(1.5);
    // 0g logged
    expect(gramsToMultiplier(0, 31)).toBe(0);
    // divide by zero guard
    expect(gramsToMultiplier(100, 0)).toBe(0);
  });
});
