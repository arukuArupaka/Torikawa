import type { UndoFoodStatus } from '../context/AppDataContext';
import { useAppAlert } from '../context/AppAlertContext';
import { useAppToast } from '../context/AppToastContext';
import type { FoodItem } from '../types';
import { getFoodDisplayName } from '../utils/ingredientNormalizer';

export function useFoodStatusFeedback() {
  const toast = useAppToast();
  const alert = useAppAlert();
  return (food: FoodItem, status: 'used' | 'disposed', addedToShopping = false) => (undo: UndoFoodStatus) => {
    const name = getFoodDisplayName(food);
    toast(`「${name}」を${status === 'used' ? '使い切った' : '捨てた'}として記録しました`, {
      label: '元に戻す',
      hint: addedToShopping ? '食材だけ戻します。買い物リストへの追加は残ります。' : undefined,
      onPress: () => {
        if (!undo(() => toast(`「${name}」を管理中に戻しました`))) {
          alert('元に戻せません', 'この食材の記録は変更されています。現在の内容を確認してください。');
        }
      },
    });
  };
}
