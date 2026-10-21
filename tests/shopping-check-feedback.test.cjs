require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let items, reduced, saves, toasts, animations, toggleCalls;
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return {
    Platform: { OS: 'web' }, StyleSheet: { create: styles => styles }, Easing: { linear: value => value },
    KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View',
    SectionList: require('./native-section-list.cjs'),
    Animated: { View: 'AnimatedView', Text: 'AnimatedText',
      Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; }
        stopAnimation() {} interpolate(config) { return { value: this, config }; } },
      timing: (value, config) => ({ start() { animations.push({ value, config }); } }),
    },
  };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.endsWith('/context/MotionPreferenceContext')) return { useReducedMotion: () => reduced };
  if (request.endsWith('/context/AppToastContext')) return { useAppToast: () => (message, action) => toasts.push({ message, action }) };
  if (request.endsWith('/context/AppDataContext')) return { useAppData() {
    const [, update] = React.useState(0);
    return { foods: [], shoppingItems: items, addShoppingItem() {}, deleteShoppingItem() {},
      toggleShoppingItem(id, onSaved, expected) {
        const previous = items.find(item => item.id === id);
        if (!previous || previous.checked !== expected) return false;
        toggleCalls++;
        items = items.map(item => item.id === id ? { ...item, checked: !item.checked } : item);
        update(value => value + 1); saves.push(onSaved); return true;
      },
    };
  } };
  const name = request.split('/').at(-1);
  if (name === 'AnimatedDisclosure') return { AnimatedDisclosure: props => React.createElement('View', null, props.header, props.expanded ? props.children : null) };
  if (['Screen', 'ScreenHeader', 'MotionIconButton'].includes(name)) return { [name]: props => React.createElement(name, props, props.children) };
  return load.call(this, request, ...args);
};
const { ShoppingListScreen } = require('../src/screens/ShoppingListScreen.tsx');
async function mount(t, reduce = false) {
  items = ['卵', '牛乳', 'にんじん'].map((name, index) => ({ id: String(index), name, checked: false, createdAt: '2026-10-15' }));
  reduced = reduce; saves = []; toasts = []; animations = []; toggleCalls = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let renderer;
  await act(async () => { renderer = create(React.createElement(ShoppingListScreen, { navigation: {} })); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return {
    renderer,
    control: label => renderer.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label),
    async reduce(value) { reduced = value; await act(async () => renderer.update(React.createElement(ShoppingListScreen, { navigation: {} }))); },
  };
}

test('checking saves immediately, shows the checked row briefly, and blocks a repeated press on that row only', async t => {
  const app = await mount(t);
  const press = app.control('卵を購入済みにする').props.onPress;
  await act(async () => { press(); press(); });
  assert.equal(items[0].checked, true); assert.equal(toggleCalls, 1);
  assert.ok(app.control('購入済み1件'));
  assert.equal(app.control('卵を未購入に戻す').props.disabled, true);
  assert.equal(app.control('牛乳を購入済みにする').props.disabled, false);
  assert.ok(app.renderer.root.findAllByType('Icon').some(node => node.props.name === 'checkbox'));
  assert.equal(toasts.length, 0, 'completion waits for the save callback');
  await act(async () => t.mock.timers.tick(499));
  assert.ok(app.control('卵を未購入に戻す'));
  await act(async () => t.mock.timers.tick(1));
  assert.equal(app.control('卵を未購入に戻す'), undefined);
  saves[0](() => true);
  assert.match(toasts[0].message, /卵.*購入済み/); assert.equal(toasts[0].action.label, '元に戻す');
  assert.ok(animations.some(run => run.config.duration === 480));
  assert.ok(animations.some(run => run.config.duration === 420));
});

test('quick checks on different items finish independently and switching lists clears transient copies', async t => {
  const app = await mount(t);
  await act(async () => app.control('卵を購入済みにする').props.onPress());
  await act(async () => t.mock.timers.tick(100));
  await act(async () => app.control('牛乳を購入済みにする').props.onPress());
  assert.equal(toggleCalls, 2); assert.ok(app.control('購入済み2件'));
  await act(async () => t.mock.timers.tick(400));
  assert.equal(app.control('卵を未購入に戻す'), undefined);
  assert.ok(app.control('牛乳を未購入に戻す'));
  await act(async () => app.control('購入済み2件').props.onPress());
  assert.equal(app.control('卵を未購入に戻す').props.disabled, false);
  assert.equal(app.control('牛乳を未購入に戻す').props.disabled, false);
  assert.ok(app.control('牛乳を食材として登録'));
  await act(async () => t.mock.timers.tick(1000));
  assert.ok(app.control('牛乳を未購入に戻す'));
});

test('reduced motion removes the row immediately and enabling it during a check cancels the remaining motion', async t => {
  const app = await mount(t, true);
  await act(async () => app.control('卵を購入済みにする').props.onPress());
  assert.equal(app.control('卵を未購入に戻す'), undefined); assert.equal(animations.length, 0);
  await app.reduce(false);
  await act(async () => app.control('牛乳を購入済みにする').props.onPress());
  assert.ok(app.control('牛乳を未購入に戻す'));
  await app.reduce(true);
  assert.equal(app.control('牛乳を未購入に戻す'), undefined);
  const runs = animations.length;
  await act(async () => t.mock.timers.tick(1000));
  assert.equal(animations.length, runs); assert.equal(toggleCalls, 2);
});

test('leaving the screen clears animation timers while a committed purchase can still offer undo', async t => {
  const app = await mount(t);
  await act(async () => app.control('卵を購入済みにする').props.onPress());
  await act(async () => app.renderer.unmount());
  await act(async () => t.mock.timers.tick(1000));
  saves[0](() => true);
  assert.equal(toasts[0].action.label, '元に戻す');
  toasts[0].action.onPress();
  assert.equal(toggleCalls, 1, 'an animation or old UI action must not toggle purchase state again');
});
