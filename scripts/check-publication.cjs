'use strict';
const { readPublicationConfig } = require('./publication-config.cjs');

try {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw new Error('使い方: node scripts/check-publication.cjs publication.local.json');
  readPublicationConfig(file);
  console.log('公開設定の3項目と形式を確認しました。');
  console.log('これは公開可否の判定ではありません。ポリシー本文・素材の権利・実機確認は docs/publication-checklist.md で確認してください。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
