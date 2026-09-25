import type { FoodCategory } from '../src/types';
export type SharedProduct = { barcode: string; name: string; ingredientName: string; category: FoodCategory };
export function normalizeSharedBarcode(value: unknown): string | null;
export function validateSharedProduct(value: unknown): SharedProduct | null;
