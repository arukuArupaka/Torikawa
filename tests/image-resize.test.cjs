require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const platform = { OS: 'ios' };
let dimensions, failure, resultOverride, requests, released;
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === 'react-native') return { Platform: platform };
  if (request === 'expo-image-manipulator') return {
    SaveFormat: { JPEG: 'jpeg' },
    ImageManipulator: { manipulate(uri) {
      requests.push(['manipulate', uri]);
      if (failure === 'load') throw Error('decoder failed');
      const image = {
        uri: platform.OS === 'web' ? 'blob:intermediate' : undefined,
        async saveAsync(options) {
          requests.push(['save', options]);
          if (failure === 'save') throw Error('encoder failed');
          return resultOverride ?? { uri: platform.OS === 'web' ? 'blob:resized' : 'file:///cache/resized.jpg',
            ...dimensions, ...(options.base64 ? { base64: 'anBlZw==' } : {}) };
        },
        release() { released.push('image'); },
      };
      return {
        resize(size) {
          requests.push(['resize', size]);
          const ratio = dimensions.width / dimensions.height;
          dimensions = size.width ? { width: size.width, height: Math.round(size.width / ratio) }
            : { width: Math.round(size.height * ratio), height: size.height };
        },
        async renderAsync() { if (failure === 'render') throw Error('render failed'); return image; },
        release() { released.push('context'); },
      };
    } },
  };
  return originalLoad.call(this, request, ...args);
};
const { resizeImage } = require('../src/services/imageResize.ts');
function reset(width = 1600, height = 1200) {
  dimensions = { width, height }; failure = null; resultOverride = null; requests = []; released = []; platform.OS = 'ios';
  return { uri: 'file:///original.jpg', width, height };
}

test('resize uses SDK 57 context API, bounds the longer edge, keeps aspect ratio and saves JPEG at quality 0.7', async () => {
  for (const [width, height, expectedAction, expectedWidth, expectedHeight] of [
    [1600, 1200, { width: 800 }, 800, 600], [1200, 1600, { height: 800 }, 600, 800], [2000, 2000, { width: 800 }, 800, 800],
  ]) {
    const input = reset(width, height);
    const result = await resizeImage(input);
    assert.deepEqual(requests, [['manipulate', input.uri], ['resize', expectedAction], ['save', { format: 'jpeg', compress: 0.7, base64: false }]]);
    assert.equal(result.width, expectedWidth); assert.equal(result.height, expectedHeight);
    assert.equal(result.uri, 'file:///cache/resized.jpg');
    assert.deepEqual(released, ['image', 'context']);
    assert.deepEqual(input, { uri: 'file:///original.jpg', width, height });
  }
});

test('photos already within 800 pixels are JPEG encoded without being enlarged', async () => {
  for (const [width, height] of [[320, 240], [240, 320], [800, 600], [600, 800], [1, 1]]) {
    const input = reset(width, height);
    const result = await resizeImage(input);
    assert.equal(requests.some(([name]) => name === 'resize'), false);
    assert.equal(result.width, width); assert.equal(result.height, height);
    assert.deepEqual(requests.at(-1), ['save', { format: 'jpeg', compress: 0.7, base64: false }]);
  }
});

test('Web returns the resized JPEG base64 and releases the intermediate object URL, preserving the result for the caller', async (t) => {
  const input = reset(); platform.OS = 'web'; input.uri = 'blob:original';
  const revoked = []; t.mock.method(URL, 'revokeObjectURL', uri => revoked.push(uri));
  const result = await resizeImage(input);
  assert.equal(result.base64, 'anBlZw=='); assert.equal(result.uri, 'blob:resized');
  assert.deepEqual(requests.at(-1), ['save', { format: 'jpeg', compress: 0.7, base64: true }]);
  assert.deepEqual(revoked, ['blob:intermediate']);
  assert.deepEqual(released, ['image', 'context']);
});

test('decode, render and encode failures are Japanese errors with no original-image fallback and release allocated resources', async () => {
  for (const stage of ['load', 'render', 'save']) {
    const input = reset(); failure = stage;
    await assert.rejects(resizeImage(input), /写真を縮小できませんでした/);
    assert.deepEqual(released, stage === 'load' ? [] : stage === 'render' ? ['context'] : ['image', 'context']);
  }
});

test('invalid dimensions and unusable or oversized results fail instead of passing the source photo through', async () => {
  for (const invalid of [{ width: 0 }, { height: NaN }, { width: Infinity }, { uri: '' }]) {
    const input = { ...reset(), ...invalid };
    await assert.rejects(resizeImage(input), /写真を縮小できませんでした/);
    assert.equal(requests.length, 0);
  }
  for (const output of [{ width: 1600 }, { height: 0 }, { width: NaN }, { uri: '' }, { uri: 'content:original' }]) {
    const input = reset(); resultOverride = { uri: 'file:///cache/resize.jpg', width: 800, height: 600, ...output };
    await assert.rejects(resizeImage(input), /写真を縮小できませんでした/);
    assert.deepEqual(released, ['image', 'context']);
  }
});
