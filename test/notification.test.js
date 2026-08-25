const test = require('node:test');
const assert = require('node:assert');
const { loadGasProject } = require('./gas-project.js');

/** テスト用の PubMed 論文を作ります。 */
function pubmedPaper(overrides) {
  return Object.assign({
    title: 'Sample article',
    authors: 'Yamada T, Suzuki H, Tanaka K',
    abstract: 'abstract text',
    summarizedAbstract: '',
    japaneseAbstract: '',
    journal: 'Journal of Cell Biology',
    impactFactor: 7.4,
    impactFactor5Years: 8.1,
    matchedJournal: '',
    url: 'https://pubmed.ncbi.nlm.nih.gov/1/',
    category: 'PubMed',
  }, overrides || {});
}

test('meetsImpactFactorThreshold は 5 年 JIF だけが基準を満たす場合も通す', () => {
  const { context } = loadGasProject();
  const config = context.getConfig();
  assert.strictEqual(
    context.meetsImpactFactorThreshold(pubmedPaper({ impactFactor: 3.0, impactFactor5Years: 5.0 }), config),
    true
  );
  assert.strictEqual(
    context.meetsImpactFactorThreshold(pubmedPaper({ impactFactor: 3.0, impactFactor5Years: 3.5 }), config),
    false
  );
});

test('meetsImpactFactorThreshold はプレプリントを常に通す', () => {
  const { context } = loadGasProject();
  const config = context.getConfig();
  const preprint = { category: 'BioRxiv', impactFactor: 0, impactFactor5Years: 0 };
  assert.strictEqual(context.meetsImpactFactorThreshold(preprint, config), true);
});

test('meetsImpactFactorThreshold は IF 不明の論文を設定に従って扱う', () => {
  const unknown = { category: 'PubMed', impactFactor: 0, impactFactor5Years: 0 };

  const permissive = loadGasProject({ skipPapersWithUnknownImpactFactor: false });
  assert.strictEqual(
    permissive.context.meetsImpactFactorThreshold(unknown, permissive.context.getConfig()),
    true
  );

  const strict = loadGasProject({ skipPapersWithUnknownImpactFactor: true });
  assert.strictEqual(
    strict.context.meetsImpactFactorThreshold(unknown, strict.context.getConfig()),
    false
  );
});

test('formatAuthors は 3 名以上を筆頭著者と最終著者に短縮する', () => {
  const { context } = loadGasProject();
  assert.strictEqual(
    context.formatAuthors('Yamada T, Suzuki H, Tanaka K'),
    'Yamada T et al.（最終著者: Tanaka K）'
  );
  assert.strictEqual(context.formatAuthors('Yamada T, Suzuki H'), 'Yamada T, Suzuki H');
  assert.strictEqual(context.formatAuthors(''), '不明');
});

test('formatImpactFactor は値の有無に応じて表示を変える', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.formatImpactFactor({ impactFactor: 7.4, impactFactor5Years: 8.1 }), '7.4（5年 8.1）');
  assert.strictEqual(context.formatImpactFactor({ impactFactor: 7.4, impactFactor5Years: 0 }), '7.4');
  assert.strictEqual(context.formatImpactFactor({ impactFactor: 0, impactFactor5Years: 0 }), '不明');
});

test('truncateText は上限を超えた文字列だけを切り詰める', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.truncateText('abcdef', 3), 'abc…');
  assert.strictEqual(context.truncateText('abc', 10), 'abc');
});

test('buildNotificationParts は IF の高い順に並べる', () => {
  const { context } = loadGasProject();
  const config = context.getConfig();
  const parts = context.buildNotificationParts('Golgi', [
    pubmedPaper({ title: 'Low', impactFactor: 4.5, impactFactor5Years: 4.5, url: 'u1' }),
    pubmedPaper({ title: 'High', impactFactor: 21.0, impactFactor5Years: 22.0, url: 'u2' }),
  ], config, '2024/06/26');

  assert.ok(parts.blocks[0].indexOf('High') >= 0);
  assert.ok(parts.blocks[1].indexOf('Low') >= 0);
  assert.ok(parts.header.indexOf('PubMed 2 件') >= 0);
});

test('buildNotificationParts は対象が無ければ null を返す', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.buildNotificationParts('Golgi', [], context.getConfig(), '2024/06/26'), null);
});

test('buildNotificationParts は掲載上限を超えた分を省略して知らせる', () => {
  const { context } = loadGasProject({ notificationFormat: { maxPapersPerKeyword: 1 } });
  const config = context.getConfig();
  const parts = context.buildNotificationParts('Golgi', [
    pubmedPaper({ url: 'u1' }),
    pubmedPaper({ url: 'u2' }),
  ], config, '2024/06/26');

  assert.strictEqual(parts.blocks.length, 1);
  assert.ok(parts.header.indexOf('1 件を省略') >= 0);
});

test('buildPaperBlock は英語要約の設定が有効なときだけ要約を載せる', () => {
  const withSummary = loadGasProject({
    notificationFormat: { includeSummarizedAbstract: true },
  });
  const block = withSummary.context.buildPaperBlock(
    pubmedPaper({ summarizedAbstract: 'A concise summary.' }),
    1,
    withSummary.context.getConfig()
  );
  assert.ok(block.indexOf('要約: A concise summary.') >= 0);

  const withoutSummary = loadGasProject();
  const plainBlock = withoutSummary.context.buildPaperBlock(
    pubmedPaper({ summarizedAbstract: 'A concise summary.' }),
    1,
    withoutSummary.context.getConfig()
  );
  assert.strictEqual(plainBlock.indexOf('A concise summary.'), -1);
});

test('splitIntoMessages は上限内なら 1 通にまとめ、区切り線を残す', () => {
  const { context } = loadGasProject();
  const messages = context.splitIntoMessages('見出し\n', ['本文1\n----\n', '本文2\n----\n'], 1000);
  assert.strictEqual(messages.length, 1);
  assert.ok(messages[0].indexOf('----') >= 0);
  assert.ok(messages[0].indexOf('本文1') >= 0 && messages[0].indexOf('本文2') >= 0);
});

test('splitIntoMessages は上限を超えると分割してページ番号を付ける', () => {
  const { context } = loadGasProject();
  const block = 'x'.repeat(40) + '\n';
  const messages = context.splitIntoMessages('見出し\n', [block, block, block], 60);
  assert.ok(messages.length > 1);
  assert.ok(messages[0].indexOf('(1/' + messages.length + ')') === 0);
  // すべてのメッセージが上限に収まっている
  messages.forEach((message) => assert.ok(message.length <= 60, '長さ ' + message.length));
});

test('splitIntoMessages は 1 件で上限を超える論文も分割できる', () => {
  const { context } = loadGasProject();
  const huge = 'y'.repeat(500);
  const messages = context.splitIntoMessages('見出し\n', [huge], 100);
  assert.ok(messages.length >= 5);
  messages.forEach((message) => assert.ok(message.length <= 100));
  // 内容が失われていない
  const restored = messages.map((m) => m.replace(/^\(\d+\/\d+\)\n/, '')).join('');
  assert.ok(restored.indexOf(huge) >= 0);
});

test('isValidSlackWebhookUrl は未設定の雛形を弾く', () => {
  const { context } = loadGasProject();
  assert.strictEqual(context.isValidSlackWebhookUrl('https://hooks.slack.com/services/T0/B0/xxx'), true);
  assert.strictEqual(context.isValidSlackWebhookUrl('YOUR_SLACK_WEBHOOK_URL'), false);
  assert.strictEqual(context.isValidSlackWebhookUrl(''), false);
  assert.strictEqual(context.isValidSlackWebhookUrl('https://example.com/hook'), false);
});

test('formatForSlack は制御文字をエスケープし見出しを太字にする', () => {
  const { context } = loadGasProject();
  const formatted = context.formatForSlack('■ PubMed\np53 <regulates> A & B\n');
  assert.ok(formatted.indexOf('*■ PubMed*') >= 0);
  assert.ok(formatted.indexOf('&lt;regulates&gt;') >= 0);
  assert.ok(formatted.indexOf('A &amp; B') >= 0);
});

test('resolveNotificationKeywords は重複通知の設定に従う', () => {
  const paper = { matchedKeywords: ['Golgi', 'Microtubule'], title: '', abstract: '' };

  const deduped = loadGasProject({ deduplicateAcrossKeywords: true });
  assert.deepStrictEqual(
    deduped.context.resolveNotificationKeywords(paper, deduped.context.getConfig()),
    ['Golgi']
  );

  const all = loadGasProject({ deduplicateAcrossKeywords: false });
  assert.deepStrictEqual(
    all.context.resolveNotificationKeywords(paper, all.context.getConfig()),
    ['Golgi', 'Microtubule']
  );
});

test('resolveNotificationKeywords は記録が無い行を本文から判定する', () => {
  const { context } = loadGasProject({ deduplicateAcrossKeywords: false });
  const paper = { matchedKeywords: [], title: 'Microtubule dynamics', abstract: '' };
  assert.deepStrictEqual(
    context.resolveNotificationKeywords(paper, context.getConfig()),
    ['Microtubule']
  );
});

test('splitIntoMessages は見出しだけで上限を超える場合も分割できる', () => {
  const { context } = loadGasProject();
  const longHeader = 'h'.repeat(300);
  const messages = context.splitIntoMessages(longHeader, [], 100);
  assert.ok(messages.length >= 3);
  messages.forEach((message) => assert.ok(message.length <= 100));
});
