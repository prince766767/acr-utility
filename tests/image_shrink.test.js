import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, shrinkImage, MAX_SIDE } from '../image_shrink.js';

test('fitSize: long side at most 1700, never enlarged, proportions kept', () => {
  assert.equal(MAX_SIDE, 1700);
  assert.deepEqual(fitSize(4000, 3000), { width: 1700, height: 1275 });
  assert.deepEqual(fitSize(3000, 4000), { width: 1275, height: 1700 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(10000, 3), { width: 1700, height: 1 });
});

function fakeEnv({ bitmap, blob = new Blob(['jpeg']), fail = false }) {
  const log = [];
  const ctx = { fillStyle: '', fillRect: (...a) => log.push(['fillRect', ...a]), drawImage: (b, ...a) => log.push(['drawImage', ...a]) };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb, type, q) => { log.push(['toBlob', type, q]); cb(blob); } };
  return {
    log, canvas,
    env: {
      createImageBitmap: async (file, opts) => { log.push(['bitmap', opts]); if (fail) throw new Error('bad'); return bitmap; },
      document: { createElement: tag => { assert.equal(tag, 'canvas'); return canvas; } },
    },
  };
}

test('shrinkImage: upright, resized, white background, JPEG 0.85', async () => {
  const bitmap = { width: 3400, height: 1700, close() {} };
  const { env, log, canvas } = fakeEnv({ bitmap });
  const out = await shrinkImage(new Blob(['x']), env);
  assert.ok(out instanceof Blob);
  assert.deepEqual(log[0], ['bitmap', { imageOrientation: 'from-image' }]);
  assert.equal(canvas.width, 1700);
  assert.equal(canvas.height, 850);
  assert.deepEqual(log.find(l => l[0] === 'drawImage'), ['drawImage', 0, 0, 1700, 850]);
  assert.deepEqual(log.find(l => l[0] === 'toBlob'), ['toBlob', 'image/jpeg', 0.85]);
});

test('shrinkImage: null when the photo cannot be read or encoded', async () => {
  assert.equal(await shrinkImage(new Blob(['x']), fakeEnv({ fail: true }).env), null);
  assert.equal(await shrinkImage(new Blob(['x']), fakeEnv({ bitmap: { width: 10, height: 10 }, blob: null }).env), null);
});
