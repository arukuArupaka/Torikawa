import { FoodItem, NewRecipe, RecipeCategory } from '../types';
import { daysUntil } from '../utils/date';
import { getFoodIngredientName } from '../utils/ingredientNormalizer';
import { findMatchingFood, getUsableFoods } from '../utils/recipeMatching';
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

function findFood(foods: FoodItem[], keywords: string[]) {
  return keywords.map((keyword) => findMatchingFood(keyword, foods))
    .filter((food): food is FoodItem => Boolean(food))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || foods.indexOf(a) - foods.indexOf(b))[0];
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
  const usableFoods = [...getUsableFoods(foods)]
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
      ingredients: [eggName, milkName, '塩こしょう', '油'],
      ingredientAmounts: { [eggName]: '2個', [milkName]: '大さじ2', 塩こしょう: '少々', 油: '小さじ1' },
      steps: [
        `ボウルに${eggName}を割り、${milkName}と塩こしょうを加えて白身を切るように混ぜます。`,
        '小さめのフライパンに油を広げて中火で温め、卵液を注いでへらで大きく混ぜます。',
        '火を弱めて端から折りたたみ、中心まで火を通して皿に移します。',
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
      ingredients: [cabbageName, eggName, '醤油', '油'],
      ingredientAmounts: { [cabbageName]: '2枚', [eggName]: '1個', 醤油: '小さじ2', 油: '小さじ2' },
      steps: [
        `${cabbageName}は芯を薄く、葉は一口大に切ります。${eggName}を溶きほぐします。`,
        `フライパンに油の半量を広げ、${eggName}を大きく混ぜて炒めます。固まり始めたらいったん取り出します。`,
        `残りの油で${cabbageName}を炒め、${eggName}と醤油を加えます。卵の中心まで火が通るように炒め合わせます。`,
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
      ingredients: [tofuName, '片栗粉', '醤油', '油'],
      ingredientAmounts: { [tofuName]: '1丁', 片栗粉: '適量', 醤油: '大さじ1', 油: '小さじ2' },
      steps: [
        `${tofuName}を厚めに切り、キッチンペーパーで余分な水気を吸い取ります。表面に片栗粉を薄く付けます。`,
        'フライパンで油を中火で温め、豆腐を並べます。焼き色が付いてから裏返し、反対側も焼きます。',
        '中まで温まったら弱火にし、醤油を加えて両面にからめます。',
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
      ingredients: [chickenName, onionName, '醤油', '砂糖', '油'],
      ingredientAmounts: { [chickenName]: '食べやすい量', [onionName]: '1/2個', 醤油: '大さじ1', 砂糖: '小さじ1', 油: '小さじ1' },
      steps: [
        `${chickenName}は薄めの一口大、${onionName}は薄切りにします。醤油と砂糖を合わせます。`,
        `油を入れたフライパンを中火で温め、${chickenName}を重ならないように広げます。裏返しながら加熱し、${onionName}を加えます。`,
        '合わせた調味料を加え、焦がさないよう混ぜながら煮からめます。肉は中心温度75℃以上で1分間以上加熱したことを確認します。',
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
      ingredients: [porkName, cabbageName, '味噌', '醤油', '油'],
      ingredientAmounts: { [porkName]: '食べやすい量', [cabbageName]: '2枚', 味噌: '大さじ1', 醤油: '小さじ1', 油: '小さじ1' },
      steps: [
        `${porkName}は一口大、${cabbageName}はざく切りにします。味噌と醤油を小さな器で混ぜます。`,
        `フライパンに油を入れて中火で温め、${porkName}をほぐしながら炒めます。${cabbageName}を加え、しんなりするまで炒めます。`,
        '合わせた調味料を加え、焦げ付かないよう全体を返します。肉は中心温度75℃以上で1分間以上加熱したことを確認します。',
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
        `${mushroomName}の食べられない根元を除いてほぐし、フライパンに広げます。その上に${fishName}をのせます。`,
        '酒を回しかけてふたをし、弱めの中火にかけます。焦げないよう様子を見ながら蒸します。',
        '魚の中心まで火が通り、きのこがしんなりしたら塩こしょうを振ります。骨がある場合は取り除いて食べます。',
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
      ingredients: [potatoName, onionName, 'カレー粉', '塩', '油'],
      ingredientAmounts: { [potatoName]: '1個', [onionName]: '1/2個', カレー粉: '小さじ1', 塩: '少々', 油: '小さじ1' },
      steps: [
        `${potatoName}の皮と芽を取り除いて細切りにし、${onionName}を薄く切ります。`,
        `フライパンに油を入れ、${potatoName}を中火で炒めます。芯がなくなるまで加熱してから${onionName}を加えます。`,
        '玉ねぎが透き通ったら火を弱め、カレー粉と塩を振ります。全体に行き渡るよう混ぜます。',
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
      ingredients: [tomatoName, cheeseName, 'オリーブオイル', '塩', '黒こしょう'],
      ingredientAmounts: { [tomatoName]: '1個', [cheeseName]: '食べやすい量', オリーブオイル: '小さじ1', 塩: '少々', 黒こしょう: '少々' },
      steps: [
        `${tomatoName}を洗ってへたを除き、一口大に切ります。${cheeseName}も食べやすい大きさに切ります。`,
        '器に交互に並べ、オリーブオイルを回しかけます。',
        '塩と黒こしょうを全体に振り、食べる直前に軽く混ぜます。',
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
      ingredients: [breadName, eggName, 'マヨネーズ', '水'],
      ingredientAmounts: { [breadName]: '1枚', [eggName]: '1個', マヨネーズ: '適量', 水: '卵が浸る量（ゆで用）' },
      steps: [
        `小鍋に${eggName}と卵が浸る量の水を入れて加熱します。黄身の中心まで固ゆでにし、水で冷まして殻をむきます。`,
        `卵をフォークでつぶし、マヨネーズを混ぜます。${breadName}の上に均等に広げます。`,
        'トースターで表面に薄い焼き色が付くまで焼きます。焦げないよう加熱中の様子を確認します。',
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
    const titleRiceName = riceName === '米' ? 'ごはん' : riceName;
    addIdea({
      category: 'quick',
      name: `${titleRiceName}と${eggName}のぱらっとチャーハン`,
      ingredients: [riceName, eggName, vegetableName, '醤油', '油'],
      ingredientAmounts: { [riceName]: '茶碗1杯分', [eggName]: '1個', [vegetableName]: '食べやすい量', 醤油: '小さじ2', 油: '小さじ2' },
      steps: [
        `${vegetableName}を細かく刻み、${eggName}を溶きます。${riceName}が生の米の場合は炊いてから使います。`,
        'フライパンに油を広げ、野菜を炒めます。火が通ったら卵と温かいごはんを加え、ほぐしながら炒め合わせます。',
        '卵の中心まで火が通ったら醤油を鍋肌から加え、手早く混ぜて器へ移します。',
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
      ingredients: [noodlesName, vegetableName, '醤油', '油'],
      ingredientAmounts: { [noodlesName]: '1人分', [vegetableName]: '食べやすい量', 醤油: '小さじ2', 油: '小さじ1' },
      steps: [
        `${vegetableName}を細めに切ります。${noodlesName}は製品表示に従ってゆでるなど、炒められる状態に準備します。`,
        `フライパンで油を中火で温め、${vegetableName}を炒めます。火が通ったら麺を加え、ほぐしながら温めます。`,
        '醤油を全体に回しかけ、焦げ付かないよう炒め合わせます。',
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
        : usableFoods.find((food) => food.id !== vegetable.id && food.category === 'vegetables');
    const vegetableName = ingredientLabel(vegetable);
    const secondVegetableName = secondVegetable ? ingredientLabel(secondVegetable) : null;
    const vegetableNames = secondVegetableName ? [vegetableName, secondVegetableName] : [vegetableName];
    addIdea({
      category: 'soup',
      name: `${vegetableName}のあったかスープ`,
      ingredients: [...vegetableNames, 'コンソメ', '塩こしょう', '油', '水'],
      ingredientAmounts: {
        ...Object.fromEntries(vegetableNames.map((ingredient) => [ingredient, '食べやすい量'])),
        コンソメ: '小さじ2', 塩こしょう: '少々', 油: '小さじ1', 水: '400ml',
      },
      steps: [
        '野菜を薄切りや小さめの角切りにそろえます。',
        '鍋に油を入れて野菜を中火で炒め、水400mlとコンソメを加えます。',
        '煮立ったら火を弱め、硬い野菜が柔らかくなるまで煮ます。塩こしょうで調えて器によそいます。',
      ],
      minutes: 18,
      reason: '余りがちな野菜をまとめて使えます。',
      usedFoodNames: vegetableNames,
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
        `${foodName}の食べられない部分を除き、火が通りやすい厚さに切ります。`,
        'フライパンに油を広げ、中火で食材を返しながら焼きます。中心まで十分に火を通します。',
        '塩こしょうを振って全体に混ぜ、皿へ移します。肉の場合は中心温度75℃以上で1分間以上加熱したことを確認します。',
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
