import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { initialNotificationSettings } from '../data/sampleData';
import { createInitialData } from '../data/initialData';
import { collectStoredImages, loadStoredValues, saveStoredValue, storageKeys, RestoreNeedsReloadError, DataErasurePendingError, hasPendingDataErasure } from '../services/storage';
import { deleteStoredFoodImage } from '../services/imageStorage';
import { queueNotificationSync } from '../services/notificationService';
import { normalizeAppData } from '../services/appDataMigration';
import { validateStoredData } from '../services/dataValidation';
import type { BackupPayload } from '../services/backupService';
import { AppDataSnapshot, FoodItem, NewFoodItem, NewRecipe, NotificationSettings, Recipe, ShoppingItem } from '../types';
import { toDateString } from '../utils/date';
import { createId } from '../utils/id';
import { hasPendingShoppingItem } from '../utils/shoppingList';
import { applyFoodConsumption, ConsumptionRequest } from '../utils/foodConsumption';

type AppDataContextValue = {
  foods: FoodItem[];
  recipes: Recipe[];
  shoppingItems: ShoppingItem[];
  notificationSettings: NotificationSettings;
  isReady: boolean;
  isRestoring: boolean;
  restoreAppData: (payload: BackupPayload) => Promise<void>;
  eraseAppData: () => Promise<void>;
  isErasing: boolean;
  erasurePending: boolean;
  erasureError: string | null;
  loadError: string | null;
  retryLoad: () => void;
  saveError: string | null;
  retrySave: () => void;
  addFood: (food: NewFoodItem, shoppingItemId?: string) => FoodItem;
  updateFood: (id: string, food: NewFoodItem) => void;
  markFoodUsed: (id: string) => void;
  recordConsumption: (request: ConsumptionRequest) => boolean;
  markFoodDisposed: (id: string) => void;
  restoreFood: (id: string) => void;
  deleteFood: (id: string) => void;
  addRecipe: (recipe: NewRecipe) => Recipe;
  updateRecipe: (id: string, recipe: NewRecipe) => void;
  deleteRecipe: (id: string) => void;
  toggleRecipeFavorite: (id: string) => void;
  replaceAppData: (data: AppDataSnapshot) => void;
  addShoppingItem: (name: string, memo?: string) => boolean;
  toggleShoppingItem: (id: string) => void;
  deleteShoppingItem: (id: string) => void;
  updateNotificationSettings: (settings: NotificationSettings) => Promise<void>;
  resyncNotifications: () => Promise<void>;
  notificationSyncError: string | null;
  isNotificationSyncing: boolean;
};

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);
type FoodData = Pick<AppDataContextValue, 'foods' | 'addShoppingItem' | 'markFoodUsed' | 'markFoodDisposed' | 'updateFood'>;
const FoodDataContext = createContext<FoodData | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [foods, setFoodsState] = useState<FoodItem[]>([]);
  const foodsRef = useRef<FoodItem[]>([]);
  const setFoods = (update: FoodItem[] | ((current: FoodItem[]) => FoodItem[])) => {
    const next = typeof update === 'function' ? update(foodsRef.current) : update;
    foodsRef.current = next;
    setFoodsState(next);
  };
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [shoppingItems, setShoppingItemsState] = useState<ShoppingItem[]>([]);
  const shoppingRef = useRef<ShoppingItem[]>([]);
  const setShoppingItems = (update: ShoppingItem[] | ((current: ShoppingItem[]) => ShoppingItem[])) => {
    const next = typeof update === 'function' ? update(shoppingRef.current) : update;
    shoppingRef.current = next;
    setShoppingItemsState(next);
  };
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(initialNotificationSettings);
  const [isReady, setIsReady] = useState(false);
  const [notificationSyncError, setNotificationSyncError] = useState<string | null>(null);
  const [isNotificationSyncing, setIsNotificationSyncing] = useState(false);
  const notificationRun = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const restoringRef = useRef(false);
  const [isErasing, setIsErasing] = useState(false);
  const [erasurePending, setErasurePending] = useState(false);
  const [erasureError, setErasureError] = useState<string | null>(null);
  const dataEpoch = useRef(0);
  const imageCandidates = useRef(new Set<string>());
  const currentImages = useRef(new Set<string>());
  const persisted = useRef(new Map<string, unknown>());
  currentImages.current = new Set([...foods, ...recipes].map((item) => item.image));

  useEffect(() => {
    let cancelled = false;
    const hydrationEpoch = dataEpoch.current;
    async function hydrate() {
      setLoadError(null);
      try {
        const [storedFoods, storedShopping, storedSettings, storedRecipes, catalog] = await loadStoredValues([
          storageKeys.foods, storageKeys.shopping, storageKeys.notifications, storageKeys.recipes, storageKeys.learnedProducts,
        ]);
        // Normalize all records before committing any state. A malformed record must
        // not trigger persistence of partial data or sample fallbacks.
        if (catalog !== null) validateStoredData('learnedProducts', catalog);
        const initial = createInitialData();
        const next = normalizeAppData({
          foods: storedFoods ?? initial.foods,
          recipes: storedRecipes ?? initial.recipes,
          shoppingItems: storedShopping ?? initial.shoppingItems,
          notificationSettings: storedSettings ?? initial.notificationSettings,
        } as AppDataSnapshot);
        if (cancelled || hydrationEpoch !== dataEpoch.current) return;
        setFoods(next.foods);
        setShoppingItems(next.shoppingItems);
        setNotificationSettings(next.notificationSettings);
        setRecipes(next.recipes);
        [...next.foods, ...next.recipes].forEach((item) => imageCandidates.current.add(item.image));
        setIsReady(true);
      } catch (error) {
        if (cancelled || hydrationEpoch !== dataEpoch.current) return;
        if (error instanceof DataErasurePendingError) {
          if (!cancelled) { setErasurePending(true); setErasureError(error.message); }
          return;
        }
        console.warn('保存データを読み込めませんでした。元のデータを保持します。', error);
        if (!cancelled) setLoadError('保存データを読み込めませんでした。データは上書きせずに保護しています。' + (error instanceof Error ? `\n${error.message}` : ''));
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!isReady || isRestoring || restoringRef.current) return;
    let cancelled = false;
    const savingEpoch = dataEpoch.current;
    currentImages.current.forEach((uri) => imageCandidates.current.add(uri));
    const snapshots: [string, unknown][] = [
      [storageKeys.foods, foods], [storageKeys.shopping, shoppingItems],
      [storageKeys.recipes, recipes], [storageKeys.notifications, notificationSettings],
    ];
    void Promise.all(snapshots.filter(([key, value]) => persisted.current.get(key) !== value).map(async ([key, value]) => {
      await saveStoredValue(key, value);
      if (savingEpoch === dataEpoch.current) persisted.current.set(key, value);
    })).then(() => {
      if (!cancelled && savingEpoch === dataEpoch.current && !restoringRef.current) {
        setSaveError(null);
        void collectStoredImages(imageCandidates.current, () => currentImages.current, deleteStoredFoodImage)
          .catch((error) => console.warn('写真の整理を延期します。', error));
      }
    }).catch((error) => {
      if (!cancelled && savingEpoch === dataEpoch.current && error instanceof DataErasurePendingError) {
        setIsReady(false); setErasurePending(true); setErasureError(error.message); return;
      }
      if (!cancelled && savingEpoch === dataEpoch.current && error instanceof RestoreNeedsReloadError) {
        setIsReady(false); setLoadError(error.message); return;
      }
      console.warn('変更を端末へ保存できませんでした。', error);
      if (!cancelled && savingEpoch === dataEpoch.current && !restoringRef.current) setSaveError('変更を保存できませんでした。アプリを閉じずに、保存を再試行してください。');
    });
    return () => { cancelled = true; };
  }, [foods, shoppingItems, recipes, notificationSettings, isReady, saveAttempt, isRestoring]);

  const resyncNotifications = async (settings = notificationSettings) => {
    const run = ++notificationRun.current;
    setIsNotificationSyncing(true);
    try {
      await queueNotificationSync(foodsRef.current, settings);
      if (run === notificationRun.current) setNotificationSyncError(null);
    } catch (error) {
      if (run === notificationRun.current) setNotificationSyncError(error instanceof Error ? error.message : '通知予約を更新できませんでした。');
      throw error;
    } finally {
      if (run === notificationRun.current) setIsNotificationSyncing(false);
    }
  };
  const notificationInputs = JSON.stringify(foods.map(({ id, name, productName, expiryDate, status }) => [id, name, productName, expiryDate, status]));
  useEffect(() => {
    if (!isReady || isRestoring || restoringRef.current) return;
    const sync = () => { if (!restoringRef.current) void resyncNotifications().catch(() => undefined); };
    sync();
    const subscription = AppState?.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => subscription?.remove();
  }, [notificationInputs, notificationSettings, isReady, isRestoring]);

  const updateNotificationSettings = async (settings: NotificationSettings) => {
    const epoch = dataEpoch.current;
    await saveStoredValue(storageKeys.notifications, settings);
    if (epoch !== dataEpoch.current || restoringRef.current) throw new Error('復元中に設定が変わりました。現在の設定を確認してください。');
    persisted.current.set(storageKeys.notifications, settings);
    setNotificationSettings(settings);
    await resyncNotifications(settings);
  };

  const addFood = (input: NewFoodItem, shoppingItemId?: string) => {
    if (shoppingItemId) {
      const existing = foodsRef.current.find((food) => food.sourceShoppingItemId === shoppingItemId);
      if (existing) throw new Error('この購入分は食材に登録済みです。買い物リストから登録済みの食材を確認してください。');
      const item = shoppingRef.current.find((item) => item.id === shoppingItemId);
      if (!item?.checked) throw new Error('購入状態が変わりました。買い物リストで購入済みになっていることを確認してください。');
    }
    const food: FoodItem = {
      ...input,
      ...(shoppingItemId ? { sourceShoppingItemId: shoppingItemId } : {}),
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
    setFoods((current) => current.filter((food) => food.id !== id));
  };

  const updateFood = (id: string, input: NewFoodItem) => {
    setFoods((current) =>
      current.map((food) => {
        if (food.id !== id) return food;
        return { ...food, ...input, id: food.id, createdAt: food.createdAt,
          status: food.status, usedAt: food.usedAt, disposedAt: food.disposedAt,
          consumptionHistory: food.consumptionHistory, revision: (food.revision ?? 0) + 1 };
      }),
    );
  };

  const markFoodUsed = (id: string) => {
    const today = toDateString(new Date());
    setFoods((current) => current.map((food) =>
      food.id === id
        ? { ...food, status: 'used', usedAt: today, disposedAt: null, revision: (food.revision ?? 0) + 1 }
        : food,
    ));
  };

  const markFoodDisposed = (id: string) => {
    const today = toDateString(new Date());
    setFoods((current) => current.map((food) =>
      food.id === id
        ? { ...food, status: 'disposed', usedAt: null, disposedAt: today, revision: (food.revision ?? 0) + 1 }
        : food,
    ));
  };

  const restoreFood = (id: string) => {
    setFoods((current) => current.map((food) =>
      food.id === id
        ? { ...food, status: 'active', usedAt: null, disposedAt: null, revision: (food.revision ?? 0) + 1 }
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
      return { ...recipe, ...input };
    }));
  };

  const deleteRecipe = (id: string) => {
    setRecipes((current) => current.filter((recipe) => recipe.id !== id));
  };

  const toggleRecipeFavorite = (id: string) => {
    setRecipes((current) => current.map((recipe) =>
      recipe.id === id ? { ...recipe, isFavorite: !recipe.isFavorite } : recipe,
    ));
  };

  const replaceAppData = (data: AppDataSnapshot) => {
    const next = normalizeAppData(data);
    setFoods(next.foods);
    setRecipes(next.recipes);
    setShoppingItems(next.shoppingItems);
    setNotificationSettings(next.notificationSettings);
  };

  const operationEpoch = dataEpoch.current;
  const restoreAppData = async (payload: BackupPayload) => {
    if (operationEpoch !== dataEpoch.current) throw new Error('保存データが変更されています。現在の画面から操作し直してください。');
    if (erasurePending || erasureError) throw new Error('削除が完了するまで復元できません。');
    if (restoringRef.current) throw new Error('復元はすでに実行中です。');
    restoringRef.current = true;
    dataEpoch.current += 1;
    setIsRestoring(true);
    try {
      // Lazy loading also keeps the platform file picker out of ordinary startup.
      const { restoreBackup } = await import('../services/backupService');
      const snapshot = await restoreBackup(payload, normalizeAppData);
      replaceAppData(snapshot);
      setLoadError(null);
      setSaveError(null);
      setIsReady(true);
      // Restored data is already committed; notification failure is reported
      // separately and must not claim that the data restoration failed.
      await resyncNotifications(snapshot.notificationSettings).catch(() => undefined);
    } catch (error) {
      if (error instanceof RestoreNeedsReloadError) {
        setIsReady(false);
        setLoadError(error.message);
      }
      throw error;
    } finally {
      restoringRef.current = false;
      setIsRestoring(false);
    }
  };

  const eraseAppData = async () => {
    if (operationEpoch !== dataEpoch.current) throw new Error('保存データが変更されています。現在の画面から操作し直してください。');
    if (restoringRef.current) throw new Error('データの処理はすでに実行中です。');
    restoringRef.current = true;
    dataEpoch.current += 1; notificationRun.current += 1;
    setIsErasing(true); setIsReady(false); setErasureError(null); setErasurePending(true);
    try {
      const { eraseAppStoredData } = await import('../services/dataErasureService');
      const empty = await eraseAppStoredData();
      imageCandidates.current.clear(); currentImages.current.clear(); persisted.current.clear();
      replaceAppData(empty);
      setLoadError(null); setSaveError(null); setNotificationSyncError(null); setIsNotificationSyncing(false);
      setErasurePending(false); setErasureError(null); setIsReady(true);
    } catch (error) {
      setErasureError('削除が完了していません。残っているデータや通知を削除するには再試行してください。' + (error instanceof Error ? `\n${error.message}` : ''));
      // Even an uncertain intent write never returns old UI state to the save effects.
      await hasPendingDataErasure().catch(() => undefined);
      throw error;
    } finally { restoringRef.current = false; setIsErasing(false); }
  };

  const recordConsumption = (request: ConsumptionRequest) => {
    const current = foodsRef.current;
    const next = applyFoodConsumption(current, request);
    if (next === current) return false;
    setFoods(next);
    return true;
  };

  function editable<Args extends unknown[], Result>(action: (...args: Args) => Result) {
    const actionEpoch = dataEpoch.current;
    return (...args: Args): Result => {
      if (restoringRef.current || !isReady || actionEpoch !== dataEpoch.current) throw new Error('データの準備中、または復元前の操作です。現在の内容を確認してもう一度お試しください。');
      return action(...args);
    };
  }

  const addShoppingItem = (name: string, memo?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return false;
    if (hasPendingShoppingItem(shoppingRef.current, trimmedName)) return false;
    const trimmedMemo = memo?.trim();
    setShoppingItems((current) => {
      if (hasPendingShoppingItem(current, trimmedName)) return current;
      return [
        ...current,
        {
          id: createId('shopping'),
          name: trimmedName,
          memo: trimmedMemo || undefined,
          checked: false,
          createdAt: new Date().toISOString(),
        },
      ];
    });
    return true;
  };

  const toggleShoppingItem = (id: string) => {
    if (foodsRef.current.some((food) => food.sourceShoppingItemId === id)) return;
    setShoppingItems((current) =>
      current.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  };

  const deleteShoppingItem = (id: string) => {
    setShoppingItems((current) => current.filter((item) => item.id !== id));
  };

  const foodData = useMemo<FoodData>(() => ({ foods, addShoppingItem: editable(addShoppingItem),
    markFoodUsed: editable(markFoodUsed), markFoodDisposed: editable(markFoodDisposed), updateFood: editable(updateFood) }),
  [foods, isReady, isRestoring]);

  return (
    <AppDataContext.Provider
      value={{
        foods,
        recipes,
        shoppingItems,
        notificationSettings,
        isReady,
        isRestoring,
        restoreAppData,
        eraseAppData, isErasing, erasurePending, erasureError,
        loadError,
        retryLoad: () => setLoadAttempt((attempt) => attempt + 1),
        saveError,
        retrySave: () => setSaveAttempt((attempt) => attempt + 1),
        addFood: editable(addFood),
        updateFood: editable(updateFood),
        markFoodUsed: editable(markFoodUsed),
        recordConsumption: editable(recordConsumption),
        markFoodDisposed: editable(markFoodDisposed),
        restoreFood: editable(restoreFood),
        deleteFood: editable(deleteFood),
        addRecipe: editable(addRecipe),
        updateRecipe: editable(updateRecipe),
        deleteRecipe: editable(deleteRecipe),
        toggleRecipeFavorite: editable(toggleRecipeFavorite),
        replaceAppData: editable(replaceAppData),
        addShoppingItem: editable(addShoppingItem),
        toggleShoppingItem: editable(toggleShoppingItem),
        deleteShoppingItem: editable(deleteShoppingItem),
        updateNotificationSettings: editable(updateNotificationSettings),
        resyncNotifications: editable(() => resyncNotifications()),
        notificationSyncError,
        isNotificationSyncing,
      }}
    >
      <FoodDataContext.Provider value={foodData}>{children}</FoodDataContext.Provider>
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}

export function useFoodData() {
  const value = useContext(FoodDataContext);
  if (!value) throw new Error('useFoodData must be used inside AppDataProvider');
  return value;
}
