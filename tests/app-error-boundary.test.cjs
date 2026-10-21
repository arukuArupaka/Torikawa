require('./register-typescript.cjs');
const { after, afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const Module = require('node:module');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const previousDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
const alerts = [], loggedErrors = [];
const AlertContext = React.createContext(null);
let renderer, exportCalls, exportData, providerError, navigationError;
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { StyleSheet: { create: (value) => value }, Text: 'Text', ScrollView: 'ScrollView' };
  if (request === 'react-native-safe-area-context') return { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' };
  if (request === 'react-native-gesture-handler') return { GestureHandlerRootView: 'GestureHandlerRootView' };
  if (request === 'expo-status-bar') return { StatusBar: 'StatusBar' };
  if (request === '@react-navigation/native') return { NavigationContainer: 'NavigationContainer' };
  if (request.endsWith('/context/AppAlertContext')) return {
    AppAlertProvider: ({ children }) => React.createElement(AlertContext.Provider, { value: (...values) => alerts.push(values) }, React.createElement('AppAlertProvider', null, children)),
    useAppAlert: () => { const value = React.useContext(AlertContext); assert.ok(value, 'the alert provider must survive a child error'); return value; },
  };
  if (request.endsWith('/context/AppToastContext')) return { AppToastProvider: 'AppToastProvider' };
  if (request.endsWith('/context/MotionPreferenceContext')) return { MotionPreferenceProvider: 'MotionPreferenceProvider' };
  if (request.endsWith('/context/AppDataContext')) return { AppDataProvider: ({ children }) => {
    if (providerError) throw providerError;
    return React.createElement('AppDataProvider', null, children);
  } };
  if (request.endsWith('/navigation/RootNavigator')) return { RootNavigator: () => {
    if (navigationError) throw navigationError;
    return React.createElement('RootNavigator');
  } };
  if (request.endsWith('/navigation/navigationRef')) return { navigationRef: {} };
  if (request.endsWith('/components/NotificationNavigationHandler')) return { NotificationNavigationHandler: () => null };
  if (request.endsWith('/components/AppToast')) return { AppToast: 'AppToast' };
  if (request === './PrimaryButton') return { PrimaryButton: 'PrimaryButton' };
  if (request.endsWith('/services/backupService')) return { shareRecoveryData: async () => { exportCalls++; await exportData(); } };
  if (request.endsWith('/services/notificationService')) return { initializeNotificationHandling: () => {} };
  return original.call(this, request, ...args);
};
const { AppErrorBoundary } = require('../src/components/AppErrorBoundary.tsx');
const App = require('../App.tsx').default;
const flush = () => new Promise(setImmediate);
const texts = () => renderer.root.findAllByType('Text').map((node) => node.props.children);
const button = (label) => renderer.root.findAllByType('PrimaryButton').find((node) => node.props.label === label);
const render = async (child) => act(async () => {
  renderer = create(React.createElement(AlertContext.Provider, { value: (...values) => alerts.push(values) },
    React.createElement(AppErrorBoundary, null, child)));
});
function Broken() { throw Error('private render detail'); }

beforeEach((t) => {
  renderer = null; exportCalls = 0; exportData = async () => {}; providerError = null; navigationError = null;
  alerts.length = 0; loggedErrors.length = 0; globalThis.__DEV__ = false;
  t.mock.method(console, 'error', (...values) => loggedErrors.push(values));
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
after(() => {
  Module._load = original;
  if (previousDev) Object.defineProperty(globalThis, '__DEV__', previousDev);
  else delete globalThis.__DEV__;
});

test('a child render failure shows recovery actions, preserves saved-data guidance and logs locally', async () => {
  await render(React.createElement(Broken));
  assert.ok(texts().includes('画面を表示できませんでした'));
  assert.ok(texts().some((text) => text.includes('保存済みのデータは消えていません')));
  assert.ok(button('もう一度表示する'));
  assert.ok(button('保存データを書き出す'));
  assert.equal(JSON.stringify(renderer.toJSON()).includes('private render detail'), false, 'release UI must hide error details');
  const log = loggedErrors.find(([message]) => message === '画面の表示中にエラーが発生しました。');
  assert.equal(log[1].message, 'private render detail');
  assert.match(log[2].componentStack, /Broken/);
  assert.equal(exportCalls, 0, 'render failure must not automatically export personal data');
});

test('retry resets the boundary and renders its child again; persistent failures can be retried again', async () => {
  let shouldThrow = true, mounts = 0;
  function Child() {
    React.useEffect(() => { mounts++; }, []);
    if (shouldThrow) throw Error('retryable');
    return React.createElement('ChildContent');
  }
  await render(React.createElement(Child));
  await act(async () => button('もう一度表示する').props.onPress());
  assert.ok(texts().includes('画面を表示できませんでした'));
  shouldThrow = false;
  await act(async () => button('もう一度表示する').props.onPress());
  assert.equal(renderer.root.findAllByType('ChildContent').length, 1);
  assert.equal(texts().includes('画面を表示できませんでした'), false);
  assert.equal(mounts, 1);
});

test('export calls the existing recovery service once, disables both actions while busy and explains the file', async () => {
  let resolve;
  exportData = () => new Promise((done) => { resolve = done; });
  await render(React.createElement(Broken));
  const press = button('保存データを書き出す').props.onPress;
  await act(async () => { press(); press(); await flush(); });
  assert.equal(exportCalls, 1);
  assert.equal(button('もう一度表示する').props.disabled, true);
  assert.equal(button('書き出し中...').props.disabled, true);
  assert.equal(alerts.length, 0);
  await act(async () => { resolve(); await flush(); });
  assert.equal(alerts.at(-1)[0], '原本の退避');
  assert.match(alerts.at(-1)[1], /通常のバックアップ復元には使えません/);
  assert.equal(button('保存データを書き出す').props.disabled, false);
});

test('an unavailable or failed export reports the existing error and permits another attempt', async () => {
  exportData = async () => { throw Error('この端末ではファイル共有を利用できません。'); };
  await render(React.createElement(Broken));
  await act(async () => { button('保存データを書き出す').props.onPress(); await flush(); });
  assert.deepEqual(alerts.at(-1), ['原本を退避できませんでした', 'この端末ではファイル共有を利用できません。']);
  assert.equal(button('もう一度表示する').props.disabled, false);
  assert.equal(button('保存データを書き出す').props.disabled, false);
  exportData = async () => {};
  await act(async () => { button('保存データを書き出す').props.onPress(); await flush(); });
  assert.equal(exportCalls, 2);
  assert.equal(alerts.at(-1)[0], '原本の退避');
});

test('error details are visible only during development; even a falsy thrown value is caught', async () => {
  globalThis.__DEV__ = true;
  await render(React.createElement(Broken));
  assert.ok(texts().some((text) => text.includes('private render detail')));
  await act(async () => renderer.unmount()); renderer = null;
  globalThis.__DEV__ = false;
  function ThrowsNull() { throw null; }
  await render(React.createElement(ThrowsNull));
  assert.ok(texts().includes('画面を表示できませんでした'));
  assert.equal(texts().includes('null'), false);
});

for (const source of ['data provider', 'navigation']) {
  test(`App catches a ${source} error while alert and toast providers remain outside the boundary`, async () => {
    if (source === 'data provider') providerError = Error('provider render');
    else navigationError = Error('navigation render');
    await act(async () => { renderer = create(React.createElement(App)); });
    assert.ok(texts().includes('画面を表示できませんでした'));
    assert.equal(renderer.root.findAllByType('AppDataProvider').length, 0);
    assert.equal(renderer.root.findAllByType('NavigationContainer').length, 0);
    assert.equal(renderer.root.findAllByType('AppAlertProvider').length, 1);
    assert.equal(renderer.root.findAllByType('AppToastProvider').length, 1);
    assert.equal(renderer.root.findAllByType('AppToast').length, 1);
    await act(async () => { button('保存データを書き出す').props.onPress(); await flush(); });
    assert.equal(alerts.at(-1)[0], '原本の退避');
    providerError = null; navigationError = null;
    await act(async () => button('もう一度表示する').props.onPress());
    assert.equal(renderer.root.findAllByType('RootNavigator').length, 1);
  });
}
