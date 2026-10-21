require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const Module = require('node:module');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const alerts = [], opened = [];
let failLink = false;
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { StyleSheet: { create: (value) => value },
    Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView',
    Linking: { openURL: async (url) => { if (failLink) throw Error('unavailable'); opened.push(url); } } };
  if (request.endsWith('/context/AppAlertContext')) return { useAppAlert: () => (...args) => alerts.push(args) };
  if (request.startsWith('../components/')) { const name = request.split('/').at(-1); return { [name]: (props) => React.createElement(name, props) }; }
  return original.call(this, request, ...args);
};
const { publicHttpsUrl } = require('../src/constants/publication.ts');
const { AppInformationScreen } = require('../src/screens/AppInformationScreen.tsx');
const keys = ['EXPO_PUBLIC_OPERATOR_NAME', 'EXPO_PUBLIC_SUPPORT_EMAIL', 'EXPO_PUBLIC_PRIVACY_POLICY_URL'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const clear = () => { keys.forEach((key) => delete process.env[key]); alerts.length = 0; opened.length = 0; failLink = false; };
const restore = () => keys.forEach((key) => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });

test('policy URLs reject executable schemes, HTTP and embedded credentials', () => {
  for (const value of ['', 'javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'broken']) assert.equal(publicHttpsUrl(value), null);
  assert.equal(publicHttpsUrl(' https://example.com/privacy '), 'https://example.com/privacy');
});

test('unconfigured privacy view describes retention without presenting a published policy or contact', async () => {
  clear(); let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(AppInformationScreen, { navigation: { goBack() {} }, route: { params: { section: 'privacy' } } })); });
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /復元前の原本は通常2世代分を保持/);
    assert.match(text, /日時を判別できない世代は安全のため残します/);
    assert.match(text, /公開用プライバシーポリシーは準備中/);
    assert.equal(renderer.root.findAllByProps({ accessibilityRole: 'link' }).length, 0);
  } finally { if (renderer) await act(async () => renderer.unmount()); restore(); }
});

test('configured contact and policy open the specified destinations; link failures are recoverable', async () => {
  clear(); let renderer;
  process.env.EXPO_PUBLIC_OPERATOR_NAME = 'テスト運営者';
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'support@example.com';
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'https://example.com/privacy';
  try {
    await act(async () => { renderer = create(React.createElement(AppInformationScreen, { navigation: { goBack() {} }, route: { params: { section: 'privacy' } } })); });
    assert.match(JSON.stringify(renderer.toJSON()), /テスト運営者/);
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'プライバシーポリシーを開く' }).props.onPress(); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'メールで問い合わせる' }).props.onPress(); });
    assert.deepEqual(opened, ['https://example.com/privacy', 'mailto:support@example.com']);
    failLink = true;
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'メールで問い合わせる' }).props.onPress(); });
    assert.equal(alerts.at(-1)[0], 'リンクを開けませんでした');
  } finally { if (renderer) await act(async () => renderer.unmount()); restore(); }
});

test('external service information retains the full Yahoo credit and working official link', async t => {
  clear();
  t.after(restore);
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppInformationScreen, {
    navigation: { goBack() {} }, route: { params: { section: 'services' } },
  })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const credits = renderer.root.findAllByType('Text').filter(node =>
    node.props.children === 'Webサービス by Yahoo! JAPAN （https://developer.yahoo.co.jp/sitemap/）');
  assert.equal(credits.length, 1);
  assert.equal(credits[0].props.selectable, true);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Yahoo!デベロッパーネットワーク' }).props.onPress());
  assert.deepEqual(opened, ['https://developer.yahoo.co.jp/sitemap/']);
  assert.deepEqual(alerts, []);
});

test('image information distinguishes generated recipe illustrations from retained personal images', async t => {
  clear(); t.after(restore);
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppInformationScreen, {
    navigation: { goBack() {} }, route: { params: { section: 'services' } },
  })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /内蔵レシピの画像はAI生成/);
  assert.match(text, /利用者が選んだ写真や、以前保存した外部画像はそのまま保持/);
  assert.doesNotMatch(text, /Unsplash/);
});
