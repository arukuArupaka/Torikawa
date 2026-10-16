export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export function checkImageSize(size: number): void {
  if (!Number.isFinite(size) || size < 0 || size > MAX_IMAGE_BYTES) throw new Error('写真1枚の上限は5MBです。小さい写真を選び直してください。');
}
export function checkBackupSize(size: number): void {
  if (size > MAX_BACKUP_BYTES) throw new Error('バックアップの上限は20MBです。写真の容量を減らしてください。');
}
export function textBytes(text: string): number {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  let size = 0;
  for (const char of text) { const code = char.codePointAt(0)!; size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4; }
  return size;
}
