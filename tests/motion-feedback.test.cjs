require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
const listeners = new Map();
const exits = [], announcements = [];
const animationRuns = [];
let reduceQuery, timeoutQuery, reader = false, holdAnimations = false;
const native = {
  Platform: platform, Keyboard: { addListener: () => ({ remove() {} }) },
  StyleSheet: { create: (value) => value }, Text: 'Text', View: 'View', Pressable: 'Pressable',
  Modal: 'Modal', ScrollView: 'ScrollView',
  Easing: { cubic: (value) => value, in: (value) => value, out: (value) => value },
  Animated: {
    View: 'AnimatedView',
    Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; }
      stopAnimation() {} interpolate() { return {}; } },
    timing: (value, config) => ({ start(callback) {
      animationRuns.push({ value, config });
      if (holdAnimations) return;
      value.setValue(config.toValue);
      if (config.toValue === 0) exits.push(callback); else callback?.({ finished: true }); } }),
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => reduceQuery ?? Promise.resolve(false),
    isScreenReaderEnabled: () => Promise.resolve(reader),
    getRecommendedTimeoutMillis: () => timeoutQuery ?? Promise.resolve(4000),
    announceForAccessibilityWithOptions: (...args) => announcements.push(args),
    addEventListener: (event, handler) => { listeners.set(event, handler); return { remove() { listeners.delete(event); } }; },
  },
};
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return native;
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) };
  return originalLoad.call(this, request, ...args);
};
const { AppToastProvider, useAppToast, useToastState } = require('../src/context/AppToastContext.tsx');
const { MotionPreferenceProvider, useReducedMotion } = require('../src/context/MotionPreferenceContext.tsx');
const { AppToast } = require('../src/components/AppToast.tsx');
const { AppAlertProvider, useAppAlert } = require('../src/context/AppAlertContext.tsx');
const { useViewModeFade } = require('../src/hooks/useViewModeFade.ts');
const { SelectionHighlight } = require('../src/components/SelectionHighlight.tsx');
const { usePressMotion } = require('../src/hooks/usePressMotion.ts');
let showToast, showAlert, current, reduced;
function Probe() { showToast = useAppToast(); showAlert = useAppAlert(); current = useToastState().toast; reduced = useReducedMotion(); return null; }
async function mount() {
  let renderer;
  await act(async () => { renderer = create(React.createElement(MotionPreferenceProvider, null,
    React.createElement(AppToastProvider, null, React.createElement(AppAlertProvider, null, React.createElement(Probe), React.createElement(AppToast))))); });
  return renderer;
}
function reset(os = 'web') { platform.OS = os; listeners.clear(); exits.length = 0; announcements.length = 0;
  animationRuns.length = 0; holdAnimations = false;
  reduceQuery = undefined; timeoutQuery = undefined; reader = false; }

test('a completion notice waits until the guide dialog closes, then gets its full reading time', async (t) => {
  reset(); t.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = await mount();
  await act(async () => { showAlert('食材カードの操作', '操作ガイド'); showToast('食材を登録しました'); });
  await act(async () => t.mock.timers.tick(12000));
  assert.equal(exits.length, 0);
  assert.equal(renderer.root.findAllByType('Text').some((node) => node.props.children === '食材を登録しました'), false);
  await act(async () => renderer.root.findByType('Modal').findByType('Pressable').props.onPress());
  assert.equal(renderer.root.findAllByType('Text').some((node) => node.props.children === '食材を登録しました'), true);
  await act(async () => t.mock.timers.tick(3999));
  assert.equal(exits.length, 0);
  await act(async () => t.mock.timers.tick(1));
  await act(async () => exits[0]({ finished: true }));
  assert.equal(current, null);
  await act(async () => renderer.unmount());
});

test('a late closing callback cannot dismiss a newer toast; web notifications expire', async (t) => {
  reset(); reader = true; // RN Web reports true even when it cannot detect a screen reader.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = await mount();
  await act(async () => showToast('最初の完了'));
  await act(async () => t.mock.timers.tick(4000));
  assert.equal(exits.length, 1);
  await act(async () => showToast('次の完了'));
  await act(async () => exits[0]({ finished: true }));
  assert.equal(current.message, '次の完了');
  await act(async () => t.mock.timers.tick(4000));
  await act(async () => exits.at(-1)({ finished: true }));
  assert.equal(current, null);
  await act(async () => renderer.unmount());
});

test('VoiceOver notices stay available until dismissed and queue their announcement', async (t) => {
  reset('ios'); reader = true;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = await mount();
  await act(async () => showToast('食材を登録しました'));
  await act(async () => t.mock.timers.tick(20000));
  assert.equal(current.message, '食材を登録しました');
  assert.deepEqual(announcements, [['食材を登録しました', { queue: true }]]);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '完了通知を閉じる' }).props.onPress());
  await act(async () => exits.at(-1)({ finished: true }));
  assert.equal(current, null);
  await act(async () => renderer.unmount());
});

test('an updated motion preference wins over a slow initial query; changing it during exit still closes', async (t) => {
  reset(); let resolve;
  reduceQuery = new Promise((done) => { resolve = done; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = await mount();
  await act(async () => listeners.get('reduceMotionChanged')(true));
  await act(async () => resolve(false));
  assert.equal(reduced, true);
  await act(async () => listeners.get('reduceMotionChanged')(false));
  await act(async () => showToast('保存しました'));
  await act(async () => t.mock.timers.tick(4000));
  assert.equal(exits.length, 1);
  await act(async () => listeners.get('reduceMotionChanged')(true));
  assert.equal(current, null);
  await act(async () => renderer.unmount());
});

test('Android waits for the accessibility timeout before starting automatic dismissal', async (t) => {
  reset('android'); let resolve;
  timeoutQuery = new Promise((done) => { resolve = done; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = await mount();
  await act(async () => showToast('買い物リストに追加しました'));
  await act(async () => t.mock.timers.tick(10000));
  assert.equal(exits.length, 0);
  await act(async () => resolve(10000));
  await act(async () => t.mock.timers.tick(9999));
  assert.equal(exits.length, 0);
  await act(async () => t.mock.timers.tick(1));
  assert.equal(exits.length, 1);
  await act(async () => exits[0]({ finished: true }));
  assert.equal(current, null);
  await act(async () => renderer.unmount());
});

test('toast undo action runs once and a stale button cannot affect the newer notice', async (t) => {
  reset(); const renderer = await mount();
  t.after(async () => { await act(async () => renderer.unmount()); });
  let actions = 0;
  await act(async () => showToast('使い切ったとして記録しました', {
    label: '元に戻す', hint: '食材だけ戻します。', onPress: () => { actions++; showToast('管理中に戻しました'); },
  }));
  const button = renderer.root.findByProps({ accessibilityLabel: '元に戻す' });
  assert.equal(button.props.accessibilityHint, '食材だけ戻します。');
  assert.equal(button.props.style({ pressed: false })[0].minHeight, 44);
  const oldPress = button.props.onPress;
  await act(async () => { oldPress(); oldPress(); });
  assert.equal(actions, 1); assert.equal(current.message, '管理中に戻しました');
  await act(async () => oldPress());
  assert.equal(actions, 1);
});

test('undo notice gives eight seconds, pauses on focus, and still closes manually', async (t) => {
  reset(); t.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = await mount();
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => showToast('捨てたとして記録しました', { label: '元に戻す', onPress() {} }));
  await act(async () => t.mock.timers.tick(7999));
  assert.equal(exits.length, 0);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '元に戻す' }).props.onFocus());
  await act(async () => t.mock.timers.tick(20000));
  assert.equal(exits.length, 0);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '元に戻す' }).props.onBlur());
  await act(async () => t.mock.timers.tick(8000));
  await act(async () => exits.at(-1)({ finished: true }));
  assert.equal(current, null);
  await act(async () => showToast('使い切ったとして記録しました', { label: '元に戻す', onPress() {} }));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '完了通知を閉じる' }).props.onPress());
  await act(async () => exits.at(-1)({ finished: true }));
  assert.equal(current, null);
});

let listMotion;
function ViewModeProbe({ mode, query, width }) {
  listMotion = useViewModeFade(mode);
  return React.createElement(React.Fragment, null, React.createElement('Text', null, query),
    React.createElement(SelectionHighlight, { index: ['expiry', 'storage', 'category'].indexOf(mode), width }));
}
const viewModeElement = (mode, query = '', width = 100) => React.createElement(MotionPreferenceProvider, null,
  React.createElement(ViewModeProbe, { mode, query, width }));

test('only a grouping change fades the list; search rerenders do not replay or interrupt the fade', async (t) => {
  reset(); holdAnimations = true;
  let renderer;
  await act(async () => { renderer = create(viewModeElement('expiry')); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(animationRuns.length, 0, 'initial rendering stays still');
  await act(async () => renderer.update(viewModeElement('expiry', '牛乳')));
  assert.equal(animationRuns.length, 0, 'typing does not animate the grouping');
  await act(async () => renderer.update(viewModeElement('storage', '牛乳')));
  assert.ok(animationRuns.some((run) => run.value === listMotion.opacity));
  assert.ok(listMotion.opacity.value > 0 && listMotion.opacity.value < 1, 'new contents remain visible during the fade');
  assert.ok(listMotion.translateY.value > 0, 'the new grouping also has a visible entrance');
  const count = animationRuns.length, opacity = listMotion.opacity.value;
  await act(async () => renderer.update(viewModeElement('storage', '牛乳と卵')));
  assert.equal(animationRuns.length, count);
  assert.equal(listMotion.opacity.value, opacity);
});

test('enabling reduced motion midway immediately restores the list and current selection', async (t) => {
  reset(); holdAnimations = true;
  let renderer;
  await act(async () => { renderer = create(viewModeElement('expiry')); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => renderer.update(viewModeElement('storage')));
  const count = animationRuns.length;
  await act(async () => listeners.get('reduceMotionChanged')(true));
  assert.equal(listMotion.opacity.value, 1);
  assert.equal(listMotion.translateY.value, 0);
  assert.equal(renderer.root.findByType('AnimatedView').props.style.at(-1).transform[0].translateX.value, 100);
  await act(async () => renderer.update(viewModeElement('category')));
  assert.equal(listMotion.opacity.value, 1);
  assert.equal(listMotion.translateY.value, 0);
  assert.equal(renderer.root.findByType('AnimatedView').props.style.at(-1).transform[0].translateX.value, 200);
  await act(async () => listeners.get('reduceMotionChanged')(false));
  assert.equal(animationRuns.length, count, 'preference changes and reduced-motion selections add no delayed transitions');
});

test('a sliding selection follows the latest rapid tap and snaps to a changed screen width', async (t) => {
  reset('ios'); holdAnimations = true; let renderer;
  await act(async () => { renderer = create(viewModeElement('expiry', '', 0)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(renderer.root.findAllByType('AnimatedView').length, 0);
  await act(async () => renderer.update(viewModeElement('expiry', '', 100)));
  assert.equal(animationRuns.length, 0, 'initial measurement does not animate');
  await act(async () => renderer.update(viewModeElement('storage', '', 100)));
  const indicator = renderer.root.findByType('AnimatedView').props.style.at(-1).transform[0].translateX;
  assert.equal(animationRuns.filter((run) => run.value === indicator).at(-1).config.toValue, 100);
  await act(async () => renderer.update(viewModeElement('category', '', 100)));
  assert.equal(animationRuns.filter((run) => run.value === indicator).at(-1).config.toValue, 200);
  const count = animationRuns.length;
  await act(async () => renderer.update(viewModeElement('category', '', 80)));
  assert.equal(indicator.value, 160);
  assert.equal(animationRuns.length, count, 'resizing does not replay selection or list animations');
  await act(async () => listeners.get('reduceMotionChanged')(true));
  await act(async () => renderer.update(viewModeElement('expiry', '', 80)));
  assert.equal(indicator.value, 0); assert.equal(animationRuns.length, count);
});

test('a quick press shows feedback before release, while reduced motion and disabled controls stay still', async (t) => {
  reset('ios'); holdAnimations = true; let renderer, press;
  function PressProbe({ disabled }) { press = usePressMotion(disabled); return null; }
  const element = (disabled = false) => React.createElement(MotionPreferenceProvider, null, React.createElement(PressProbe, { disabled }));
  await act(async () => { renderer = create(element()); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => press.onPressIn());
  assert.ok(press.scale.value < 1, 'pressing is visible without waiting for an animation frame');
  await act(async () => press.onPressOut());
  assert.equal(animationRuns.at(-1).config.toValue, 1);
  await act(async () => renderer.update(element(true)));
  assert.equal(press.scale.value, 1);
  const count = animationRuns.length;
  await act(async () => { press.onPressIn(); press.onPressOut(); });
  assert.equal(animationRuns.length, count);
  await act(async () => renderer.update(element()));
  await act(async () => listeners.get('reduceMotionChanged')(true));
  await act(async () => { press.onPressIn(); press.onPressOut(); });
  assert.equal(press.scale.value, 1); assert.equal(animationRuns.length, count);
});
