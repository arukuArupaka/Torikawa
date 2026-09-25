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

export function parseRecipeAmountForUnit(amount: string, unit: FoodQuantityUnit): number | null {
  const normalized = amount.normalize('NFKC').toLowerCase().replace(',', '.').replace(/\s+/g, '');
  const match = normalized.match(/^(?:約)?(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)(個|玉|kg|g|ml|l|本|袋|パック)$/);
  if (!match) return null;
  const units: Record<string, { unit: FoodQuantityUnit; factor: number }> = {
    個: { unit: 'piece', factor: 1 }, 玉: { unit: 'piece', factor: 1 },
    g: { unit: 'g', factor: 1 }, kg: { unit: 'g', factor: 1000 },
    ml: { unit: 'ml', factor: 1 }, l: { unit: 'ml', factor: 1000 },
    本: { unit: 'bottle', factor: 1 }, 袋: { unit: 'bag', factor: 1 },
    パック: { unit: 'pack', factor: 1 },
  };
  const sourceUnit = units[match[2]];
  if (sourceUnit.unit !== unit) return null;
  const [numerator, denominator = 1] = match[1].split('/').map(Number);
  const parsed = numerator / denominator * sourceUnit.factor;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getSuggestedUseQuantity(amounts: string[], unit: FoodQuantityUnit, available: number, multiplier = 1): number | null {
  if (amounts.length === 0 || !Number.isFinite(multiplier) || multiplier <= 0) return null;
  const parsed = amounts.map((amount) => parseRecipeAmountForUnit(amount, unit));
  if (parsed.some((amount) => amount === null)) return null;
  const total = parsed.reduce<number>((sum, amount) => sum + amount!, 0) * multiplier;
  // The inventory stores at most two decimal places. Do not guess when units differ
  // or the recipe needs more than the registered stock.
  const rounded = Number(total.toFixed(2));
  return total <= available && rounded > 0 ? rounded : null;
}
