const KG_TO_LBS = 2.2046226218;
const CM_TO_INCHES = 0.3937007874;

export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS;
}

export function lbsToKg(lbs: number): number {
  return lbs / KG_TO_LBS;
}

export function cmToInches(cm: number): number {
  return cm * CM_TO_INCHES;
}

export function inchesToCm(inches: number): number {
  return inches / CM_TO_INCHES;
}

export function formatWeight(kg: number, unit: 'metric' | 'imperial'): string {
  if (unit === 'imperial') {
    return `${Math.round(kgToLbs(kg))} lbs`;
  }
  return `${kg.toFixed(1)} kg`;
}

export function formatHeight(cm: number, unit: 'metric' | 'imperial'): string {
  if (unit === 'imperial') {
    const totalInches = Math.round(cmToInches(cm));
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}
