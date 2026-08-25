const test = require('node:test');
const assert = require('node:assert');
const { loadGasProject } = require('./gas-project.js');

const CSV = [
  ['Name', 'Abbr Name', 'JIF', 'JIF5Years'],
  ['JOURNAL OF CELL BIOLOGY', 'J CELL BIOL', '7.4', '8.1'],
  ['Nature Cell Biology', 'NAT CELL BIOL', '21.3', '24.0'],
  ['Journal of Cell Science', 'J CELL SCI', '4.0', '4.5'],
  ['Small Journal', 'SMALL J', 'N/A', ''],
];

test('findColumnIndex は列名の表記ゆれに対応する', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.findColumnIndex(['Journal name', 'IF'], ['Name', 'Journal name']), 0);
  assert.strictEqual(context.findColumnIndex(['Name', 'JIF'], ['JIF', 'IF']), 1);
  assert.strictEqual(context.findColumnIndex(['Name'], ['Missing']), -1);
});

test('parseImpactFactorValue は数値以外を 0 として扱う', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.parseImpactFactorValue('7.4'), 7.4);
  assert.strictEqual(context.parseImpactFactorValue('<0.1'), 0.1);
  assert.strictEqual(context.parseImpactFactorValue('1,234'), 1234);
  assert.strictEqual(context.parseImpactFactorValue('N/A'), 0);
  assert.strictEqual(context.parseImpactFactorValue(''), 0);
  assert.strictEqual(context.parseImpactFactorValue(undefined), 0);
});

test('normalizeJournalName は記号と大文字小文字の差を吸収する', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.normalizeJournalName('Journal of Cell Biology'), 'journalofcellbiology');
  assert.strictEqual(context.normalizeJournalName('J. Cell Biol.'), 'jcellbiol');
  assert.strictEqual(context.normalizeJournalName('Cell & Tissue Research'), 'cellandtissueresearch');
  assert.strictEqual(context.normalizeJournalName(''), '');
});

test('buildImpactFactorIndex は正式名称と略称の索引を作る', () => {
  const { context } = loadGasProject();
  const index = context.buildImpactFactorIndex(CSV);
  assert.strictEqual(index.entries.length, 4);
  assert.strictEqual(index.byName['journalofcellbiology'].jif, 7.4);
  assert.strictEqual(index.byAbbreviation['jcellbiol'].jif5Years, 8.1);
  // JIF が数値でない行も 0 として登録される
  assert.strictEqual(index.byName['smalljournal'].jif, 0);
});

test('buildImpactFactorIndex は Name 列が無い CSV を例外にする', () => {
  const { context } = loadGasProject();
  assert.throws(
    () => context.buildImpactFactorIndex([['Journal', 'Value'], ['A', '1']]),
    /必要な列が見つかりません/
  );
});

test('levenshteinDistance は上限を超えた時点で打ち切る', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.levenshteinDistance('kitten', 'sitting', 10), 3);
  assert.strictEqual(context.levenshteinDistance('abc', 'abc', 5), 0);
  // 上限 1 では距離 3 を求めきらず、打ち切り値を返す
  assert.strictEqual(context.levenshteinDistance('kitten', 'sitting', 1), 2);
});

test('similarityRatio は完全一致で 1、無関係な文字列で低い値を返す', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.similarityRatio('abc', 'abc'), 1);
  assert.ok(context.similarityRatio('journalofcellbiology', 'journalofcellbiolog') > 0.9);
  assert.strictEqual(context.similarityRatio('abc', ''), 0);
});

test('findApproximateMatch_ は綴りの揺れを拾い、別の雑誌には一致しない', () => {
  const { context } = loadGasProject();
  const index = context.buildImpactFactorIndex(CSV);

  // 末尾が 1 文字欠けただけの表記は同じ雑誌として拾う
  const matched = context.findApproximateMatch_('journalofcellbiolog', index, 0.9);
  assert.ok(matched);
  assert.strictEqual(matched.name, 'JOURNAL OF CELL BIOLOGY');

  // 名前の似た別の雑誌には一致させない
  const notMatched = context.findApproximateMatch_('journalofcellscience', index, 0.9);
  assert.strictEqual(notMatched && notMatched.name, 'Journal of Cell Science');
  assert.notStrictEqual(notMatched && notMatched.name, 'JOURNAL OF CELL BIOLOGY');
});
