const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BUNDLE_PATH = path.join(__dirname, '..', 'dist', 'Code.js');

/**
 * dist/Code.js は src/ を連結した「コピペ用」の成果物です。
 * 分割版と同じように動くことを確認します。
 */
test('dist/Code.js は単体で読み込めて分割版と同じ関数を提供する', () => {
  const context = {
    console,
    Logger: { log: () => {} },
    Utilities: { formatDate: () => '', sleep: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({}) }) },
    UrlFetchApp: {}, SpreadsheetApp: {}, DriveApp: {}, MailApp: {}, ScriptApp: {}, XmlService: {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(BUNDLE_PATH, 'utf8'), context, { filename: 'dist/Code.js' });

  // 連結版でも設定が読め、代表的な純粋関数が動作する
  const config = context.getConfig();
  assert.ok(Array.isArray(config.searchKeywords));
  assert.strictEqual(context.normalizeJournalName('J. Cell Biol.'), 'jcellbiol');
  assert.strictEqual(context.formatAuthors('A B, C D, E F'), 'A B et al.（最終著者: E F）');
  assert.strictEqual(context.isValidSlackWebhookUrl('YOUR_SLACK_WEBHOOK_URL'), false);
});

test('dist/Code.js には秘密情報の実値が含まれない', () => {
  const bundle = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.strictEqual(/AIzaSy[A-Za-z0-9_-]{30,}/.test(bundle), false);
  assert.strictEqual(/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}/.test(bundle), false);
});
