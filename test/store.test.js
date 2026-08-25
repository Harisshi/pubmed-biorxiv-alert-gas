const test = require('node:test');
const assert = require('node:assert');
const { loadGasProject } = require('./gas-project.js');

test('recordToRow はシートの実際の列順に合わせて値を並べる', () => {
  const { context } = loadGasProject();
  const record = { Title: 'A', URL: 'https://example.com', ImpactFactor: 7.4 };

  // 列順が入れ替わっていても正しく並ぶ
  assert.deepStrictEqual(
    context.recordToRow(record, ['URL', 'Title', 'ImpactFactor']),
    ['https://example.com', 'A', 7.4]
  );

  // レコードに無い列は空文字列になる
  assert.deepStrictEqual(
    context.recordToRow(record, ['Title', 'Journal']),
    ['A', '']
  );
});

test('toNumber は空欄や文字列を 0 として扱う', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.toNumber(7.4), 7.4);
  assert.strictEqual(context.toNumber('7.4'), 7.4);
  assert.strictEqual(context.toNumber(''), 0);
  assert.strictEqual(context.toNumber('N/A'), 0);
  assert.strictEqual(context.toNumber(null), 0);
  assert.strictEqual(context.toNumber(undefined), 0);
});

test('MatchedKeywords 列は書き出しと読み出しで往復できる', () => {
  const { context } = loadGasProject();
  const keywords = ['Golgi', 'Cellular senescence'];
  const stored = context.formatMatchedKeywords(keywords);
  assert.strictEqual(stored, 'Golgi; Cellular senescence');
  // vm 内で生成された配列はプロトタイプが異なるため、値の比較に揃える
  assert.deepStrictEqual(Array.from(context.parseMatchedKeywords(stored)), keywords);
});

test('parseMatchedKeywords は空欄を空配列にする', () => {
  const { context } = loadGasProject();
  assert.deepStrictEqual(Array.from(context.parseMatchedKeywords('')), []);
  assert.deepStrictEqual(Array.from(context.parseMatchedKeywords(null)), []);
  assert.deepStrictEqual(Array.from(context.parseMatchedKeywords('  ;  ')), []);
});
