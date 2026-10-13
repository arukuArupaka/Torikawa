require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let reduced = false;
const animations = [];
const native = {
  View: 'View', TextInput: 'TextInput', StyleSheet: { create: (styles) => styles },
  Easing: { cubic: (value) => value, out: (value) => value },
  Animated: {
    View: 'AnimatedView',
    Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation() {} },
    timing: (value, config) => ({ start(callback) { animations.push({ value, config, callback }); } }),
  },
};
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return native;
  if (request.endsWith('/context/MotionPreferenceContext')) return { useReducedMotion: () => reduced };
  return originalLoad.call(this, request, ...args);
};
const { AnimatedDisclosure } = require('../src/components/AnimatedDisclosure.tsx');
const section = (expanded) => React.createElement(AnimatedDisclosure, { expanded, header: React.createElement('Header') },
  React.createElement('TextInput', { value: '残しておきたいメモ' }));
const measure = async (renderer, height) => {
  await act(async () => renderer.root.findAllByType('View').find((node) => node.props.onLayout)
    .props.onLayout({ nativeEvent: { layout: { height } } }));
};
const finish = async (animation) => {
  await act(async () => { animation.value.setValue(animation.config.toValue); animation.callback({ finished: true }); });
};
async function mount(t, expanded = false) {
  reduced = false; animations.length = 0;
  let renderer;
  await act(async () => { renderer = create(section(expanded)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}

test('an interrupted close cannot remove a reopened section, and closed controls stop receiving interaction', async (t) => {
  const renderer = await mount(t);
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
  await act(async () => renderer.update(section(true)));
  await measure(renderer, 240);
  await finish(animations.at(-1));
  await act(async () => renderer.update(section(false)));
  const closing = animations.at(-1);
  const body = renderer.root.findByType('AnimatedView');
  assert.equal(body.props.pointerEvents, 'none');
  assert.equal(body.props.accessibilityElementsHidden, true);
  assert.equal(body.props.importantForAccessibility, 'no-hide-descendants');
  await act(async () => renderer.update(section(true)));
  const reopening = animations.at(-1);
  await finish(closing);
  assert.equal(renderer.root.findByType('TextInput').props.value, '残しておきたいメモ');
  await finish(reopening);
  assert.equal(renderer.root.findByType('AnimatedView').props.pointerEvents, 'auto');
  await act(async () => renderer.update(section(false)));
  await finish(animations.at(-1));
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
});

test('a content size change during opening supersedes the old completion and restores natural height', async (t) => {
  const renderer = await mount(t);
  await act(async () => renderer.update(section(true)));
  await measure(renderer, 200);
  const initial = animations.at(-1);
  await measure(renderer, 320);
  const resized = animations.at(-1);
  await finish(initial);
  assert.ok(renderer.root.findByType('AnimatedView').props.style[1].height, 'older completion must not release the active height');
  await finish(resized);
  assert.equal(renderer.root.findByType('AnimatedView').props.style[1], false, 'expanded content must not stay at a fixed height');
  const completed = animations.length;
  await measure(renderer, 450);
  assert.equal(animations.length, completed, 'subsequent form changes follow normal layout');
});

test('enabling reduced motion during a transition settles immediately and ignores stale callbacks', async (t) => {
  const renderer = await mount(t);
  await act(async () => renderer.update(section(true)));
  await measure(renderer, 240);
  const opening = animations.at(-1);
  reduced = true;
  await act(async () => renderer.update(section(true)));
  assert.equal(renderer.root.findByType('AnimatedView').props.style[1], false);
  const count = animations.length;
  await act(async () => renderer.update(section(false)));
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
  await finish(opening);
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
  await act(async () => renderer.update(section(true)));
  assert.equal(renderer.root.findByType('TextInput').props.value, '残しておきたいメモ');
  assert.equal(animations.length, count);
});
