import { RecipeCategory } from '../types';

/** New recipes without a photo use an offline icon, never an unverified stock image. */
export function getRecipeFallbackImage(_category: RecipeCategory) {
  return 'food-icon:other';
}
