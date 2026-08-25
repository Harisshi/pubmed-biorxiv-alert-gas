/**
 * 設定の読み込みと検証。
 *
 * 設定は 3 層で構成されます。
 *   1. DEFAULT_CONFIG      … このファイルの既定値
 *   2. USER_CONFIG         … UserConfig.js（各自がコピーして編集するファイル）
 *   3. スクリプトプロパティ … API キーなどの秘密情報
 *
 * 秘密情報は決してコードに書かず、GAS の
 * 「プロジェクトの設定 → スクリプト プロパティ」に保存してください。
 */

/** スクリプトのバージョン。スプレッドシートの ScriptVersion 列に記録されます。 */
const SCRIPT_VERSION = 'v4.0.0';

/** スプレッドシートおよびログのタイムゾーン。 */
const TIMEZONE = 'Asia/Tokyo';

/** 論文の出典を表す区分。スプレッドシートのシート名とも対応します。 */
const PAPER_CATEGORY_PUBMED = 'PubMed';
const PAPER_CATEGORY_BIORXIV = 'BioRxiv';

/** UserConfig.js で指定されなかった項目に使われる既定値。 */
const DEFAULT_CONFIG = {
  searchKeywords: [],
  searchPeriod: '1d',
  customStartDate: '',
  customEndDate: '',
  maxResultsPerKeyword: 100,
  pubmedDateType: 'edat',
  bioRxivServers: ['biorxiv'],
  maxBioRxivRecords: 2000,

  useGenerativeAI: false,
  geminiModel: 'gemini-2.5-flash',
  maxAbstractLength: 300,

  notificationMethods: [],
  notifyOnNoResults: false,
  deduplicateAcrossKeywords: true,
  notificationFormat: {
    includeImpactFactor: true,
    includeJapaneseAbstract: true,
    includeSummarizedAbstract: false,
    includeAbstract: false,
    maxPapersPerKeyword: 30,
    abstractPreviewLength: 300,
  },

  minImpactFactor: 0,
  skipPapersWithUnknownImpactFactor: false,
  impactFactorMatchThreshold: 0.9,

  maxGeminiRequestsPerDay: 1500,
  maxGasTriggersPerDay: 45,
  maxLineNotificationsPerDay: 20,
  maxSlackNotificationsPerDay: 20,
};

/**
 * 秘密情報を保存するスクリプトプロパティのキー。
 * `required` は「その機能を使う場合に必須かどうか」の判定関数です。
 */
const SECRET_DEFINITIONS = [
  {
    key: 'SPREADSHEET_ID',
    label: '記録先スプレッドシートの ID',
    isRequired: function () { return true; },
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Gemini API キー',
    isRequired: function (config) { return config.useGenerativeAI === true; },
  },
  {
    key: 'IMPACT_FACTOR_CSV_ID',
    label: 'インパクトファクター CSV（Google ドライブ）のファイル ID',
    isRequired: function (config) { return config.minImpactFactor > 0; },
  },
  {
    key: 'LINE_CHANNEL_ACCESS_TOKEN',
    label: 'LINE Messaging API のチャネルアクセストークン',
    isRequired: function (config) { return config.notificationMethods.indexOf('line') >= 0; },
  },
  {
    key: 'SLACK_WEBHOOK_URL',
    label: 'Slack の Incoming Webhook URL',
    isRequired: function (config) { return config.notificationMethods.indexOf('slack') >= 0; },
  },
  {
    key: 'NOTIFICATION_EMAIL',
    label: '通知先メールアドレス',
    isRequired: function (config) { return config.notificationMethods.indexOf('email') >= 0; },
  },
  {
    key: 'NCBI_API_KEY',
    label: 'NCBI API キー（任意。指定すると PubMed のレート上限が緩和されます）',
    isRequired: function () { return false; },
  },
  {
    key: 'NCBI_TOOL_EMAIL',
    label: 'NCBI へ通知する連絡先メールアドレス（任意。NCBI が指定を推奨しています）',
    isRequired: function () { return false; },
  },
];

/** 1 回の実行中だけ有効な設定キャッシュ。 */
let __configCache = null;
let __secretCache = null;

/**
 * 有効な設定を返します。DEFAULT_CONFIG に UserConfig.js の値を重ねたものです。
 * @return {!Object}
 */
function getConfig() {
  if (__configCache) return __configCache;

  if (typeof USER_CONFIG === 'undefined') {
    throw new Error(
      'UserConfig.js が見つかりません。' +
      'src/UserConfig.example.js を src/UserConfig.js にコピーして編集してください。'
    );
  }

  __configCache = mergeConfig_(DEFAULT_CONFIG, USER_CONFIG);
  return __configCache;
}

/**
 * スクリプトプロパティから秘密情報を読み出します。
 * @param {string} key SECRET_DEFINITIONS のキー
 * @return {string} 未設定の場合は空文字列
 */
function getSecret(key) {
  if (!__secretCache) {
    __secretCache = PropertiesService.getScriptProperties().getProperties() || {};
  }
  return (__secretCache[key] || '').trim();
}

/**
 * 秘密情報を読み出し、未設定なら例外を投げます。
 * @param {string} key
 * @return {string}
 */
function requireSecret(key) {
  const value = getSecret(key);
  if (!value) {
    const def = SECRET_DEFINITIONS.filter(function (d) { return d.key === key; })[0];
    const label = def ? def.label : key;
    throw new Error(
      'スクリプトプロパティ "' + key + '"（' + label + '）が未設定です。' +
      'GAS の「プロジェクトの設定 → スクリプト プロパティ」で設定してください。'
    );
  }
  return value;
}

/**
 * 2 階層までの浅いマージ。オブジェクトはキー単位、配列は丸ごと置き換えます。
 * 純粋関数なのでユニットテストの対象です。
 * @param {!Object} base
 * @param {!Object} override
 * @return {!Object}
 */
function mergeConfig_(base, override) {
  const result = {};
  Object.keys(base).forEach(function (key) {
    result[key] = base[key];
  });
  Object.keys(override || {}).forEach(function (key) {
    const baseValue = base[key];
    const newValue = override[key];
    const isPlainObject = newValue !== null &&
      typeof newValue === 'object' &&
      !Array.isArray(newValue);
    if (isPlainObject && baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
      result[key] = mergeConfig_(baseValue, newValue);
    } else {
      result[key] = newValue;
    }
  });
  return result;
}

/**
 * 設定内容を検証し、問題点の一覧を返します。
 * 値そのものは返さないため、ログに出しても秘密情報は漏れません。
 * @return {{errors: !Array<string>, warnings: !Array<string>}}
 */
function validateConfiguration() {
  const errors = [];
  const warnings = [];
  const config = getConfig();

  if (!config.searchKeywords || config.searchKeywords.length === 0) {
    errors.push('searchKeywords が空です。UserConfig.js に検索キーワードを設定してください。');
  }

  const validPeriods = ['1d', '3d', '7d', '30d', '1y', 'custom'];
  if (validPeriods.indexOf(config.searchPeriod) < 0) {
    errors.push('searchPeriod が不正です: ' + config.searchPeriod +
      '（有効な値: ' + validPeriods.join(', ') + '）');
  }
  if (config.searchPeriod === 'custom') {
    if (!isValidDateString_(config.customStartDate) || !isValidDateString_(config.customEndDate)) {
      errors.push('customStartDate / customEndDate は YYYY-MM-DD 形式で指定してください。');
    }
  }

  const validMethods = ['line', 'slack', 'email'];
  if (!config.notificationMethods || config.notificationMethods.length === 0) {
    warnings.push('notificationMethods が空です。検索結果は記録されますが通知は送られません。');
  }
  (config.notificationMethods || []).forEach(function (method) {
    if (validMethods.indexOf(method) < 0) {
      errors.push('notificationMethods に未知の通知先が含まれています: ' + method);
    }
  });

  SECRET_DEFINITIONS.forEach(function (def) {
    const isSet = getSecret(def.key) !== '';
    if (def.isRequired(config) && !isSet) {
      errors.push('スクリプトプロパティ "' + def.key + '"（' + def.label + '）が未設定です。');
    }
  });

  if (!getSecret('NCBI_TOOL_EMAIL')) {
    warnings.push(
      'スクリプトプロパティ "NCBI_TOOL_EMAIL" が未設定です。' +
      'NCBI は E-utilities 利用時に連絡先メールアドレスの指定を推奨しています。'
    );
  }

  return { errors: errors, warnings: warnings };
}

/**
 * 設定状況をログに出力します。GAS のエディタから手動で実行してください。
 * 秘密情報の値は出力せず、設定済みかどうかだけを表示します。
 */
function showConfigurationStatus() {
  logInfo('=== 設定状況 (' + SCRIPT_VERSION + ') ===');

  let config;
  try {
    config = getConfig();
  } catch (e) {
    logError('設定を読み込めませんでした: ' + e.message);
    return;
  }

  logInfo('検索キーワード: ' + config.searchKeywords.join(' / '));
  logInfo('検索期間: ' + config.searchPeriod);
  logInfo('通知先: ' + (config.notificationMethods.join(', ') || '（なし）'));
  logInfo('最低インパクトファクター: ' + config.minImpactFactor);
  logInfo('生成 AI による要約: ' + (config.useGenerativeAI ? '有効（' + config.geminiModel + '）' : '無効'));

  logInfo('--- スクリプトプロパティ ---');
  SECRET_DEFINITIONS.forEach(function (def) {
    const isSet = getSecret(def.key) !== '';
    const requirement = def.isRequired(config) ? '必須' : '任意';
    logInfo('  [' + (isSet ? '設定済み' : '未設定  ') + '] ' + def.key + ' (' + requirement + ') … ' + def.label);
  });

  const result = validateConfiguration();
  logInfo('--- 検証結果 ---');
  if (result.errors.length === 0 && result.warnings.length === 0) {
    logInfo('問題は見つかりませんでした。');
  }
  result.errors.forEach(function (message) { logError('エラー: ' + message); });
  result.warnings.forEach(function (message) { logInfo('警告: ' + message); });
}

/**
 * YYYY-MM-DD 形式として妥当かどうかを判定します。
 * @param {string} value
 * @return {boolean}
 */
function isValidDateString_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}
