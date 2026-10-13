import { FoodCategory } from '../types';
import { inferFoodCategory } from './foodCategory';
import { getFoodIcon } from './yahooImagePolicy';

export const fallbackFoodImage = getFoodIcon('other');

/** A local icon is the default; selecting a photo overrides it in the form. */
export function getFoodFallbackImage({ category, ingredientName = '', name = '', productName = '' }: {
  category?: FoodCategory; ingredientName?: string; name?: string; productName?: string | null;
}): string {
  const inferred = inferFoodCategory(`${ingredientName} ${name} ${productName ?? ''}`);
  return getFoodIcon(inferred === 'other' ? category ?? 'other' : inferred);
}
