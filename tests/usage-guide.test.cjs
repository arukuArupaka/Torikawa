require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { act, create } = require('react-test-renderer');
const Module = require('node:module');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const platform = { OS: 'ios' };
const original = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Platform: platform,
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' };
  if (request === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (request.startsWith('../components/')) {
    const name = request.split('/').at(-1);
    if (name === 'AnimatedDisclosure') return { AnimatedDisclosure: props => React.createElement(name, props,
      props.header, props.expanded ? props.children : null) };
    return { [name]: props => React.createElement(name, props, props.children) };
  }
  return original.call(this, request, ...args);
};
const { UsageGuideScreen } = require('../src/screens/UsageGuideScreen.tsx');
const visibleText = renderer => renderer.root.findAllByType('Text')
  .map(node => [node.props.children].flat().join('')).join('\n');
const topic = (renderer, label) => renderer.root.findByProps({ accessibilityLabel: label });
const pressTopic = async (renderer, label) => {
  await act(async () => topic(renderer, label).props.onPress());
};
async function renderGuide(t, os = 'ios') {
  platform.OS = os;
  let renderer, backCount = 0;
  await act(async () => { renderer = create(React.createElement(UsageGuideScreen,
    { navigation: { goBack: () => { backCount++; } } })); });
  t.after(async () => { await act(async () => renderer.unmount()); platform.OS = 'ios'; });
  return { renderer, backCount: () => backCount };
}

test('usage guide starts with registration and exposes all eight accessible topic controls', async t => {
  const { renderer } = await renderGuide(t);
  const buttons = renderer.root.findAllByType('Pressable');
  assert.equal(buttons.length, 8);
  assert.ok(buttons.every(node => node.props.accessibilityRole === 'button'));
  assert.equal(buttons.filter(node => node.props.accessibilityState.expanded).length, 1);
  assert.equal(topic(renderer, '食材を登録する').props.accessibilityState.expanded, true);
  assert.match(visibleText(renderer), /「保存する」を押します/);
  assert.match(visibleText(renderer), /写真・カテゴリ・購入日・メモを編集/);
  assert.doesNotMatch(visibleText(renderer), /復元すると現在のデータが置き換わります/);
});

test('opening a topic replaces the previous instructions and pressing it again closes it', async t => {
  const { renderer } = await renderGuide(t);
  await pressTopic(renderer, 'バーコードで登録する');
  assert.equal(topic(renderer, '食材を登録する').props.accessibilityState.expanded, false);
  assert.equal(topic(renderer, 'バーコードで登録する').props.accessibilityState.expanded, true);
  assert.doesNotMatch(visibleText(renderer), /写真・カテゴリ・購入日・メモを編集/);
  assert.match(visibleText(renderer), /検索しただけでは在庫に追加されません/);
  assert.match(visibleText(renderer), /見つからない場合は、食材名を手入力/);
  await pressTopic(renderer, 'バーコードで登録する');
  assert.equal(topic(renderer, 'バーコードで登録する').props.accessibilityState.expanded, false);
  assert.doesNotMatch(visibleText(renderer), /検索しただけでは在庫に追加されません/);
  await pressTopic(renderer, 'バーコードで登録する');
  assert.match(visibleText(renderer), /「読み直す」で読み取り画面へ戻れます/);

  for (const [label, instruction] of [
    ['食材と期限を確認する', /すべての食材に戻す/],
    ['残量・使い切り・廃棄を記録する', /左スワイプが使い切り、右スワイプが廃棄/],
    ['レシピを探す・作った分を記録する', /材料の種類がそろっていても、分量が足りるとは限りません/],
    ['買い物リストを使う', /買い物のチェックだけでは在庫に追加されません/],
  ]) {
    await pressTopic(renderer, label);
    assert.match(visibleText(renderer), instruction);
    assert.equal(renderer.root.findAllByType('Pressable')
      .filter(node => node.props.accessibilityState.expanded).length, 1);
  }
});

test('Web usage guide explains that notifications are unavailable without native controls', async t => {
  const { renderer } = await renderGuide(t, 'web');
  await pressTopic(renderer, '期限通知を設定する');
  assert.match(visibleText(renderer), /Web版では期限通知を利用できません/);
  assert.match(visibleText(renderer), /ホームやカレンダーで期限を確認/);
  assert.doesNotMatch(visibleText(renderer), /3秒後にテスト通知|通知設定を保存|直近60件/);
});

test('iOS and Android usage guide describes notification permission, saving and the reservation limit', async t => {
  for (const os of ['ios', 'android']) {
    const { renderer } = await renderGuide(t, os);
    await pressTopic(renderer, '期限通知を設定する');
    assert.match(visibleText(renderer), /通知の許可/);
    assert.match(visibleText(renderer), /「通知設定を保存」/);
    assert.match(visibleText(renderer), /3秒後にテスト通知/);
    assert.match(visibleText(renderer), /直近60件まで/);
    assert.match(visibleText(renderer), /アプリを開かない間の自動補充は行いません/);
    assert.doesNotMatch(visibleText(renderer), /Web版では期限通知を利用できません/);
  }
});

test('backup guide explains replacement and local data, and the back button returns to Settings', async t => {
  const { renderer, backCount } = await renderGuide(t);
  await pressTopic(renderer, 'バックアップ・機種変更');
  assert.match(visibleText(renderer), /バックアップを書き出す/);
  assert.match(visibleText(renderer), /バックアップから復元/);
  assert.match(visibleText(renderer), /復元すると現在のデータが置き換わります。先に現在のバックアップを保存/);
  assert.match(visibleText(renderer), /別端末への自動同期はありません/);
  assert.match(visibleText(renderer), /URLが変わる前にも書き出して/);
  assert.match(visibleText(renderer), /ファイルには在庫・メモ・写真などが含まれます/);
  await act(async () => renderer.root.findByType('ScreenHeader').props.onBack());
  assert.equal(backCount(), 1);
});
