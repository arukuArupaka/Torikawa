import { FoodItem, FoodQuantityUnit } from '../types';
import { daysUntil, toDateString } from './date';

export type ConsumptionRequest = {
  operationId: string;
  recipeId: string;
  items: { foodId: string; amount: number; unit: FoodQuantityUnit; expectedQuantity: number; expectedExpiryDate: string; expectedRevision: number }[];
};

/** Validate the entire operation before applying any change. Never copy stale form metadata. */
export function applyFoodConsumption(foods: FoodItem[], request: ConsumptionRequest): FoodItem[] {
  if (!request.operationId || !request.recipeId || request.items.length === 0
    || new Set(request.items.map((item) => item.foodId)).size !== request.items.length) {
    throw new Error('使用する在庫を選び直してください。');
  }
  if (foods.some((food) => food.consumptionHistory?.some((entry) => entry.operationId === request.operationId))) return foods;
  const byId = new Map(foods.map((food) => [food.id, food]));
  for (const item of request.items) {
    const food = byId.get(item.foodId);
    if (!food || food.status !== 'active' || daysUntil(food.expiryDate) < 0
      || food.quantityUnit !== item.unit || food.quantity !== item.expectedQuantity
      || food.expiryDate !== item.expectedExpiryDate || (food.revision ?? 0) !== item.expectedRevision) {
      throw new Error('確認中に在庫や期限が変わりました。現在の残量を確認して選び直してください。');
    }
    if (!Number.isFinite(item.amount) || item.amount <= 0 || item.amount > food.quantity
      || Math.abs(item.amount * 100 - Math.round(item.amount * 100)) > 1e-7) {
      throw new Error('使用量は現在の残量以下、小数点以下2桁までで入力してください。');
    }
  }
  const now = new Date();
  const items = new Map(request.items.map((item) => [item.foodId, item]));
  return foods.map((food) => {
    const item = items.get(food.id);
    if (!item) return food;
    // Legacy backups can contain more than two decimals. Preserve their remainder
    // so the saved quantity and history stay consistent, while removing float noise.
    const remaining = Number((food.quantity - item.amount).toFixed(10));
    return {
      ...food,
      // Preserve the last positive amount for the existing "undo use all" action.
      quantity: remaining === 0 ? food.quantity : remaining,
      status: remaining === 0 ? 'used' : 'active',
      usedAt: remaining === 0 ? toDateString(now) : null,
      disposedAt: null,
      revision: (food.revision ?? 0) + 1,
      consumptionHistory: [...(food.consumptionHistory ?? []), {
        operationId: request.operationId, recipeId: request.recipeId,
        recordedAt: now.toISOString(), amount: item.amount, unit: item.unit,
        before: food.quantity, after: remaining,
      }],
    };
  });
}
