'use strict';
const fs = require('node:fs');

const fields = ['operator', 'supportEmail', 'privacyPolicyUrl'];
function validatePublicationConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('公開設定はJSONオブジェクトで指定してください。');
  }
  if (Object.keys(value).some(key => !fields.includes(key))) {
    // Never echo an unexpected key or value: it might contain a credential.
    throw new Error('公開設定には運営者・問い合わせメール・ポリシーURLの3項目だけを指定してください。');
  }
  const result = {};
  for (const field of fields) {
    if (typeof value[field] !== 'string' || !value[field].trim()
      || /[\u0000-\u001f\u007f]/.test(value[field])) {
      throw new Error(`${field} が未設定、または形式が不正です。`);
    }
    result[field] = value[field].trim();
  }
  if (result.operator.length > 120) throw new Error('運営者表示名は120文字以内で指定してください。');
  if (result.supportEmail.length > 254 || !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(result.supportEmail)) {
    throw new Error('問い合わせメールの形式が不正です。');
  }
  try {
    const url = new URL(result.privacyPolicyUrl);
    if (url.protocol !== 'https:' || url.username || url.password || result.privacyPolicyUrl.length > 2048) throw Error();
    result.privacyPolicyUrl = url.href;
  } catch { throw new Error('ポリシーURLは認証情報を含まないHTTPSのURLで指定してください。'); }
  return result;
}

function readPublicationConfig(file) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('公開設定ファイルを読み込めませんでした。ファイルの場所とJSON形式を確認してください。'); }
  return validatePublicationConfig(value);
}

function createWebTestEnvironment(parentEnvironment, { basePath = '', yahooEnabled = false, publication = null } = {}) {
  const contact = publication ? validatePublicationConfig(publication) : null;
  // Do not load .env or inherit any EXPO_PUBLIC values from the developer's shell.
  const environment = Object.fromEntries(Object.entries(parentEnvironment).filter(([name]) => !name.startsWith('EXPO_PUBLIC_')));
  Object.assign(environment, {
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_WEB_TEST: 'true',
    EXPO_PUBLIC_WEB_BASE_PATH: basePath,
    EXPO_PUBLIC_DEMO_DATA: 'false',
    EXPO_PUBLIC_YAHOO_SHOPPING_APP_ID: '',
    EXPO_PUBLIC_YAHOO_LOOKUP_URL: yahooEnabled ? '/api/yahoo-product' : '',
    EXPO_PUBLIC_SHARED_PRODUCTS_URL: '',
    EXPO_PUBLIC_OPERATOR_NAME: contact?.operator ?? '',
    EXPO_PUBLIC_SUPPORT_EMAIL: contact?.supportEmail ?? '',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: contact?.privacyPolicyUrl ?? '',
  });
  // Server-only Yahoo configuration has no role in the export process.
  delete environment.YAHOO_SHOPPING_APP_ID;
  return environment;
}

module.exports = { readPublicationConfig, validatePublicationConfig, createWebTestEnvironment };
