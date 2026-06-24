import { FoodItem, NewRecipe, RecipeCategory } from '../types';
import { daysUntil } from '../utils/date';
import { getRecipeFallbackImage } from '../utils/recipeImages';

export type LocalRecipeIdea = NewRecipe & {
  reason: string;
  usedFoodNames: string[];
};

type IdeaSeed = {
  category: RecipeCategory;
  name: string;
  ingredients: string[];
  ingredientAmounts: Record<string, string>;
  steps: string[];
  minutes: number;
  reason: string;
  usedFoodNames: string[];
};

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function findFood(foods: FoodItem[], keywords: string[]) {
  return foods.find((food) => includesAny(food.name, keywords));
}

function toIdea(seed: IdeaSeed): LocalRecipeIdea {
  return {
    name: seed.name,
    image: getRecipeFallbackImage(seed.category),
    category: seed.category,
    ingredients: seed.ingredients,
    ingredientAmounts: seed.ingredientAmounts,
    steps: seed.steps,
    minutes: seed.minutes,
    reason: seed.reason,
    usedFoodNames: seed.usedFoodNames,
  };
}

export function generateLocalRecipeIdeas(foods: FoodItem[]): LocalRecipeIdea[] {
  const usableFoods = foods
    .filter((food) => food.status === 'active' && daysUntil(food.expiryDate) >= 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const urgentFoods = usableFoods.filter((food) => daysUntil(food.expiryDate) <= 3);
  const ideas: LocalRecipeIdea[] = [];
  const egg = findFood(usableFoods, ['卵', 'たまご']);
  const milk = findFood(usableFoods, ['牛乳', 'ミルク']);
  const cabbage = findFood(usableFoods, ['キャベツ']);
  const tofu = findFood(usableFoods, ['豆腐']);
  const onion = findFood(usableFoods, ['玉ねぎ', '玉葱']);
  const vegetable = findFood(usableFoods, ['キャベツ', '玉ねぎ', 'にんじん', 'レタス', 'トマト', '白菜']);

  if (egg && milk) {
    ideas.push(toIdea({
      category: 'breakfast',
      name: `${egg.name}と${milk.name}のふわっとオムレツ`,
      ingredients: [egg.name, milk.name, '塩こしょう'],
      ingredientAmounts: { [egg.name]: '2個', [milk.name]: '大さじ2', 塩こしょう: '少々' },
      steps: [
        `${egg.name}と${milk.name}をよく混ぜます。`,
        'フライパンで弱めの中火にし、ゆっくり火を通します。',
        '半熟になったら形を整えて盛り付けます。',
      ],
      minutes: 10,
      reason: '朝食向きで、冷蔵食材をすぐ使えます。',
      usedFoodNames: [egg.name, milk.name],
    }));
  }

  if (cabbage && egg) {
    ideas.push(toIdea({
      category: 'quick',
      name: `${cabbage.name}と${egg.name}のさっと炒め`,
      ingredients: [cabbage.name, egg.name, '醤油'],
      ingredientAmounts: { [cabbage.name]: '2枚', [egg.name]: '1個', 醤油: '小さじ2' },
      steps: [
        `${cabbage.name}を食べやすい大きさに切ります。`,
        `${egg.name}を先に炒めて取り出します。`,
        `${cabbage.name}を炒め、${egg.name}を戻して醤油で味を整えます。`,
      ],
      minutes: 10,
      reason: '短時間で作れて、期限が近い食材を合わせやすいです。',
      usedFoodNames: [cabbage.name, egg.name],
    }));
  }

  if (tofu) {
    ideas.push(toIdea({
      category: 'side',
      name: `${tofu.name}の照り焼きステーキ`,
      ingredients: [tofu.name, '片栗粉', '醤油'],
      ingredientAmounts: { [tofu.name]: '1丁', 片栗粉: '適量', 醤油: '大さじ1' },
      steps: [
        `${tofu.name}の水気を切って食べやすく切ります。`,
        '片栗粉をまぶして両面を焼きます。',
        '醤油をからめて香ばしく仕上げます。',
      ],
      minutes: 12,
      reason: '傷みやすい豆腐を副菜として使い切れます。',
      usedFoodNames: [tofu.name],
    }));
  }

  if (vegetable) {
    const secondVegetable = onion && onion.id !== vegetable.id ? onion : usableFoods.find((food) => food.id !== vegetable.id);
    const ingredients = secondVegetable ? [vegetable.name, secondVegetable.name, 'コンソメ'] : [vegetable.name, 'コンソメ'];
    ideas.push(toIdea({
      category: 'soup',
      name: `${vegetable.name}のあったかスープ`,
      ingredients,
      ingredientAmounts: Object.fromEntries(ingredients.map((ingredient, index) => [
        ingredient,
        index === ingredients.length - 1 ? '適量' : '食べやすい量',
      ])),
      steps: [
        '食材を食べやすい大きさに切ります。',
        '鍋で軽く炒め、水を加えて煮込みます。',
        'コンソメや塩こしょうで味を整えます。',
      ],
      minutes: 18,
      reason: '余りがちな野菜をまとめて使えます。',
      usedFoodNames: ingredients.filter((ingredient) => ingredient !== 'コンソメ'),
    }));
  }

  urgentFoods.slice(0, 2).forEach((food) => {
    if (ideas.some((idea) => idea.usedFoodNames.includes(food.name))) return;
    ideas.push(toIdea({
      category: 'quick',
      name: `${food.name}の簡単ソテー`,
      ingredients: [food.name, '油', '塩こしょう'],
      ingredientAmounts: { [food.name]: '使いたい分', 油: '小さじ1', 塩こしょう: '少々' },
      steps: [
        `${food.name}を食べやすい大きさに切ります。`,
        'フライパンで焼き、火を通します。',
        '塩こしょうで味を整えます。',
      ],
      minutes: 8,
      reason: `期限まであと${daysUntil(food.expiryDate)}日なので、先に使う候補です。`,
      usedFoodNames: [food.name],
    }));
  });

  return ideas.slice(0, 4);
}
