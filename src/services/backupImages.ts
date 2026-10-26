import { File, Paths } from 'expo-file-system';
import { validateEmbeddedImage } from './dataValidation';
import { checkImageSize } from './backupLimits';

function getImageExtension(mimeType: string): string {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('gif')) return '.gif';
  return '.jpg';
}

function getImageMimeType(uri: string): string {
  const cleanUri = uri.split('?')[0].toLowerCase();
  if (cleanUri.endsWith('.png')) return 'image/png';
  if (cleanUri.endsWith('.webp')) return 'image/webp';
  if (cleanUri.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export async function embedImage(uri: string): Promise<string> {
  if (!uri.startsWith('file:') && !uri.startsWith('content:')) return uri;
  const file = new File(uri);
  if (!file.exists) throw new Error('保存画像を読み込めませんでした。');
  checkImageSize(file.size);
  const base64 = await file.base64();
  return `data:${getImageMimeType(uri)};base64,${base64}`;
}

export function restoreImage(uri: string, prefix: string, created: string[]): string {
  if (!uri.startsWith('data:') && !uri.startsWith('file:') && !uri.startsWith('content:')) return uri;
  const embedded = uri.startsWith('data:') ? validateEmbeddedImage(uri) : null;
  const source = embedded ? null : new File(uri);
  if (source && !source.exists) throw new Error('バックアップが参照する写真が見つかりません。');
  checkImageSize(embedded?.size ?? source!.size);
  const file = new File(
    Paths.document,
    `restored-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}${getImageExtension(embedded?.mime ?? getImageMimeType(uri))}`,
  );
  created.push(file.uri);
  // 復元先の検証・世代の切り替えより先に、写真の書き込みを完了させる。
  if (embedded) file.writeSync(embedded.base64, { encoding: 'base64' });
  else source!.copy(file);
  const expectedSize = embedded?.size ?? source!.size;
  if (!file.exists || file.size !== expectedSize) throw new Error('復元した写真を保存できませんでした。');
  return file.uri;
}

export function discardRestoredImage(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}
