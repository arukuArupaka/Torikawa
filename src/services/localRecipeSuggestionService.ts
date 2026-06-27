import { FoodItem, NewRecipe, RecipeCategory } from '../types';
import { daysUntil } from '../utils/date';
import { getFoodIngredientName, getFoodSearchTerms } from '../utils/ingredientNormalizer';
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
  const normalizedValue = value.toLocaleLowerCase('ja-JP');
  return keywords.some((keyword) => normalizedValue.includes(keyword.toLocaleLowerCase('ja-JP')));
}

function findFood(foods: FoodItem[], keywords: string[]) {
  return foods.find((food) => getFoodSearchTerms(food).some((term) => includesAny(term, keywords)));
}

function ingredientLabel(food: FoodItem): string {
  return getFoodIngredientName(food);
}

function uniqueNames(names: string[]) {
  return [...new Set(names)];
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
  const urgentFoodNames = new Set(urgentFoods.map(ingredientLabel));
  const ideas: LocalRecipeIdea[] = [];
  const addIdea = (seed: IdeaSeed) => {
    const idea = toIdea({
      ...seed,
      usedFoodNames: uniqueNames(seed.usedFoodNames),
    });

    if (ideas.some((current) => current.name === idea.name)) return;
    ideas.push(idea);
  };
  const egg = findFood(usableFoods, ['卵', 'たまご']);
  const milk = findFood(usableFoods, ['牛乳', 'ミルク']);
  const cabbage = findFood(usableFoods, ['キャベツ']);
  const tofu = findFood(usableFoods, ['豆腐']);
  const onion = findFood(usableFoods, ['玉ねぎ', '玉葱']);
  const carrot = findFood(usableFoods, ['にんじん', '人参']);
  const tomato = findFood(usableFoods, ['トマト']);
  const potato = findFood(usableFoods, ['じゃがいも', 'ジャガイモ', '馬鈴薯']);
  const mushroom = findFood(usableFoods, ['きのこ', 'しめじ', 'えのき', '舞茸', 'まいたけ', 'しいたけ', '椎茸']);
  const chicken = findFood(usableFoods, ['鶏肉', '鶏', 'とり肉', 'チキン', 'ささみ', 'むね肉', 'もも肉']);
  const pork = findFood(usableFoods, ['豚肉', '豚', 'ポーク', 'ひき肉', '挽肉']);
  const fish = findFood(usableFoods, ['鮭', 'サーモン', 'さば', '鯖', 'たら', '鱈', '魚', 'ツナ']);
  const cheese = findFood(usableFoods, ['チーズ']);
  const bread = findFood(usableFoods, ['パン', '食パン', 'ロールパン']);
  const rice = findFood(usableFoods, ['ごはん', 'ご飯', '米', 'ライス']);
  const noodles = findFood(usableFoods, ['うどん', 'そば', '蕎麦', 'パスタ', '麺', '焼きそば']);
  const vegetable = findFood(usableFoods, ['キャベツ', '玉ねぎ', '玉葱', 'にんじん', '人参', 'レタス', 'トマト', '白菜', '小松菜', 'ほうれん草', 'ピーマン']);

  if (egg && milk) {
    const eggName = ingredientLabel(egg);
    const milkName = ingredientLabel(milk);
    addIdea({
      category: 'breakfast',
      name: `${eggName}と${milkName}のふわっとオムレツ`,
      ingredients: [eggName, milkName, '塩こしょう'],
      ingredientAmounts: { [eggName]: '2個', [milkName]: '大さじ2', 塩こしょう: '少々' },
      steps: [
        `${eggName}と${milkName}をよく混ぜます。`,
        'フライパンで弱めの中火にし、ゆっくり火を通します。',
        '半熟になったら形を整えて盛り付けます。',
      ],
      minutes: 10,
      reason: '朝食向きで、冷蔵食材をすぐ使えます。',
      usedFoodNames: [eggName, milkName],
    });
  }

  if (cabbage && egg) {
    const cabbageName = ingredientLabel(cabbage);
    const eggName = ingredientLabel(egg);
    addIdea({
      category: 'quick',
      name: `${cabbageName}と${eggName}のさっと炒め`,
      ingredients: [cabbageName, eggName, '醤油'],
      ingredientAmounts: { [cabbageName]: '2枚', [eggName]: '1個', 醤油: '小さじ2' },
      steps: [
        `${cabbageName}を食べやすい大きさに切ります。`,
        `${eggName}を先に炒めて取り出します。`,
        `${cabbageName}を炒め、${eggName}を戻して醤油で味を整えます。`,
      ],
      minutes: 10,
      reason: '短時間で作れて、期限が近い食材を合わせやすいです。',
      usedFoodNames: [cabbageName, eggName],
    });
  }

  if (tofu) {
    const tofuName = ingredientLabel(tofu);
    addIdea({
      category: 'side',
      name: `${tofuName}の照り焼きステーキ`,
      ingredients: [tofuName, '片栗粉', '醤油'],
      ingredientAmounts: { [tofuName]: '1丁', 片栗粉: '適量', 醤油: '大さじ1' },
      steps: [
        `${tofuName}の水気を切って食べやすく切ります。`,
        '片栗粉をまぶして両面を焼きます。',
        '醤油をからめて香ばしく仕上げます。',
      ],
      minutes: 12,
      reason: '傷みやすい豆腐を副菜として使い切れます。',
      usedFoodNames: [tofuName],
    });
  }

  if (chicken && onion) {
    const chickenName = ingredientLabel(chicken);
    const onionName = ingredientLabel(onion);
    addIdea({
      category: 'main',
      name: `${chickenName}と${onionName}の照り焼き炒め`,
      ingredients: [chickenName, onionName, '醤油', '砂糖'],
      ingredientAmounts: { [chickenName]: '食べやすい量', [onionName]: '1/2個', 醤油: '大さじ1', 砂糖: '小さじ1' },
      steps: [
        `${chickenName}と${onionName}を食べやすい大きさに切ります。`,
        `${chickenName}に火が通るまで炒め、${onionName}を加えます。`,
        '醤油と砂糖をからめて照りが出るまで炒めます。',
      ],
      minutes: 15,
      reason: '主菜にしやすく、玉ねぎの甘みで味がまとまります。',
      usedFoodNames: [chickenName, onionName],
    });
  }

  if (pork && cabbage) {
    const porkName = ingredientLabel(pork);
    const cabbageName = ingredientLabel(cabbage);
    addIdea({
      category: 'main',
      name: `${porkName}と${cabbageName}のみそ炒め`,
      ingredients: [porkName, cabbageName, '味噌', '醤油'],
      ingredientAmounts: { [porkName]: '食べやすい量', [cabbageName]: '2枚', 味噌: '大さじ1', 醤油: '小さじ1' },
      steps: [
        `${porkName}と${cabbageName}を食べやすい大きさに切ります。`,
        `${porkName}を炒め、色が変わったら${cabbageName}を加えます。`,
        '味噌と醤油をからめて、全体になじませます。',
      ],
      minutes: 12,
      reason: 'ごはんに合う主菜で、キャベツをしっかり使えます。',
      usedFoodNames: [porkName, cabbageName],
    });
  }

  if (fish && mushroom) {
    const fishName = ingredientLabel(fish);
    const mushroomName = ingredientLabel(mushroom);
    addIdea({
      category: 'healthy',
      name: `${fishName}と${mushroomName}のフライパン蒸し`,
      ingredients: [fishName, mushroomName, '酒', '塩こしょう'],
      ingredientAmounts: { [fishName]: '1切れ', [mushroomName]: 'ひとつかみ', 酒: '大さじ1', 塩こしょう: '少々' },
      steps: [
        `${fishName}と${mushroomName}をフライパンに入れます。`,
        '酒を加えてふたをし、弱めの中火で蒸します。',
        '火が通ったら塩こしょうで味を整えます。',
      ],
      minutes: 15,
      reason: '油を控えめにできて、魚ときのこをまとめて使えます。',
      usedFoodNames: [fishName, mushroomName],
    });
  }

  if (potato && onion) {
    const potatoName = ingredientLabel(potato);
    const onionName = ingredientLabel(onion);
    addIdea({
      category: 'mealPrep',
      name: `${potatoName}と${onionName}のカレー炒め`,
      ingredients: [potatoName, onionName, 'カレー粉', '塩'],
      ingredientAmounts: { [potatoName]: '1個', [onionName]: '1/2個', カレー粉: '小さじ1', 塩: '少々' },
      steps: [
        `${potatoName}を細めに切り、${onionName}は薄切りにします。`,
        `${potatoName}に火が通るまで炒め、${onionName}を加えます。`,
        'カレー粉と塩で味を整えます。',
      ],
      minutes: 15,
      reason: '作り置きやお弁当に回しやすい副菜です。',
      usedFoodNames: [potatoName, onionName],
    });
  }

  if (tomato && cheese) {
    const tomatoName = ingredientLabel(tomato);
    const cheeseName = ingredientLabel(cheese);
    addIdea({
      category: 'side',
      name: `${tomatoName}と${cheeseName}のさっぱりサラダ`,
      ingredients: [tomatoName, cheeseName, 'オリーブオイル', '塩'],
      ingredientAmounts: { [tomatoName]: '1個', [cheeseName]: '食べやすい量', オリーブオイル: '小さじ1', 塩: '少々' },
      steps: [
        `${tomatoName}と${cheeseName}を食べやすい大きさに切ります。`,
        '器に盛り、オリーブオイルと塩をかけます。',
        '好みで黒こしょうをふります。',
      ],
      minutes: 5,
      reason: '火を使わず、早めに食べたいトマトを使えます。',
      usedFoodNames: [tomatoName, cheeseName],
    });
  }

  if (bread && egg) {
    const breadName = ingredientLabel(bread);
    const eggName = ingredientLabel(egg);
    addIdea({
      category: 'breakfast',
      name: `${breadName}のたまごトースト`,
      ingredients: [breadName, eggName, 'マヨネーズ'],
      ingredientAmounts: { [breadName]: '1枚', [eggName]: '1個', マヨネーズ: '適量' },
      steps: [
        `${eggName}をゆでるか炒り卵にします。`,
        `${breadName}に${eggName}とマヨネーズをのせます。`,
        'トースターで軽く焼きます。',
      ],
      minutes: 10,
      reason: '朝食にしやすく、パンと卵を一緒に使えます。',
      usedFoodNames: [breadName, eggName],
    });
  }

  if (rice && egg && vegetable) {
    const riceName = ingredientLabel(rice);
    const eggName = ingredientLabel(egg);
    const vegetableName = ingredientLabel(vegetable);
    const titleRiceName = includesAny(riceName, ['米']) ? 'ごはん' : riceName;
    addIdea({
      category: 'quick',
      name: `${titleRiceName}と${eggName}のぱらっとチャーハン`,
      ingredients: [riceName, eggName, vegetableName, '醤油'],
      ingredientAmounts: { [riceName]: '茶碗1杯分', [eggName]: '1個', [vegetableName]: '食べやすい量', 醤油: '小さじ2' },
      steps: [
        `${vegetableName}を細かく切ります。`,
        `${eggName}と${riceName}を炒め、${vegetableName}を加えます。`,
        '醤油で香りをつけて仕上げます。',
      ],
      minutes: 10,
      reason: '主食と余り野菜をまとめて使える時短メニューです。',
      usedFoodNames: [riceName, eggName, vegetableName],
    });
  }

  if (noodles && vegetable) {
    const noodlesName = ingredientLabel(noodles);
    const vegetableName = ingredientLabel(vegetable);
    addIdea({
      category: 'main',
      name: `${noodlesName}と${vegetableName}の具だくさん炒め`,
      ingredients: [noodlesName, vegetableName, '醤油'],
      ingredientAmounts: { [noodlesName]: '1人分', [vegetableName]: '食べやすい量', 醤油: '小さじ2' },
      steps: [
        `${vegetableName}を食べやすい大きさに切ります。`,
        `${vegetableName}を炒め、${noodlesName}を加えます。`,
        '醤油で味を整えます。',
      ],
      minutes: 12,
      reason: '麺に野菜を足して、1品で食べやすくできます。',
      usedFoodNames: [noodlesName, vegetableName],
    });
  }

  if (vegetable) {
    const secondVegetable = onion && onion.id !== vegetable.id
      ? onion
      : carrot && carrot.id !== vegetable.id
        ? carrot
        : usableFoods.find((food) => food.id !== vegetable.id);
    const vegetableName = ingredientLabel(vegetable);
    const secondVegetableName = secondVegetable ? ingredientLabel(secondVegetable) : null;
    const ingredients = secondVegetableName ? [vegetableName, secondVegetableName, 'コンソメ'] : [vegetableName, 'コンソメ'];
    addIdea({
      category: 'soup',
      name: `${vegetableName}のあったかスープ`,
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
    });
  }

  let urgentFallbackCount = 0;
  urgentFoods.forEach((food) => {
    if (urgentFallbackCount >= 2) return;
    const foodName = ingredientLabel(food);
    if (ideas.some((idea) => idea.usedFoodNames.includes(foodName))) return;
    addIdea({
      category: 'quick',
      name: `${foodName}の簡単ソテー`,
      ingredients: [foodName, '油', '塩こしょう'],
      ingredientAmounts: { [foodName]: '使いたい分', 油: '小さじ1', 塩こしょう: '少々' },
      steps: [
        `${foodName}を食べやすい大きさに切ります。`,
        'フライパンで焼き、火を通します。',
        '塩こしょうで味を整えます。',
      ],
      minutes: 8,
      reason: `期限まであと${daysUntil(food.expiryDate)}日なので、先に使う候補です。`,
      usedFoodNames: [foodName],
    });
    urgentFallbackCount += 1;
  });

  const countUrgentFoods = (idea: LocalRecipeIdea) =>
    idea.usedFoodNames.filter((foodName) => urgentFoodNames.has(foodName)).length;

  return ideas
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => {
      const urgentDiff = countUrgentFoods(b.idea) - countUrgentFoods(a.idea);
      if (urgentDiff !== 0) return urgentDiff;
      const minutesDiff = a.idea.minutes - b.idea.minutes;
      if (minutesDiff !== 0) return minutesDiff;
      return a.index - b.index;
    })
    .slice(0, 6)
    .map(({ idea }) => idea);
}
