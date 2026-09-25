export const MAX_RECIPE_SERVINGS = 99;

export function isValidServings(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_RECIPE_SERVINGS;
}

export function parseServingsInput(value: string): number | null {
  const normalized = value.normalize('NFKC').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return isValidServings(parsed) ? parsed : null;
}

export function getServingsMultiplier(base: unknown, target: unknown): number {
  return isValidServings(base) && isValidServings(target) ? target / base : 1;
}

type Fraction = { numerator: number; denominator: number };

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function decimalFraction(value: string): Fraction {
  const [whole, decimal = ''] = value.split('.');
  return { numerator: Number(whole + decimal), denominator: 10 ** decimal.length };
}

function parseFraction(value: string): Fraction | null {
  const [whole, remainder] = value.replace(/\s+/, 'と').split('と');
  const [top, bottom = decimalFraction('1')] = (remainder ?? whole).split('/').map(decimalFraction);
  const denominator = top.denominator * bottom.numerator;
  const numerator = top.numerator * bottom.denominator + (remainder ? Number(whole) * denominator : 0);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator <= 0 || denominator <= 0) return null;
  return { numerator, denominator };
}

const quantityPattern = '(?:\\d+(?:と|\\s+)\\d+\\/\\d+|\\d+(?:\\.\\d+)?(?:\\/\\d+(?:\\.\\d+)?)?)';
const measurePattern = new RegExp(`^(約)?(大さじ|小さじ|カップ)\\s*(${quantityPattern})$`);
const bowlPattern = new RegExp(`^(約)?(茶碗)\\s*(${quantityPattern})(杯分|杯)$`);
const unitPattern = new RegExp(`^(約)?(${quantityPattern})\\s*(kg|g|ml|mL|L|l|cc|個|玉|丁|枚|本|袋|パック|人分|杯|束|切れ|片|尾|缶|合|房|粒|膳)$`);
const qualitativeAmounts = new Set(['適量', '少々', 'お好みで', 'ひとつまみ', 'ひとつかみ', '食べやすい量', '使いたい分', '卵が浸る量']);

/** Scale only an understood complete amount. Never rewrite numbers embedded in prose. */
export function scaleRecipeAmount(amount: string, base: unknown, target: unknown): { amount: string; needsReview: boolean } {
  const unchanged = { amount, needsReview: false };
  if (!isValidServings(base) || !isValidServings(target) || base === target) return unchanged;
  const parts = amount.trim().match(/^(.*?)\s*(（[^（）]*）|\([^()]*\))$/);
  const body = (parts?.[1] || amount).normalize('NFKC').trim();
  const note = parts?.[1] ? parts[2] : '';
  if (qualitativeAmounts.has(body) && !/[0-9０-９]/.test(note)) return unchanged;
  const manual = { amount, needsReview: true };
  // A numeric note may be a second measurement (e.g. 1個（200g）).
  if (/[0-9０-９]/.test(note)) return manual;
  const prefixMatch = body.match(measurePattern) ?? body.match(bowlPattern);
  const unitMatch = prefixMatch ? null : body.match(unitPattern);
  if (!prefixMatch && !unitMatch) return manual;
  const source = parseFraction(prefixMatch ? prefixMatch[3] : unitMatch![2]);
  if (!source) return manual;
  let numerator = source.numerator * target;
  let denominator = source.denominator * base;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) return manual;
  const divisor = gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  const prefix = prefixMatch?.[2] ?? '';
  const unit = prefixMatch ? prefixMatch[4] ?? '' : unitMatch![3];
  let approximate = Boolean((prefixMatch ?? unitMatch)![1]);
  let value: string;
  if (denominator === 1) {
    value = String(numerator);
  } else if (/^(kg|g|ml|mL|L|l|cc)$/.test(unit) && numerator / denominator >= 0.01) {
    const rounded = Number((numerator / denominator).toFixed(2));
    value = String(rounded);
    approximate ||= Math.abs(rounded - numerator / denominator) > 1e-9;
  } else {
    const whole = Math.floor(numerator / denominator);
    value = `${whole > 0 ? `${whole}と` : ''}${numerator % denominator}/${denominator}`;
  }
  return { amount: `${approximate ? '約' : ''}${prefix}${value}${unit}${note}`, needsReview: false };
}
