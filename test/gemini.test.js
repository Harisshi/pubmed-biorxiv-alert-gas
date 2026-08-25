const test = require('node:test');
const assert = require('node:assert');
const { loadGasProject } = require('./gas-project.js');

test('extractGeminiText は生成されたテキストを取り出す', () => {
  const { context } = loadGasProject();
  const text = context.extractGeminiText({
    candidates: [{ content: { parts: [{ text: '要約その1 ' }, { text: '要約その2' }] } }],
  });
  assert.strictEqual(text, '要約その1 要約その2');
});

test('extractGeminiText は候補が無い場合に空文字列を返す', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.extractGeminiText({}), '');
  assert.strictEqual(context.extractGeminiText({ candidates: [] }), '');
  assert.strictEqual(context.extractGeminiText(null), '');
  assert.strictEqual(context.extractGeminiText({ candidates: [{ content: {} }] }), '');
});

test('extractGeminiText はブロックされた応答を記録して空文字列を返す', () => {
  const { context, logs } = loadGasProject();
  assert.strictEqual(context.extractGeminiText({ promptFeedback: { blockReason: 'SAFETY' } }), '');
  assert.ok(logs.some((line) => line.indexOf('SAFETY') >= 0));
});
