import { ImageManipulator, SaveFormat, type ImageManipulatorContext, type ImageRef, type ImageResult } from 'expo-image-manipulator';
import { Platform } from 'react-native';

const MAX_IMAGE_EDGE = 800;

export async function resizeImage(source: { uri: string; width: number; height: number }): Promise<ImageResult> {
  let context: ImageManipulatorContext | undefined;
  let image: ImageRef | undefined;
  try {
    if (!source.uri || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0) {
      throw new Error('invalid image');
    }
    context = ImageManipulator.manipulate(source.uri);
    if (Math.max(source.width, source.height) > MAX_IMAGE_EDGE) {
      // Specify only the longer edge to preserve the aspect ratio. Small photos are not enlarged.
      context.resize(source.width >= source.height ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE });
    }
    image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: Platform.OS === 'web' });
    if (!result.uri || !Number.isFinite(result.width) || !Number.isFinite(result.height)
      || result.width <= 0 || result.height <= 0 || Math.max(result.width, result.height) > MAX_IMAGE_EDGE
      || (Platform.OS !== 'web' && !result.uri.startsWith('file:'))) throw new Error('invalid resized image');
    return result;
  } catch {
    throw new Error('写真を縮小できませんでした。別の写真を選び直してください。');
  } finally {
    // Web rendering creates an intermediate object URL, separate from the saved result.
    if (Platform.OS === 'web' && image && 'uri' in image && typeof image.uri === 'string' && image.uri.startsWith('blob:')) {
      URL.revokeObjectURL(image.uri);
    }
    image?.release();
    context?.release();
  }
}
