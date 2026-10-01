import { createSampleFoods, initialNotificationSettings, initialShoppingItems, sampleRecipes } from './sampleData';
import { AppDataSnapshot } from '../types';

/** Existing saved collections always take priority over these first-launch defaults. */
export function createInitialData(allowDemo = true): AppDataSnapshot {
  const demo = allowDemo && process.env.EXPO_PUBLIC_DEMO_DATA === 'true';
  return {
    foods: demo ? createSampleFoods() : [],
    shoppingItems: demo ? initialShoppingItems : [],
    recipes: sampleRecipes,
    notificationSettings: demo ? initialNotificationSettings : { ...initialNotificationSettings, enabled: false },
  };
}
