'use strict';

const categories = ['vegetables', 'meat', 'seafood', 'dairy', 'eggs', 'staples', 'seasonings', 'beverages', 'other'];
const fields = ['barcode', 'name', 'ingredientName', 'category'];
const SHARED_RULES_VERSION = '2026-10-01';
const reportReasons = ['incorrect', 'personal_information', 'inappropriate', 'rights'];

function normalizeSharedBarcode(value) {
  if (typeof value !== 'string') return null;
  const code = value.normalize('NFKC').trim();
  // Shared lookup supports EAN/JAN, not store-specific variable-price codes or UPC-E.
  if (!/^(?:\d{8}|\d{13})$/.test(code) || code.startsWith('2') || /^0+$/.test(code)) return null;
  let sum = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(code[i]) * weight;
  return (10 - sum % 10) % 10 === Number(code.at(-1)) ? code : null;
}

function validateSharedProduct(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) return null;
  const barcode = normalizeSharedBarcode(value.barcode);
  const validText = (text, max) => typeof text === 'string' && text.trim().length > 0 && text.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(text);
  if (!barcode || !validText(value.name, 120) || !validText(value.ingredientName, 60) || !categories.includes(value.category)) return null;
  return { barcode, name: value.name.trim(), ingredientName: value.ingredientName.trim(), category: value.category };
}

function validateProductReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 1 || !Object.prototype.hasOwnProperty.call(value, 'reason') || !reportReasons.includes(value.reason)) return null;
  return { reason: value.reason };
}

module.exports = { normalizeSharedBarcode, validateSharedProduct, SHARED_RULES_VERSION, reportReasons, validateProductReport };
