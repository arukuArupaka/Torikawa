import { FoodQuantityUnit } from '../types';

export const foodQuantityUnitOptions: { value: FoodQuantityUnit; label: string }[] = [
  { value: 'piece', label: '個' },
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'bottle', label: '本' },
  { value: 'bag', label: '袋' },
  { value: 'pack', label: 'パック' },
];

export const foodQuantityUnitLabels = Object.fromEntries(
  foodQuantityUnitOptions.map((option) => [option.value, option.label]),
) as Record<FoodQuantityUnit, string>;

export function isFoodQuantityUnit(value: unknown): value is FoodQuantityUnit {
  return foodQuantityUnitOptions.some((option) => option.value === value);
}

export function parseQuantityInput(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

export function isValidQuantity(value: string): boolean {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return false;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 99999;
}

export function formatQuantityValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(2)).toString();
}

export function formatFoodQuantity(value: number, unit: FoodQuantityUnit): string {
  return `${formatQuantityValue(value)}${foodQuantityUnitLabels[unit]}`;
}

export function subtractQuantity(current: number, used: number): number {
  return Math.max(0, Number((current - used).toFixed(2)));
}

function parseSimpleFraction(value: string): number | null {
  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!denominator) return null;
  return numerator / denominator;
}

export function parseRecipeAmountForUnit(amount: string, unit: FoodQuantityUnit): number | null {
  const label = foodQuantityUnitLabels[unit];
  const normalized = amount.replace(',', '.').replace(/\s+/g, '');
  const fraction = parseSimpleFraction(normalized);
  if (fraction !== null && normalized.includes(label)) return fraction;

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = normalized.match(new RegExp(`(\\d+(?:\\.\\d+)?)${escapedLabel}`));
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
