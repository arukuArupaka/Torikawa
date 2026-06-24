const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function daysUntil(value: string, today = new Date()): number {
  const target = parseDate(value);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / DAY_MS);
}

export function formatDateJa(value: string): string {
  const date = parseDate(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateString(parseDate(value)) === value;
}

export function getRemainingLabel(value: string): string {
  const days = daysUntil(value);
  if (days < 0) return `${Math.abs(days)}日期限切れ`;
  if (days === 0) return '今日まで';
  return `あと${days}日`;
}
