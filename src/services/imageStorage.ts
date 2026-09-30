import { File, Paths } from 'expo-file-system';
import { checkImageSize } from './backupLimits';

export function persistFoodImage(sourceUri: string): string {
  if (!sourceUri.startsWith('file:') && !sourceUri.startsWith('content:')) return sourceUri;
  if (sourceUri.startsWith(Paths.document.uri) && !sourceUri.includes('/catalog-')) {
    return sourceUri;
  }

  const cleanUri = sourceUri.split('?')[0];
  const extension = cleanUri.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.jpg';
  const source = new File(sourceUri);
  checkImageSize(source.size);
  const destination = new File(Paths.document, `food-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
  source.copy(destination);
  return destination.uri;
}

export function deleteStoredFoodImage(uri: string): void {
  if (uri.includes('/catalog-')) return;
  if (!uri.startsWith(Paths.document.uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
