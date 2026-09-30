import { validateEmbeddedImage } from './dataValidation';
import { checkImageSize } from './backupLimits';

export async function embedImage(uri: string): Promise<string> {
  if (uri.startsWith('blob:')) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('保存画像を読み込めませんでした。');
    const blob = await response.blob();
    checkImageSize(blob.size);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('保存画像を読み込めませんでした。'));
      reader.readAsDataURL(blob);
    });
  }
  if (uri.startsWith('file:') || uri.startsWith('content:')) throw new Error('端末内の写真は元のスマートフォンでバックアップしてください。');
  return uri;
}

export function restoreImage(uri: string, _prefix: string, _created: string[]): string {
  if (uri.startsWith('data:')) validateEmbeddedImage(uri);
  if (/^(file:|content:|blob:)/.test(uri)) throw new Error('この写真は別の環境では読み込めません。画像を含むバックアップを選んでください。');
  // The complete data URI is staged in storage. Browser quota failures leave the
  // previous generation intact; no native filesystem is available on Web.
  return uri;
}

export function discardRestoredImage(_uri: string): void {}
