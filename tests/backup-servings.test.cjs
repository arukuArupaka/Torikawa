require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
let contents;
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'expo-document-picker') return { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'memory://backup' }] }) };
  if (request === 'expo-file-system') return { File: class { async text() { return contents; } } };
  if (request === 'expo-sharing') return {};
  if (request === './storage') return {};
  return originalLoad.call(this, request, ...args);
};
const { pickBackup } = require('../src/services/backupService.ts');
test('backup import accepts old or unset servings and rejects invalid serving counts', async () => {
  const payload = {
    format: 'refrigerator-note-backup', version: 1, exportedAt: '2026-09-24', appVersion: '1.20.0',
    data: { foods: [], shoppingItems: [], learnedProducts: {},
      notificationSettings: { enabled: false, daysBeforeList: [3], time: '18:00' },
      recipes: [{ id: 'my-recipe', name: '卵料理', image: '', ingredients: ['卵'], ingredientAmounts: { 卵: '2個' },
        steps: ['焼く'], minutes: 5, isFavorite: false, createdAt: '2026-09-24' }],
    },
  };
  for (const servings of [undefined, null, 1, 99]) {
    payload.data.recipes[0].servings = servings;
    contents = JSON.stringify(payload);
    assert.equal((await pickBackup()).data.recipes[0].servings, servings);
  }
  for (const servings of [0, -1, 1.5, 100, '2']) {
    payload.data.recipes[0].servings = servings;
    contents = JSON.stringify(payload);
    await assert.rejects(pickBackup(), /バックアップの内容/);
  }
});
