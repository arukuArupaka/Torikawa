require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let day = '2026-10-15', reducedMotion = true, dismisses = 0;
const native = { Platform: { OS: 'web' }, Keyboard: { dismiss() { dismisses++; } },
  StyleSheet: { create: styles => styles, absoluteFill: {} },
  Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' };
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return native;
  if (request === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 34 }) };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.endsWith('/context/MotionPreferenceContext')) return { useReducedMotion: () => reducedMotion };
  if (request.endsWith('/hooks/useCurrentDay')) return { useCurrentDay: () => day };
  if (request === './PrimaryButton') return { PrimaryButton: props => React.createElement('PrimaryButton', props) };
  return originalLoad.call(this, request, ...args);
};
const { DatePickerPanel } = require('../src/components/DatePickerPanel.tsx');
const { DatePickerField: nativeField } = require('../src/components/DatePickerField.tsx');
const { DatePickerField: webField } = require('../src/components/DatePickerField.web.tsx');
const button = (root, label) => root.findByProps({ accessibilityRole: 'button', accessibilityLabel: label });
const action = (root, label) => root.findByProps({ label }).props.onPress;
async function mount(t, value = '2026-10-17') {
  day = '2026-10-15'; reducedMotion = true; native.Platform.OS = 'web';
  let renderer, setValue;
  const changes = [];
  function Harness() {
    const [current, change] = React.useState(value);
    setValue = change;
    return React.createElement(DatePickerPanel, { label: '期限日', value: current, onChange: next => { changes.push(next); change(next); } });
  }
  await act(async () => { renderer = create(React.createElement(Harness)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return { renderer, changes, setValue };
}

test('date panel preserves form size and draft on select, commits once on confirm and both platforms share it', async (t) => {
  assert.strictEqual(nativeField, DatePickerPanel); assert.strictEqual(webField, DatePickerPanel);
  const { renderer, changes } = await mount(t);
  const root = renderer.root;
  const before = dismisses;
  await act(async () => button(root, '期限日：2026年10月17日').props.onPress());
  assert.equal(dismisses, before + 1);
  assert.equal(root.findByType('Modal').props.animationType, 'none');
  assert.equal(root.findByType('Modal').props.presentationStyle, 'overFullScreen');
  assert.equal(button(root, '2026年10月17日').props.accessibilityState.selected, true);
  await act(async () => button(root, '2026年10月20日').props.onPress());
  assert.deepEqual(changes, []);
  assert.equal(button(root, '期限日：2026年10月17日').props.accessibilityState.expanded, true);
  assert.equal(button(root, '2026年10月20日').props.accessibilityState.selected, true);
  const confirm = action(root, '決定');
  await act(async () => { confirm(); confirm(); });
  assert.deepEqual(changes, ['2026-10-20']);
  assert.equal(root.findAllByType('Modal').length, 0);
  assert.equal(button(root, '期限日：2026年10月20日').props.accessibilityState.expanded, false);
});

test('cancel, close, backdrop, system back and unchanged confirm never apply a draft; reopening resets it', async (t) => {
  const { renderer, changes } = await mount(t);
  const root = renderer.root;
  for (const close of [() => action(root, 'キャンセル')(), () => button(root, '期限日の選択を閉じる').props.onPress(),
    () => button(root, '日付の選択をキャンセル').props.onPress(), () => root.findByType('Modal').props.onRequestClose()]) {
    await act(async () => button(root, '期限日：2026年10月17日').props.onPress());
    await act(async () => button(root, '2026年10月31日').props.onPress());
    await act(async () => close());
    assert.equal(root.findAllByType('Modal').length, 0);
    assert.deepEqual(changes, []);
  }
  await act(async () => button(root, '期限日：2026年10月17日').props.onPress());
  assert.equal(button(root, '2026年10月17日').props.accessibilityState.selected, true);
  await act(async () => action(root, '決定')());
  assert.deepEqual(changes, []);
});

test('calendar crosses years, handles leap days and 30-day months, and today follows a changed local day', async (t) => {
  const { renderer, changes } = await mount(t, '2028-02-29');
  const root = renderer.root;
  reducedMotion = false;
  await act(async () => button(root, '期限日：2028年2月29日').props.onPress());
  assert.equal(root.findByType('Modal').props.animationType, 'slide');
  assert.ok(button(root, '2028年2月29日'));
  assert.equal(root.findAllByProps({ accessibilityLabel: '2028年2月30日' }).length, 0);
  await act(async () => button(root, '期限日の前の月').props.onPress());
  await act(async () => button(root, '期限日の前の月').props.onPress());
  assert.ok(button(root, '2027年12月31日'));
  await act(async () => button(root, '期限日の次の月').props.onPress());
  assert.ok(button(root, '2028年1月1日'));
  day = '2026-11-01';
  await act(async () => action(root, 'キャンセル')());
  await act(async () => button(root, '期限日：2028年2月29日').props.onPress());
  await act(async () => button(root, '今日を選ぶ').props.onPress());
  assert.equal(button(root, '2026年11月1日、今日').props.accessibilityState.selected, true);
  assert.ok(button(root, '2026年11月30日'));
  assert.equal(root.findAllByProps({ accessibilityLabel: '2026年11月31日' }).length, 0);
  await act(async () => action(root, '決定')());
  assert.deepEqual(changes, ['2026-11-01']);
});

test('an external date update closes the old panel and invalidates its captured confirmation', async (t) => {
  const { renderer, changes, setValue } = await mount(t);
  const root = renderer.root;
  await act(async () => button(root, '期限日：2026年10月17日').props.onPress());
  await act(async () => button(root, '2026年10月20日').props.onPress());
  const staleConfirm = action(root, '決定');
  await act(async () => setValue('2026-10-22'));
  await act(async () => staleConfirm());
  assert.equal(root.findAllByType('Modal').length, 0);
  assert.deepEqual(changes, []);
  await act(async () => button(root, '期限日：2026年10月22日').props.onPress());
  assert.equal(button(root, '2026年10月22日').props.accessibilityState.selected, true);
});

test('a confirmation from a cancelled panel cannot save after the same field reopens', async (t) => {
  const { renderer, changes } = await mount(t);
  const root = renderer.root;
  await act(async () => button(root, '期限日：2026年10月17日').props.onPress());
  await act(async () => button(root, '2026年10月20日').props.onPress());
  const oldConfirm = action(root, '決定');
  await act(async () => action(root, 'キャンセル')());
  await act(async () => button(root, '期限日：2026年10月17日').props.onPress());
  await act(async () => button(root, '2026年10月22日').props.onPress());
  await act(async () => oldConfirm());
  assert.deepEqual(changes, []);
  assert.equal(root.findAllByType('Modal').length, 1);
  await act(async () => action(root, '決定')());
  assert.deepEqual(changes, ['2026-10-22']);
});
