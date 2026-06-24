import { StorageLocation } from '../types';

export type BarcodeProduct = {
  barcode: string;
  name: string;
  image: string;
  category: string;
  storage: StorageLocation;
};

export const sampleMilkProduct: BarcodeProduct = {
  barcode: '4901234567894',
  name: '明治おいしい牛乳',
  image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300',
  category: '牛乳・乳飲料',
  storage: 'refrigerated',
};

const productCatalog: BarcodeProduct[] = [sampleMilkProduct];

export function findProductByBarcode(barcode: string): BarcodeProduct | null {
  return productCatalog.find((product) => product.barcode === barcode) ?? null;
}
