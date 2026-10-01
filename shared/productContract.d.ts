import type { FoodCategory } from '../src/types';
export type SharedProduct = { barcode: string; name: string; ingredientName: string; category: FoodCategory };
export function normalizeSharedBarcode(value: unknown): string | null;
export function validateSharedProduct(value: unknown): SharedProduct | null;
export const SHARED_RULES_VERSION: '2026-10-01';
export type ProductReportReason = 'incorrect' | 'personal_information' | 'inappropriate' | 'rights';
export const reportReasons: readonly ProductReportReason[];
export function validateProductReport(value: unknown): { reason: ProductReportReason } | null;
