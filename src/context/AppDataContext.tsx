import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import {
  createSampleFoods,
  initialNotificationSettings,
  initialShoppingItems,
  sampleRecipes,
} from '../data/sampleData';
import { loadStoredValue, saveStoredValue, storageKeys } from '../services/storage';
import { deleteStoredFoodImage } from '../services/imageStorage';
import { queueNotificationSync } from '../services/notificationService';
import { AppDataSnapshot, FoodCategory, FoodItem, FoodQuantityUnit, FoodStatus, NewFoodItem, NewRecipe, NotificationSettings, Recipe, RecipeCategory, ShoppingItem } from '../types';
import { toDateString } from '../utils/date';
import { inferFoodCategory, isFoodCategory } from '../utils/foodCategory';
import { isFoodQuantityUnit } from '../utils/foodQuantity';
import { createId } from '../utils/id';
import { inferRecipeCategory, isRecipeCategory } from '../utils/recipeCategory';

type AppDataContextValue = {
  foods: FoodItem[];
  recipes: Recipe[];
  shoppingItems: ShoppingItem[];
  notificationSettings: NotificationSettings;
  isReady: boolean;
  addFood: (food: NewFoodItem) => FoodItem;
  updateFood: (id: string, food: NewFoodItem) => void;
  markFoodUsed: (id: string) => void;
  markFoodDisposed: (id: string) => void;
  restoreFood: (id: string) => void;
  deleteFood: (id: string) => void;
  addRecipe: (recipe: NewRecipe) => Recipe;
  updateRecipe: (id: string, recipe: NewRecipe) => void;
  deleteRecipe: (id: string) => void;
  toggleRecipeFavorite: (id: string) => void;
  replaceAppData: (data: AppDataSnapshot) => void;
  addShoppingItem: (name: string, memo?: string) => void;
  toggleShoppingItem: (id: string) => void;
  deleteShoppingItem: (id: string) => void;
  updateNotificationSettings: (settings: NotificationSettings) => void;
};

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

type StoredNotificationSettings = Partial<NotificationSettings> & { daysBefore?: number };
type StoredRecipe = Omit<Recipe, 'category' | 'isFavorite' | 'createdAt'> & {
  category?: RecipeCategory;
  isFavorite?: boolean;
  createdAt?: string;
};
type StoredFoodItem = Omit<FoodItem, 'category' | 'quantity' | 'quantityUnit' | 'status' | 'usedAt' | 'disposedAt'> & {
  category?: FoodCategory;
  quantity?: number;
  quantityUnit?: FoodQuantityUnit;
  status?: FoodStatus;
  usedAt?: string | null;
  disposedAt?: string | null;
};

function normalizeFoods(storedFoods: StoredFoodItem[] | null): FoodItem[] {
  const source = storedFoods ?? createSampleFoods();
  return source.map((food) => ({
    ...food,
    quantity: Number.isFinite(food.quantity) && (food.quantity ?? 0) > 0
      ? food.quantity as number
      : 1,
    quantityUnit: isFoodQuantityUnit(food.quantityUnit) ? food.quantityUnit : 'piece',
    category: isFoodCategory(food.category) ? food.category : inferFoodCategory(food.name),
    status: food.status === 'used' || food.status === 'disposed' ? food.status : 'active',
    usedAt: food.status === 'used' ? food.usedAt ?? null : null,
    disposedAt: food.status === 'disposed' ? food.disposedAt ?? null : null,
  }));
}

function normalizeRecipes(storedRecipes: StoredRecipe[] | null): Recipe[] {
  const source = storedRecipes ?? sampleRecipes;
  return source.map((recipe) => ({
    ...recipe,
    category: isRecipeCategory(recipe.category)
      ? recipe.category
      : inferRecipeCategory(recipe.name, recipe.ingredients, recipe.minutes),
    isFavorite: recipe.isFavorite ?? false,
    createdAt: recipe.createdAt ?? new Date().toISOString(),
  }));
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

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(initialNotificationSettings);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function hydrate() {
      try {
        const [storedFoods, storedShopping, storedSettings, storedRecipes] = await Promise.all([
          loadStoredValue<StoredFoodItem[]>(storageKeys.foods),
          loadStoredValue<ShoppingItem[]>(storageKeys.shopping),
          loadStoredValue<StoredNotificationSettings>(storageKeys.notifications),
          loadStoredValue<StoredRecipe[]>(storageKeys.recipes),
        ]);
        setFoods(normalizeFoods(storedFoods));
        setShoppingItems(storedShopping ?? initialShoppingItems);
        setNotificationSettings(normalizeNotificationSettings(storedSettings));
        setRecipes(normalizeRecipes(storedRecipes));
      } catch (error) {
        console.warn('保存データを読み込めませんでした。サンプルデータを表示します。', error);
        setFoods(createSampleFoods());
        setShoppingItems(initialShoppingItems);
        setRecipes(sampleRecipes);
      } finally {
        setIsReady(true);
      }
    }
    void hydrate();
  }, []);

  useEffect(() => {
    if (isReady) void saveStoredValue(storageKeys.foods, foods);
  }, [foods, isReady]);

  useEffect(() => {
    if (isReady) void saveStoredValue(storageKeys.shopping, shoppingItems);
  }, [shoppingItems, isReady]);

  useEffect(() => {
    if (isReady) void saveStoredValue(storageKeys.recipes, recipes);
  }, [isReady, recipes]);

  useEffect(() => {
    if (isReady) void saveStoredValue(storageKeys.notifications, notificationSettings);
  }, [notificationSettings, isReady]);

  useEffect(() => {
    if (!isReady) return;
    void queueNotificationSync(
      foods.filter((food) => food.status === 'active'),
      notificationSettings,
    ).catch((error) => {
      console.warn('期限通知を更新できませんでした。', error);
    });
  }, [foods, notificationSettings, isReady]);

  const addFood = (input: NewFoodItem) => {
    const food: FoodItem = {
      ...input,
      id: createId('food'),
      createdAt: new Date().toISOString(),
      status: 'active',
      usedAt: null,
      disposedAt: null,
    };
    setFoods((current) => [food, ...current]);
    return food;
  };

  const deleteFood = (id: string) => {
    setFoods((current) => {
      const target = current.find((food) => food.id === id);
      if (target) deleteStoredFoodImage(target.image);
      return current.filter((food) => food.id !== id);
    });
  };

  const updateFood = (id: string, input: NewFoodItem) => {
    setFoods((current) =>
      current.map((food) => {
        if (food.id !== id) return food;
        if (food.image !== input.image) deleteStoredFoodImage(food.image);
        return { ...food, ...input };
      }),
    );
  };

  const markFoodUsed = (id: string) => {
    const today = toDateString(new Date());
    setFoods((current) => current.map((food) =>
      food.id === id
        ? { ...food, status: 'used', usedAt: today, disposedAt: null }
        : food,
    ));
  };

  const markFoodDisposed = (id: string) => {
    const today = toDateString(new Date());
    setFoods((current) => current.map((food) =>
      food.id === id
        ? { ...food, status: 'disposed', usedAt: null, disposedAt: today }
        : food,
    ));
  };

  const restoreFood = (id: string) => {
    setFoods((current) => current.map((food) =>
      food.id === id
        ? { ...food, status: 'active', usedAt: null, disposedAt: null }
        : food,
    ));
  };

  const addRecipe = (input: NewRecipe) => {
    const recipe: Recipe = {
      ...input,
      id: createId('recipe'),
      isFavorite: false,
      createdAt: new Date().toISOString(),
    };
    setRecipes((current) => [recipe, ...current]);
    return recipe;
  };

  const updateRecipe = (id: string, input: NewRecipe) => {
    setRecipes((current) => current.map((recipe) => {
      if (recipe.id !== id) return recipe;
      if (recipe.image !== input.image) deleteStoredFoodImage(recipe.image);
      return { ...recipe, ...input };
    }));
  };

  const deleteRecipe = (id: string) => {
    setRecipes((current) => {
      const target = current.find((recipe) => recipe.id === id);
      if (target) deleteStoredFoodImage(target.image);
      return current.filter((recipe) => recipe.id !== id);
    });
  };

  const toggleRecipeFavorite = (id: string) => {
    setRecipes((current) => current.map((recipe) =>
      recipe.id === id ? { ...recipe, isFavorite: !recipe.isFavorite } : recipe,
    ));
  };

  const replaceAppData = (data: AppDataSnapshot) => {
    setFoods(normalizeFoods(data.foods));
    setRecipes(normalizeRecipes(data.recipes));
    setShoppingItems(data.shoppingItems);
    setNotificationSettings(normalizeNotificationSettings(data.notificationSettings));
  };

  const addShoppingItem = (name: string, memo?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedMemo = memo?.trim();
    setShoppingItems((current) => [
      ...current,
      {
        id: createId('shopping'),
        name: trimmedName,
        memo: trimmedMemo || undefined,
        checked: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const toggleShoppingItem = (id: string) => {
    setShoppingItems((current) =>
      current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  };

  const deleteShoppingItem = (id: string) => {
    setShoppingItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <AppDataContext.Provider
      value={{
        foods,
        recipes,
        shoppingItems,
        notificationSettings,
        isReady,
        addFood,
        updateFood,
        markFoodUsed,
        markFoodDisposed,
        restoreFood,
        deleteFood,
        addRecipe,
        updateRecipe,
        deleteRecipe,
        toggleRecipeFavorite,
        replaceAppData,
        addShoppingItem,
        toggleShoppingItem,
        deleteShoppingItem,
        updateNotificationSettings: setNotificationSettings,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
