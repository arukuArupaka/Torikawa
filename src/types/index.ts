export type StorageLocation = 'refrigerated' | 'frozen' | 'room';
export type FoodStatus = 'active' | 'used' | 'disposed';
export type FoodQuantityUnit = 'piece' | 'g' | 'ml' | 'bottle' | 'bag' | 'pack';
export type FoodCategory =
  | 'vegetables'
  | 'meat'
  | 'seafood'
  | 'dairy'
  | 'eggs'
  | 'staples'
  | 'seasonings'
  | 'beverages'
  | 'other';
export type RecipeCategory =
  | 'main'
  | 'side'
  | 'soup'
  | 'breakfast'
  | 'lunchbox'
  | 'mealPrep'
  | 'quick'
  | 'healthy'
  | 'other';

export type FoodItem = {
  id: string;
  name: string;
  image: string;
  category: FoodCategory;
  storage: StorageLocation;
  quantity: number;
  quantityUnit: FoodQuantityUnit;
  expiryDate: string;
  purchaseDate: string;
  memo: string;
  createdAt: string;
  status: FoodStatus;
  usedAt: string | null;
  disposedAt: string | null;
};

export type NewFoodItem = Omit<
  FoodItem,
  'id' | 'createdAt' | 'status' | 'usedAt' | 'disposedAt'
>;

export type ShoppingItem = {
  id: string;
  name: string;
  memo?: string;
  checked: boolean;
  createdAt: string;
};

export type NotificationSettings = {
  enabled: boolean;
  daysBeforeList: number[];
  time: string;
};

export type Recipe = {
  id: string;
  name: string;
  image: string;
  category: RecipeCategory;
  ingredients: string[];
  ingredientAmounts: Record<string, string>;
  steps: string[];
  minutes: number;
  isFavorite: boolean;
  createdAt: string;
};

export type NewRecipe = Omit<Recipe, 'id' | 'isFavorite' | 'createdAt'>;

export type AppDataSnapshot = {
  foods: FoodItem[];
  recipes: Recipe[];
  shoppingItems: ShoppingItem[];
  notificationSettings: NotificationSettings;
};
