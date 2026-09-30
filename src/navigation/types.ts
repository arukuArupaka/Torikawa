import { NavigatorScreenParams } from '@react-navigation/native';
import { StorageLocation } from '../types';

export type MainTabParamList = {
  Home: undefined;
  Calendar: undefined;
  Barcode: undefined;
  Recipes: { initialFilter?: 'urgent' | 'all' } | undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  AddFood:
    | {
        initialName?: string;
        initialProductName?: string;
        initialIngredientName?: string;
        initialImage?: string;
        initialExpiryDate?: string;
        initialMemo?: string;
        initialBarcode?: string;
        allowProductSharing?: boolean;
        initialCategory?: string;
        initialTags?: string[];
        initialStorage?: StorageLocation;
        foodId?: string;
        reuseFoodId?: string;
        shoppingItemId?: string;
      }
    | undefined;
  FoodDetail: { foodId: string };
  RecipeDetail: { recipeId: string };
  AddRecipe: { recipeId?: string } | undefined;
  ShoppingList: undefined;
  Statistics: undefined;
};
