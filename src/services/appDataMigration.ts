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
import { migrateSampleRecipe } from '../utils/recipeMigration';
import { isValidServings } from '../utils/recipeServings';

import { validateSnapshot } from './dataValidation';

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
      ...food,
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
  if (!recipe.image.trim() || recipe.image === legacyImage) return sampleImage;
  return recipe.image;
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
