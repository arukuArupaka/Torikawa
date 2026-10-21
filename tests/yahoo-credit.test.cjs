require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'ios' };
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return { Platform: platform, StyleSheet: { create: styles => styles }, Text: 'Text' };
  if (request === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
  return originalLoad.call(this, request, ...args);
};
const { Screen } = require('../src/components/Screen.tsx');
const { YahooCredit: WebCredit } = require('../src/components/YahooCredit.web.tsx');
const key = 'EXPO_PUBLIC_YAHOO_LOOKUP_URL';
function preserveEnvironment(t) {
  const saved = process.env[key];
  t.after(() => { if (saved === undefined) delete process.env[key]; else process.env[key] = saved; });
}

test('native screens keep their content and safe area without a fixed Yahoo credit on iOS and Android', async t => {
  preserveEnvironment(t);
  for (const os of ['ios', 'android']) {
    platform.OS = os;
    for (const endpoint of ['', 'https://lookup.example.com/api/yahoo-product']) {
      process.env[key] = endpoint;
      let renderer;
      await act(async () => { renderer = create(React.createElement(Screen, { bottomSafe: true },
        React.createElement('Text', null, '食材一覧'))); });
      try {
        assert.deepEqual(renderer.root.findByType('SafeAreaView').props.edges, ['top', 'bottom']);
        assert.deepEqual(renderer.root.findAllByType('Text').map(node => node.props.children), ['食材一覧']);
        assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Webサービス by Yahoo! JAPAN/);
      } finally { await act(async () => renderer.unmount()); }
    }
  }
});

test('web screens retain the prescribed Yahoo attribution only when the lookup endpoint is configured', async t => {
  preserveEnvironment(t);
  platform.OS = 'web';
  delete process.env[key];
  let renderer;
  await act(async () => { renderer = create(React.createElement(WebCredit)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(renderer.toJSON(), null);
  process.env[key] = '/api/yahoo-product';
  await act(async () => renderer.update(React.createElement(WebCredit)));
  assert.deepEqual(renderer.root.findByType('span').props.style, { margin: '15px 15px 15px 15px' });
  const link = renderer.root.findByType('a');
  assert.equal(link.props.href, 'https://developer.yahoo.co.jp/sitemap/');
  assert.equal(link.props.children, 'Webサービス by Yahoo! JAPAN');
  delete process.env[key];
  await act(async () => renderer.update(React.createElement(WebCredit)));
  assert.equal(renderer.toJSON(), null);
});
