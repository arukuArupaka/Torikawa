import {
  createSampleFoods,
  initialNotificationSettings,
  legacySampleRecipeImages,
  sampleRecipeImages,
  sampleRecipes,
} from '../data/sampleData';
import { AppDataSnapshot, FoodCategory, FoodItem, FoodQuantityUnit, FoodStatus, NotificationSettings, Recipe, RecipeCategory } from '../types';
import { inferFoodCategory, isFoodCategory } from '../utils/foodCategory';
import { isFoodQuantityUnit } from '../utils/foodQuantity';
import { normalizeProductToIngredient } from '../utils/ingredientNormalizer';
import { inferRecipeCategory, isRecipeCategory } from '../utils/recipeCategory';
import { hasOriginalRecipeContent, migrateSampleRecipe } from '../utils/recipeMigration';
import { generatedRecipeImages } from '../data/generatedRecipeImages';
import legacyRecipeImageAssets from '../data/legacyRecipeImageAssets.v1.json';
import { isValidServings } from '../utils/recipeServings';

import { validateSnapshot } from './dataValidation';
import { withoutYahooImage } from '../utils/yahooImagePolicy';

type StoredNotificationSettings = Partial<NotificationSettings> & { daysBefore?: number };
type StoredRecipe = Omit<Recipe, 'category' | 'isFavorite' | 'createdAt'> & {
  category?: RecipeCategory;
  isFavorite?: boolean;
  createdAt?: string;
};
type StoredFoodItem = Omit<FoodItem, 'productName' | 'ingredientName' | 'category' | 'tags' | 'quantity' | 'quantityUnit' | 'status' | 'usedAt' | 'disposedAt'> & {
  productName?: string | null;
  ingredientName?: string;
  category?: FoodCategory;
  tags?: string[];
  quantity?: number;
  quantityUnit?: FoodQuantityUnit;
  status?: FoodStatus;
  usedAt?: string | null;
  disposedAt?: string | null;
};

function normalizeFoods(storedFoods: StoredFoodItem[] | null): FoodItem[] {
  const source = storedFoods ?? createSampleFoods();
  return source.map((food) => {
    const normalized = normalizeProductToIngredient(food.productName || food.ingredientName || food.name);
    return {
      ...withoutYahooImage(food),
      ...(food.barcode === undefined && /^バーコード: \d{8,14}$/.test(food.memo)
        ? { barcode: food.memo.slice('バーコード: '.length) } : {}),
      productName: food.productName?.trim() || null,
      ingredientName: food.ingredientName?.trim() || normalized.ingredientName,
      tags: Array.isArray(food.tags) && food.tags.length > 0 ? food.tags : normalized.tags,
      quantity: Number.isFinite(food.quantity) && (food.quantity ?? 0) > 0
        ? food.quantity as number
        : 1,
      quantityUnit: isFoodQuantityUnit(food.quantityUnit) ? food.quantityUnit : 'piece',
      category: isFoodCategory(food.category) ? food.category : normalized.category || inferFoodCategory(food.name),
      status: food.status === 'used' || food.status === 'disposed' ? food.status : 'active',
      usedAt: food.status === 'used' ? food.usedAt ?? null : null,
      disposedAt: food.status === 'disposed' ? food.disposedAt ?? null : null,
    };
  });
}

function normalizeRecipes(storedRecipes: StoredRecipe[] | null): Recipe[] {
  const source = storedRecipes ?? sampleRecipes;
  return source.map((storedRecipe) => {
    const recipe = migrateSampleRecipe(storedRecipe, sampleRecipes);
    return {
      ...recipe,
      ...(recipe.servings === undefined ? {} : { servings: isValidServings(recipe.servings) ? recipe.servings : null }),
      image: normalizeRecipeImage(recipe),
      category: isRecipeCategory(recipe.category)
        ? recipe.category
        : inferRecipeCategory(recipe.name, recipe.ingredients, recipe.minutes),
      isFavorite: recipe.isFavorite ?? false,
      createdAt: recipe.createdAt ?? new Date().toISOString(),
    };
  });
}

function normalizeRecipeImage(recipe: StoredRecipe): string {
  const sampleImage = sampleRecipeImages[recipe.id];
  const legacyImage = legacySampleRecipeImages[recipe.id];
  if (!sampleImage) return recipe.image;
  const original = sampleRecipes.find(sample => sample.id === recipe.id);
  if (Object.hasOwn(generatedRecipeImages, recipe.id) && recipe.image === 'food-icon:other'
    && original && hasOriginalRecipeContent(recipe, original)) return sampleImage;
  if (!recipe.image.trim() || recipe.image === legacyImage || isLegacyBundledRecipeImage(recipe.image, recipe.id)
    || isSameMetroRecipeImage(recipe.image, sampleImage)) return sampleImage;
  return recipe.image;
}

/** Only the recorded path AND content hash identify a replaced built-in photo. Personal photos stay untouched. */
function isLegacyBundledRecipeImage(image: string, id: string): boolean {
  const asset = legacyRecipeImageAssets.find(record => record.id === id);
  if (!asset || !/^(?:https?:\/\/|\/|\.\/assets\/)/.test(image)) return false;
  try {
    const url = new URL(image, 'https://bundled.invalid/');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return false;
    if (url.pathname === '/assets/') {
      return ![...url.searchParams.keys()].some(key => !['unstable_path', 'platform', 'hash'].includes(key))
        && url.searchParams.getAll('unstable_path').length === 1 && url.searchParams.getAll('hash').length === 1
        && url.searchParams.get('unstable_path') === asset.metroPath && url.searchParams.get('hash') === asset.md5;
    }
    const filename = asset.metroPath.slice('./assets/recipes/'.length).replace(/\.jpg$/, `.${asset.md5}.jpg`);
    return !url.search && url.pathname.endsWith(`/assets/assets/recipes/${filename}`);
  } catch { return false; }
}

/** Expo Go hosts change between sessions; match the known asset path and contents, never just its filename. */
function isSameMetroRecipeImage(savedImage: string, currentImage: string): boolean {
  try {
    const saved = new URL(savedImage);
    const current = new URL(currentImage);
    if (![saved, current].every(url => ['http:', 'https:'].includes(url.protocol)
      && !url.username && !url.password && url.pathname === '/assets/')) return false;
    if (saved.hash || [...saved.searchParams.keys()].some(key => !['unstable_path', 'platform', 'hash'].includes(key))) return false;
    const assetPath = current.searchParams.get('unstable_path');
    const hash = current.searchParams.get('hash');
    return Boolean(assetPath?.startsWith('./assets/recipes/') && hash
      && saved.searchParams.getAll('unstable_path').length === 1 && saved.searchParams.getAll('hash').length === 1
      && saved.searchParams.get('unstable_path') === assetPath && saved.searchParams.get('hash') === hash);
  } catch { return false; }
}

function normalizeNotificationSettings(
  stored: StoredNotificationSettings | null,
): NotificationSettings {
  if (!stored) return initialNotificationSettings;

  const sourceDays = Array.isArray(stored.daysBeforeList)
    ? stored.daysBeforeList
    : typeof stored.daysBefore === 'number'
      ? [stored.daysBefore]
      : initialNotificationSettings.daysBeforeList;
  const daysBeforeList = [...new Set(sourceDays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 365)
    .sort((a, b) => a - b);

  return {
    enabled: stored.enabled ?? initialNotificationSettings.enabled,
    daysBeforeList,
    time: stored.time ?? initialNotificationSettings.time,
  };
}

export function normalizeAppData(data: AppDataSnapshot): AppDataSnapshot {
  validateSnapshot(data);
  return {
    foods: normalizeFoods(data.foods),
    recipes: normalizeRecipes(data.recipes),
    shoppingItems: data.shoppingItems,
    notificationSettings: normalizeNotificationSettings(data.notificationSettings),
  };
}
