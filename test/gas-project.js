/**
 * ユニットテスト用のローダー。
 *
 * src/ の各ファイルは Google Apps Script 上で 1 つのグローバルスコープを共有します。
 * ここでは同じ状況を Node の vm で再現し、GAS 固有の API は最小限のスタブに差し替えます。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_DIR = path.join(__dirname, '..', 'src');

/** テストで使う既定のユーザー設定。 */
const DEFAULT_TEST_USER_CONFIG = {
  searchKeywords: ['Golgi', 'Microtubule'],
  searchPeriod: '1d',
  notificationMethods: ['line'],
  minImpactFactor: 4.0,
  useGenerativeAI: false,
};

/**
 * 日付を GAS の Utilities.formatDate と同じ書式で整形します。
 * タイムゾーン引数は無視し、実行環境のローカル時刻で処理します。
 */
function formatDate(date, _timeZone, pattern) {
  const pad = (value, length) => String(value).padStart(length, '0');
  return pattern
    .replace(/yyyy/g, pad(date.getFullYear(), 4))
    .replace(/MM/g, pad(date.getMonth() + 1, 2))
    .replace(/dd/g, pad(date.getDate(), 2))
    .replace(/HH/g, pad(date.getHours(), 2))
    .replace(/mm/g, pad(date.getMinutes(), 2))
    .replace(/ss/g, pad(date.getSeconds(), 2));
}

/**
 * GAS のグローバル API を差し替えたコンテキストを作ります。
 */
function createStubContext(userConfig) {
  const logs = [];
  return {
    console,
    USER_CONFIG: Object.assign({}, DEFAULT_TEST_USER_CONFIG, userConfig || {}),
    __logs: logs,
    Logger: { log: (message) => logs.push(String(message)) },
    Utilities: {
      formatDate,
      sleep: () => {},
      parseCsv: (text) => text.trim().split('\n').map((line) => line.split(',')),
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperties: () => ({}) }),
    },
    UrlFetchApp: {
      fetch: () => { throw new Error('テストではネットワークアクセスを行いません'); },
    },
    SpreadsheetApp: {},
    DriveApp: {},
    MailApp: {},
    ScriptApp: {},
    XmlService: {},
  };
}

/**
 * src/ の全ファイルを読み込んだコンテキストを返します。
 *
 * @param {!Object=} userConfig UserConfig.js の代わりに使う設定
 * @return {{context: !Object, evaluate: function(string): *, logs: !Array<string>}}
 */
function loadGasProject(userConfig) {
  const context = createStubContext(userConfig);
  vm.createContext(context);

  const files = fs.readdirSync(SRC_DIR)
    .filter((file) => file.endsWith('.js') && file !== 'UserConfig.example.js')
    .sort();

  for (const file of files) {
    const code = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  return {
    context,
    logs: context.__logs,
    // const で宣言された定数はコンテキストのプロパティにならないため、式として評価します。
    evaluate: (expression) => vm.runInContext(expression, context),
  };
}

module.exports = { loadGasProject };
