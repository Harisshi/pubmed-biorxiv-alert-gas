const test = require('node:test');
const assert = require('node:assert');
const { loadGasProject } = require('./gas-project.js');

test('mergeConfig_ は入れ子のオブジェクトをキー単位で統合する', () => {
  const { context } = loadGasProject();
  const merged = context.mergeConfig_(
    { a: 1, notificationFormat: { includeAbstract: false, maxPapersPerKeyword: 30 } },
    { notificationFormat: { includeAbstract: true } }
  );
  assert.strictEqual(merged.a, 1);
  assert.strictEqual(merged.notificationFormat.includeAbstract, true);
  // 指定しなかったキーは既定値のまま残る
  assert.strictEqual(merged.notificationFormat.maxPapersPerKeyword, 30);
});

test('mergeConfig_ は配列を丸ごと置き換える', () => {
  const { context } = loadGasProject();
  const merged = context.mergeConfig_({ keywords: ['a', 'b'] }, { keywords: ['c'] });
  assert.deepStrictEqual(merged.keywords, ['c']);
});

test('getConfig は UserConfig の値を既定値に重ねる', () => {
  const { context } = loadGasProject({ minImpactFactor: 12.5 });
  const config = context.getConfig();
  assert.strictEqual(config.minImpactFactor, 12.5);
  assert.strictEqual(config.pubmedDateType, 'edat');
  assert.strictEqual(config.maxResultsPerKeyword, 100);
});

test('isValidDateString_ は実在しない日付を拒否する', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.isValidDateString_('2024-06-19'), true);
  assert.strictEqual(context.isValidDateString_('2024-02-30'), false);
  assert.strictEqual(context.isValidDateString_('2024-13-01'), false);
  assert.strictEqual(context.isValidDateString_('2024/06/19'), false);
  assert.strictEqual(context.isValidDateString_(''), false);
});

test('validateConfiguration は未設定のスクリプトプロパティを検出する', () => {
  const { context } = loadGasProject({ notificationMethods: ['line'] });
  const result = context.validateConfiguration();
  // テストではスクリプトプロパティが空なので、必須項目がエラーになる
  assert.ok(result.errors.some((message) => message.indexOf('SPREADSHEET_ID') >= 0));
  assert.ok(result.errors.some((message) => message.indexOf('LINE_CHANNEL_ACCESS_TOKEN') >= 0));
});

test('validateConfiguration は不正な検索期間を検出する', () => {
  const { context } = loadGasProject({ searchPeriod: '2w' });
  const result = context.validateConfiguration();
  assert.ok(result.errors.some((message) => message.indexOf('searchPeriod') >= 0));
});

test('validateConfiguration は custom 指定時に日付形式を検証する', () => {
  const { context } = loadGasProject({
    searchPeriod: 'custom',
    customStartDate: '2024/06/19',
    customEndDate: '2024-06-26',
  });
  const result = context.validateConfiguration();
  assert.ok(result.errors.some((message) => message.indexOf('customStartDate') >= 0));
});
