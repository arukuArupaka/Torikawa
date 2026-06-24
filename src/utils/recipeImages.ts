import { RecipeCategory } from '../types';

const fallbackImages: Record<RecipeCategory, string> = {
  main: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800',
  side: 'https://images.unsplash.com/photo-1617692855027-33b14f061079?w=800',
  soup: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800',
  breakfast: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800',
  lunchbox: 'https://images.unsplash.com/photo-1543352634-a1c51d9f1fa7?w=800',
  mealPrep: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800',
  quick: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800',
  healthy: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800',
  other: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800',
};

export function getRecipeFallbackImage(category: RecipeCategory) {
  return fallbackImages[category];
}
