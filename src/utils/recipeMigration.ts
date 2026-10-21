import legacySampleRecipes from '../data/legacySampleRecipes.v1.json';
import previousSampleRecipes from '../data/legacySampleRecipes.v2.json';
import { Recipe } from '../types';

type StoredRecipeContent = Pick<Recipe, 'id' | 'name' | 'ingredients' | 'ingredientAmounts' | 'steps' | 'minutes'> & {
  category?: Recipe['category'];
  servings?: Recipe['servings'];
};

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameContent(recipe: StoredRecipeContent, original: Omit<StoredRecipeContent, 'category' | 'ingredientAmounts'> & {
  category?: string;
  ingredientAmounts: Record<string, string | undefined>;
}): boolean {
  return recipe.name === original.name
    && recipe.minutes === original.minutes
    && (recipe.category === undefined || recipe.category === original.category)
    && sameStrings(recipe.ingredients, original.ingredients)
    && sameStrings(recipe.steps, original.steps)
    && Object.keys(recipe.ingredientAmounts).length === Object.keys(original.ingredientAmounts).length
    && Object.entries(original.ingredientAmounts).every(([ingredient, amount]) => recipe.ingredientAmounts[ingredient] === amount);
}

/** Personal images and favorites are not recipe-content edits. */
export function hasOriginalRecipeContent(recipe: StoredRecipeContent, original: Recipe): boolean {
  return sameContent(recipe, original) && (recipe.servings === undefined || recipe.servings === original.servings);
}

/** Update only an unchanged built-in recipe; keep user content and personal metadata. */
export function migrateSampleRecipe<T extends StoredRecipeContent>(recipe: T, currentSamples: Recipe[]): T {
  const legacy = legacySampleRecipes.find((sample) => sample.id === recipe.id);
  const previous = previousSampleRecipes.find((sample) => sample.id === recipe.id);
  const current = currentSamples.find((sample) => sample.id === recipe.id);
  if (!current) return recipe;
  // Keep both historical versions for old backups. Explicit serving edits also prevent replacement.
  const unchanged = [legacy, previous].some(original => original && sameContent(recipe, original))
    && (recipe.servings === undefined || recipe.servings === current.servings);
  const migrated = unchanged && !sameContent(recipe, current) ? {
    ...recipe,
    ingredients: [...current.ingredients],
    ingredientAmounts: { ...current.ingredientAmounts },
    steps: [...current.steps],
  } : recipe;
  // undefined means an old schema. null is the user's explicit "unset" choice.
  return migrated.servings === undefined && sameContent(migrated, current)
    ? { ...migrated, servings: current.servings }
    : migrated;
}
