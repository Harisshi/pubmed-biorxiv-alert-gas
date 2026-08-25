const test = require('node:test');
const assert = require('node:assert');
const { loadGasProject } = require('./gas-project.js');

test('resolveSearchRange は 1d 指定で 1 日前からの範囲を返す', () => {
  const { context } = loadGasProject();
  const now = new Date(2024, 5, 26, 9, 0, 0);
  const range = context.resolveSearchRange({ searchPeriod: '1d' }, now);
  assert.strictEqual(context.formatDateForApi(range.startDate, '-'), '2024-06-25');
  assert.strictEqual(context.formatDateForApi(range.endDate, '-'), '2024-06-26');
});

test('resolveSearchRange は 7d と 1y を正しく扱う', () => {
  const { context } = loadGasProject();
  const now = new Date(2024, 5, 26);
  assert.strictEqual(
    context.formatDateForApi(context.resolveSearchRange({ searchPeriod: '7d' }, now).startDate, '-'),
    '2024-06-19'
  );
  assert.strictEqual(
    context.formatDateForApi(context.resolveSearchRange({ searchPeriod: '1y' }, now).startDate, '-'),
    '2023-06-26'
  );
});

test('resolveSearchRange は未知の期間指定を 1 日として扱う', () => {
  const { context } = loadGasProject();
  const now = new Date(2024, 5, 26);
  const range = context.resolveSearchRange({ searchPeriod: '2w' }, now);
  assert.strictEqual(context.formatDateForApi(range.startDate, '-'), '2024-06-25');
});

test('resolveSearchRange は custom 指定で設定値をそのまま使う', () => {
  const { context } = loadGasProject();
  const range = context.resolveSearchRange({
    searchPeriod: 'custom',
    customStartDate: '2024-06-19',
    customEndDate: '2024-06-26',
  }, new Date(2025, 0, 1));
  assert.strictEqual(context.formatDateForApi(range.startDate, '-'), '2024-06-19');
  assert.strictEqual(context.formatDateForApi(range.endDate, '-'), '2024-06-26');
});

test('parseDateString はタイムゾーンによる日付のずれを起こさない', () => {
  const { context } = loadGasProject();
  const date = context.parseDateString('2024-06-19');
  assert.strictEqual(date.getFullYear(), 2024);
  assert.strictEqual(date.getMonth(), 5);
  assert.strictEqual(date.getDate(), 19);
});

test('matchesKeyword はタイトルと要旨を大文字小文字を区別せずに調べる', () => {
  const { context } = loadGasProject();
  const paper = { title: 'GOLGI apparatus dynamics', abstract: 'about microtubules' };
  assert.strictEqual(context.matchesKeyword(paper, 'golgi'), true);
  assert.strictEqual(context.matchesKeyword(paper, 'Microtubule'), true);
  assert.strictEqual(context.matchesKeyword(paper, 'senescence'), false);
  assert.strictEqual(context.matchesKeyword({}, 'golgi'), false);
});

test('dedupePapers は同じ URL の論文を 1 件にまとめ、キーワードを統合する', () => {
  const { context } = loadGasProject();
  const deduped = context.dedupePapers([
    { url: 'https://example.com/1', title: 'A', matchedKeywords: ['Golgi'] },
    { url: 'https://example.com/1', title: 'A', matchedKeywords: ['Microtubule'] },
    { url: 'https://example.com/2', title: 'B', matchedKeywords: ['Golgi'] },
  ]);
  assert.strictEqual(deduped.length, 2);
  assert.deepStrictEqual(deduped[0].matchedKeywords, ['Golgi', 'Microtubule']);
});

test('dedupePapers は URL の無い論文を除外する', () => {
  const { context } = loadGasProject();
  const deduped = context.dedupePapers([{ url: '', matchedKeywords: ['Golgi'] }]);
  assert.strictEqual(deduped.length, 0);
});

test('buildQueryString は空の値を除いて URL エンコードする', () => {
  const { context } = loadGasProject();
  const query = context.buildQueryString({ term: 'cell biology', retmax: 100, email: '' });
  assert.strictEqual(query, 'term=cell%20biology&retmax=100');
});
