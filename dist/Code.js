/**
 * NewArticleAlertWithGAS — 1 ファイルにまとめた版
 *
 * このファイルは src/ の各ファイルから自動生成されています。直接編集しないでください。
 * 変更する場合は src/ を編集し、`npm run build` で再生成します。
 *
 * 使い方（clasp を使わない場合）:
 *   1. このファイルの内容をすべてコピーする
 *   2. Apps Script エディタの コード.gs に貼り付ける
 *   3. ファイル先頭の USER_CONFIG を自分の用途に合わせて編集する
 *   4. API キーなどはコードに書かず、スクリプトプロパティに設定する
 *
 * 詳しい手順は README を参照してください。
 */

// ===========================================================================
// UserConfig.example.js
// ===========================================================================
/**
 * ユーザー設定ファイル（テンプレート）
 *
 * 使い方:
 *   1. このファイルを同じディレクトリに `UserConfig.js` という名前でコピーする
 *        cp src/UserConfig.example.js src/UserConfig.js
 *   2. コピーした `UserConfig.js` を自分の用途に合わせて編集する
 *   3. `clasp push` で Google Apps Script に反映する
 *
 * `UserConfig.js` は .gitignore で除外されているため、リポジトリには入りません。
 *
 * ⚠ API キー・アクセストークン・スプレッドシート ID などの秘密情報は
 *    このファイルには書かないでください。スクリプトプロパティに保存します。
 *    設定方法は README の「セットアップ」を参照してください。
 *
 * ここで指定しなかった項目は Config.js の DEFAULT_CONFIG の値が使われます。
 */
const USER_CONFIG = {
  // ── 検索設定 ───────────────────────────────────────────────
  /** 検索キーワード。PubMed の検索式をそのまま書けます。 */
  searchKeywords: [
    'Golgi',
    'Microtubule',
    'Cellular senescence',
  ],

  /** 検索期間: '1d' | '3d' | '7d' | '30d' | '1y' | 'custom' */
  searchPeriod: '1d',

  /** searchPeriod が 'custom' のときのみ使用（YYYY-MM-DD） */
  customStartDate: '2024-06-19',
  customEndDate: '2024-06-26',

  /** キーワードごとに PubMed から取得する最大件数 */
  maxResultsPerKeyword: 100,

  /**
   * PubMed の日付の解釈。
   *   'edat' … PubMed に登録された日（新着通知にはこちらが適しています）
   *   'pdat' … 出版日（掲載号の日付。実際の登録より前後することがあります）
   */
  pubmedDateType: 'edat',

  /** 検索対象のプレプリントサーバー: 'biorxiv' / 'medrxiv' */
  bioRxivServers: ['biorxiv'],

  /**
   * プレプリントサーバーから 1 回の実行で取得する最大件数。
   * 期間を長くする場合は増やしてください（GAS の実行時間上限に注意）。
   */
  maxBioRxivRecords: 2000,

  // ── 要約（生成 AI）設定 ────────────────────────────────────
  /** Gemini による要約を使うかどうか（false なら要約列は空になります） */
  useGenerativeAI: true,

  /** 使用する Gemini モデル */
  geminiModel: 'gemini-2.5-flash',

  /** 日本語要約の最大文字数 */
  maxAbstractLength: 300,

  // ── 通知設定 ───────────────────────────────────────────────
  /** 通知先: 'line' | 'slack' | 'email' の配列。複数指定できます。 */
  notificationMethods: ['line'],

  /** 新着が 0 件のときも通知するか */
  notifyOnNoResults: false,

  /**
   * 複数のキーワードにヒットした論文を 1 回だけ通知するか。
   * false にすると、ヒットしたキーワードの数だけ通知に載ります。
   */
  deduplicateAcrossKeywords: true,

  /** 通知メッセージの内容 */
  notificationFormat: {
    includeImpactFactor: true,       // インパクトファクターを載せる
    includeJapaneseAbstract: true,   // 日本語要約を載せる
    includeSummarizedAbstract: false,// 英語要約（短縮版）を載せる
    includeAbstract: false,          // 原文要旨をそのまま載せる
    maxPapersPerKeyword: 30,         // 1 キーワードあたりの掲載上限
    abstractPreviewLength: 300,      // 通知に載せる要約の最大文字数
  },

  // ── インパクトファクター設定 ───────────────────────────────
  /** この値未満の論文は通知しない（JIF と JIF5Years のどちらかが上回れば通知） */
  minImpactFactor: 4.0,

  /**
   * インパクトファクターが CSV に見つからない論文の扱い。
   *   true  … 通知しない（IF 不明の雑誌を切り捨てる）
   *   false … 通知する（新しい雑誌などを取りこぼさない）
   */
  skipPapersWithUnknownImpactFactor: false,

  /**
   * ジャーナル名が完全一致しなかったときの近似照合の厳しさ（0〜1）。
   * 高いほど厳格になり、別の雑誌に誤って一致する可能性が下がります。
   */
  impactFactorMatchThreshold: 0.9,

  // ── 使用量の上限（1 日あたり） ─────────────────────────────
  maxGeminiRequestsPerDay: 1500,
  maxGasTriggersPerDay: 45,
  maxLineNotificationsPerDay: 20,
  maxSlackNotificationsPerDay: 20,
};


// ===========================================================================
// BioRxiv.js
// ===========================================================================
/**
 * bioRxiv / medRxiv からのプレプリント取得。
 *
 * API は 1 回のリクエストにつき最大 100 件しか返さないため、
 * cursor を進めながら期間内のすべてのプレプリントを取得します。
 * 取得結果は 1 回の実行中キャッシュし、キーワードごとの再取得を避けます。
 */

const BIORXIV_BASE_URL = 'https://api.biorxiv.org/details';

/** API が 1 ページで返す件数。 */
const BIORXIV_PAGE_SIZE = 100;

/** 1 回の実行中だけ有効なプレプリントのキャッシュ。 */
let __bioRxivCache = {};

/**
 * 指定キーワードに合致するプレプリントを返します。
 *
 * @param {string} keyword
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>}
 */
function searchBioRxiv(keyword, config, now) {
  const preprints = getBioRxivPreprints(config, now);
  const matched = preprints.filter(function (paper) {
    return matchesKeyword(paper, keyword);
  });
  logInfo('bioRxiv: "' + keyword + '" に ' + matched.length + ' 件が該当しました');
  return matched;
}

/**
 * 期間内のプレプリントをすべて取得します（実行中は 1 回だけ取得）。
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>}
 */
function getBioRxivPreprints(config, now) {
  const range = resolveSearchRange(config, now);
  const startDateStr = formatDateForApi(range.startDate, '-');
  const endDateStr = formatDateForApi(range.endDate, '-');

  const papers = [];
  (config.bioRxivServers || []).forEach(function (server) {
    const cacheKey = server + ':' + startDateStr + ':' + endDateStr;
    if (!__bioRxivCache[cacheKey]) {
      __bioRxivCache[cacheKey] = fetchBioRxivRange_(server, startDateStr, endDateStr, config);
    }
    __bioRxivCache[cacheKey].forEach(function (paper) { papers.push(paper); });
  });

  return papers;
}

/**
 * 指定サーバーの指定期間のプレプリントをページングしながら取得します。
 * @param {string} server 'biorxiv' または 'medrxiv'
 * @param {string} startDateStr 'YYYY-MM-DD'
 * @param {string} endDateStr 'YYYY-MM-DD'
 * @param {!Object} config
 * @return {!Array<!Object>}
 */
function fetchBioRxivRange_(server, startDateStr, endDateStr, config) {
  const papers = [];
  const maxRecords = config.maxBioRxivRecords;
  let cursor = 0;
  let total = null;

  logInfo(server + ' 検索: ' + startDateStr + ' 〜 ' + endDateStr);

  while (cursor < maxRecords) {
    const url = BIORXIV_BASE_URL + '/' + server + '/' + startDateStr + '/' + endDateStr + '/' + cursor;

    let response;
    try {
      response = fetchWithRetry(url);
    } catch (e) {
      logError(server + ' の取得でエラーが発生しました', e);
      break;
    }

    if (!isSuccessResponse(response)) {
      logError(server + ' の取得に失敗しました (HTTP ' + response.getResponseCode() + ')');
      break;
    }

    let result;
    try {
      result = JSON.parse(response.getContentText());
    } catch (e) {
      logError(server + ' のレスポンスを解析できませんでした', e);
      break;
    }

    const collection = result.collection || [];
    collection.forEach(function (item) {
      papers.push(toBioRxivPaper_(item, server));
    });

    if (total === null) {
      total = readBioRxivTotal_(result);
      if (total !== null) logInfo(server + ': 期間内に ' + total + ' 件のプレプリントがあります');
    }

    if (collection.length < BIORXIV_PAGE_SIZE) break;

    cursor += BIORXIV_PAGE_SIZE;
    if (total !== null && cursor >= total) break;

    Utilities.sleep(200);
  }

  if (total !== null && papers.length < total) {
    logInfo(server + ': 上限 ' + maxRecords + ' 件に達したため ' + papers.length +
      ' 件で打ち切りました（maxBioRxivRecords で変更できます）');
  }

  return papers;
}

/**
 * API のレスポンスから総件数を読み取ります。
 * @param {!Object} result
 * @return {?number}
 */
function readBioRxivTotal_(result) {
  if (!result.messages || result.messages.length === 0) return null;
  const total = Number(result.messages[0].total);
  return isNaN(total) ? null : total;
}

/**
 * API のレコードを共通の論文オブジェクトに変換します。
 * @param {!Object} item
 * @param {string} server
 * @return {!Object}
 */
function toBioRxivPaper_(item, server) {
  return {
    title: String(item.title || '').trim(),
    url: item.doi ? 'https://doi.org/' + item.doi : '',
    authors: String(item.authors || '').trim(),
    journal: server === 'medrxiv' ? 'medRxiv' : 'bioRxiv',
    abstract: String(item.abstract || '').trim(),
    category: PAPER_CATEGORY_BIORXIV,
  };
}

/**
 * 論文のタイトルまたは要旨にキーワードが含まれるかを判定します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Object} paper
 * @param {string} keyword
 * @return {boolean}
 */
function matchesKeyword(paper, keyword) {
  if (!keyword) return false;
  const needle = String(keyword).toLowerCase();
  const title = String(paper.title || '').toLowerCase();
  const abstract = String(paper.abstract || '').toLowerCase();
  return title.indexOf(needle) >= 0 || abstract.indexOf(needle) >= 0;
}


// ===========================================================================
// Config.js
// ===========================================================================
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


// ===========================================================================
// DateRange.js
// ===========================================================================
/**
 * 検索期間の計算。
 *
 * 以前は PubMed 用と BioRxiv 用に同じ switch 文が重複していたため、
 * 1 箇所にまとめてユニットテストできるようにしています。
 */

/** searchPeriod の指定値と遡る日数の対応。 */
const SEARCH_PERIOD_DAYS = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
  '30d': 30,
};

/**
 * 設定から検索対象の期間を求めます。GAS API に依存しない純粋関数です。
 *
 * @param {!Object} config getConfig() が返す設定
 * @param {!Date} now 基準となる現在時刻
 * @return {{startDate: !Date, endDate: !Date}}
 */
function resolveSearchRange(config, now) {
  if (config.searchPeriod === 'custom') {
    return {
      startDate: parseDateString(config.customStartDate),
      endDate: parseDateString(config.customEndDate),
    };
  }

  const endDate = new Date(now.getTime());
  const startDate = new Date(now.getTime());

  if (config.searchPeriod === '1y') {
    startDate.setFullYear(startDate.getFullYear() - 1);
  } else {
    const days = SEARCH_PERIOD_DAYS[config.searchPeriod];
    // 未知の指定は最も安全な 1 日前として扱います。
    startDate.setDate(startDate.getDate() - (typeof days === 'number' ? days : 1));
  }

  return { startDate: startDate, endDate: endDate };
}

/**
 * 'YYYY-MM-DD' 形式の文字列を Date に変換します。
 *
 * new Date('2024-06-19') は UTC 解釈になり、日本時間では前日にずれることがあるため、
 * 年月日を明示して現地時刻の 0 時として生成します。
 *
 * @param {string} value
 * @return {!Date}
 */
function parseDateString(value) {
  const parts = String(value).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/**
 * 日付を API 用の文字列に整形します。
 * @param {!Date} date
 * @param {string} separator '/' なら PubMed 用、'-' なら BioRxiv 用
 * @return {string}
 */
function formatDateForApi(date, separator) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy' + separator + 'MM' + separator + 'dd');
}

/**
 * スプレッドシートに記録する日時文字列を返します。
 * @param {!Date} date
 * @return {string}
 */
function formatDateTimeForSheet(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy/MM/dd HH:mm:ss');
}

/**
 * 使用量集計に使う当日の日付文字列を返します。
 * @param {!Date=} date 省略時は現在時刻
 * @return {string} 'YYYY-MM-DD'
 */
function todayString(date) {
  return Utilities.formatDate(date || new Date(), TIMEZONE, 'yyyy-MM-dd');
}


// ===========================================================================
// Gemini.js
// ===========================================================================
/**
 * Gemini API による要約生成。
 *
 * 呼び出し回数の記録は callGemini_() に一本化しています。
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 英文要旨から日本語の要約を生成します。
 * @param {string} text
 * @param {!Object} config
 * @return {string} 生成できなかった場合は空文字列
 */
function generateJapaneseAbstract(text, config) {
  if (!text) return '';
  const prompt = '以下の英文要旨を日本語で要約してください（最大' +
    config.maxAbstractLength + '字）。前置きや見出しは付けず、要約本文だけを出力してください。\n\n' + text;
  return callGemini_(prompt, config);
}

/**
 * 英文要旨から短い英語の要約を生成します。
 * @param {string} text
 * @param {!Object} config
 * @return {string} 生成できなかった場合は空文字列
 */
function generateEnglishSummary(text, config) {
  if (!text) return '';
  const prompt = 'Summarize the following abstract in English, keeping the key findings and ' +
    'making it concise (around 100 words). Output only the summary.\n\n' + text;
  return callGemini_(prompt, config);
}

/**
 * Gemini API を呼び出し、生成されたテキストを返します。
 * 失敗しても例外は投げず、空文字列を返して処理を続けます。
 *
 * @param {string} prompt
 * @param {!Object} config
 * @return {string}
 */
function callGemini_(prompt, config) {
  const endpoint = GEMINI_BASE_URL + '/' + config.geminiModel + ':generateContent';
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  try {
    recordGeminiRequest();

    const response = fetchWithRetry(endpoint, {
      method: 'post',
      contentType: 'application/json',
      // API キーはヘッダーで渡します。URL に含めるとログに残るおそれがあります。
      headers: { 'x-goog-api-key': requireSecret('GEMINI_API_KEY') },
      payload: JSON.stringify(payload),
    });

    if (!isSuccessResponse(response)) {
      logError('Gemini API がエラーを返しました (HTTP ' + response.getResponseCode() + '): ' +
        truncateForLog_(response.getContentText()));
      return '';
    }

    return extractGeminiText(JSON.parse(response.getContentText()));
  } catch (e) {
    logError('Gemini API の呼び出しに失敗しました', e);
    return '';
  }
}

/**
 * Gemini のレスポンスから本文テキストを取り出します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Object} responseBody
 * @return {string}
 */
function extractGeminiText(responseBody) {
  if (!responseBody) return '';

  if (responseBody.promptFeedback && responseBody.promptFeedback.blockReason) {
    logError('Gemini がプロンプトを拒否しました: ' + responseBody.promptFeedback.blockReason);
    return '';
  }

  const candidates = responseBody.candidates;
  if (!candidates || candidates.length === 0) return '';

  const parts = candidates[0].content && candidates[0].content.parts;
  if (!parts || parts.length === 0) return '';

  return parts.map(function (part) { return part.text || ''; }).join('').trim();
}


// ===========================================================================
// Http.js
// ===========================================================================
/**
 * HTTP 通信の共通処理。
 *
 * 外部 API は一時的に 429 や 5xx を返すことがあるため、
 * 再試行と指数バックオフをここに集約しています。
 */

/** 既定の再試行回数（初回リクエストを除く）。 */
const HTTP_DEFAULT_RETRIES = 3;

/** 再試行までの初期待ち時間（ミリ秒）。 */
const HTTP_INITIAL_BACKOFF_MS = 1000;

/**
 * 再試行付きで HTTP リクエストを行います。
 *
 * 5xx と 429 は一時的な障害とみなして再試行します。
 * 4xx（429 を除く）は再試行しても結果が変わらないため、そのまま返します。
 *
 * @param {string} url
 * @param {!Object=} options UrlFetchApp.fetch のオプション
 * @param {number=} retries 再試行回数
 * @return {!Object} HTTPResponse
 * @throws {Error} すべての試行が失敗した場合
 */
function fetchWithRetry(url, options, retries) {
  const maxRetries = typeof retries === 'number' ? retries : HTTP_DEFAULT_RETRIES;
  const fetchOptions = {};
  Object.keys(options || {}).forEach(function (key) {
    fetchOptions[key] = options[key];
  });
  // ステータスコードを自分で判定するため、例外化は無効にします。
  fetchOptions.muteHttpExceptions = true;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      Utilities.sleep(HTTP_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
    }

    try {
      const response = UrlFetchApp.fetch(url, fetchOptions);
      const status = response.getResponseCode();

      if (status >= 200 && status < 300) return response;

      if (status === 429 || status >= 500) {
        lastError = new Error('HTTP ' + status + ' が返されました: ' + url);
        continue;
      }

      // 4xx はリクエスト自体に問題があるため、呼び出し側に判断を委ねます。
      return response;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('リクエストに失敗しました: ' + url);
}

/**
 * レスポンスが成功ステータスかどうかを判定します。
 * @param {!Object} response HTTPResponse
 * @return {boolean}
 */
function isSuccessResponse(response) {
  const status = response.getResponseCode();
  return status >= 200 && status < 300;
}


// ===========================================================================
// ImpactFactor.js
// ===========================================================================
/**
 * インパクトファクターの照合。
 *
 * 以前は論文 1 件ごとに Google ドライブから CSV を読み直し、
 * 全行に対してレーベンシュタイン距離を計算していたため、
 * 論文数が増えると GAS の実行時間上限に達していました。
 *
 * 現在は 1 回の実行につき CSV を 1 度だけ読み込んで索引を作り、
 * 完全一致 → 略称一致 → 近似一致 の順に照合します。
 * 近似一致は先頭 2 文字と文字数で候補を絞ってから計算します。
 */

/** CSV の列名。表記ゆれに備えて候補を列挙しています。 */
const IMPACT_FACTOR_COLUMN_ALIASES = {
  name: ['Name', 'Journal name', 'Journal', 'Full Name'],
  abbreviation: ['Abbr Name', 'Abbreviation', 'JCR Abbreviation', 'ISO Abbreviation'],
  jif: ['JIF', '2023 JIF', 'Impact Factor', 'IF'],
  jif5Years: ['JIF5Years', 'JIF 5 Years', '5 Year JIF', 'IF5'],
};

/** 照合結果が無いことを表す値。 */
const EMPTY_IMPACT_FACTOR = {
  impactFactor: 0,
  impactFactor5Years: 0,
  matchedJournal: '',
  found: false,
};

/** 1 回の実行中だけ有効な索引のキャッシュ。 */
let __impactFactorIndex = null;

/**
 * ジャーナル名からインパクトファクターを引きます。
 *
 * @param {string} journalName
 * @param {!Object} config
 * @return {{impactFactor: number, impactFactor5Years: number, matchedJournal: string, found: boolean}}
 */
function lookupImpactFactor(journalName, config) {
  if (!journalName) return EMPTY_IMPACT_FACTOR;

  const index = getImpactFactorIndex_();
  if (!index) return EMPTY_IMPACT_FACTOR;

  const normalized = normalizeJournalName(journalName);
  if (!normalized) return EMPTY_IMPACT_FACTOR;

  const exact = index.byName[normalized] || index.byAbbreviation[normalized];
  if (exact) return toImpactFactorResult_(exact);

  const approximate = findApproximateMatch_(normalized, index, config.impactFactorMatchThreshold);
  return approximate ? toImpactFactorResult_(approximate) : EMPTY_IMPACT_FACTOR;
}

/**
 * 索引のエントリを戻り値の形に変換します。
 * @param {!Object} entry
 * @return {!Object}
 */
function toImpactFactorResult_(entry) {
  return {
    impactFactor: entry.jif,
    impactFactor5Years: entry.jif5Years,
    matchedJournal: entry.name,
    found: true,
  };
}

/**
 * CSV を読み込んで索引を作ります（実行中は 1 回だけ）。
 * @return {?Object} 読み込めなかった場合は null
 */
function getImpactFactorIndex_() {
  if (__impactFactorIndex !== null) {
    return __impactFactorIndex.entries.length > 0 ? __impactFactorIndex : null;
  }

  const csvFileId = getSecret('IMPACT_FACTOR_CSV_ID');
  if (!csvFileId) {
    logInfo('IMPACT_FACTOR_CSV_ID が未設定のため、インパクトファクターの照合は行いません');
    __impactFactorIndex = { entries: [], byName: {}, byAbbreviation: {}, buckets: {} };
    return null;
  }

  try {
    const csvContent = DriveApp.getFileById(csvFileId).getBlob().getDataAsString();
    __impactFactorIndex = buildImpactFactorIndex(Utilities.parseCsv(csvContent));
    logInfo('インパクトファクター CSV を読み込みました: ' + __impactFactorIndex.entries.length + ' 誌');
    return __impactFactorIndex.entries.length > 0 ? __impactFactorIndex : null;
  } catch (e) {
    logError('インパクトファクター CSV を読み込めませんでした', e);
    __impactFactorIndex = { entries: [], byName: {}, byAbbreviation: {}, buckets: {} };
    return null;
  }
}

/**
 * パース済み CSV から索引を作ります。GAS API に依存しない純粋関数です。
 *
 * @param {!Array<!Array<string>>} csvData 1 行目がヘッダー
 * @return {{entries: !Array<!Object>, byName: !Object, byAbbreviation: !Object, buckets: !Object}}
 */
function buildImpactFactorIndex(csvData) {
  const index = { entries: [], byName: {}, byAbbreviation: {}, buckets: {} };
  if (!csvData || csvData.length < 2) return index;

  const headers = csvData[0].map(function (header) { return String(header).trim(); });
  const nameColumn = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.name);
  const abbreviationColumn = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.abbreviation);
  const jifColumn = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.jif);
  const jif5Column = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.jif5Years);

  if (nameColumn < 0 || jifColumn < 0) {
    throw new Error(
      'CSV に必要な列が見つかりません（Name と JIF は必須です）。実際の列: ' + headers.join(', ')
    );
  }

  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    const name = String(row[nameColumn] || '').trim();
    if (!name) continue;

    const entry = {
      name: name,
      normalizedName: normalizeJournalName(name),
      normalizedAbbreviation: abbreviationColumn >= 0
        ? normalizeJournalName(row[abbreviationColumn]) : '',
      jif: parseImpactFactorValue(row[jifColumn]),
      jif5Years: jif5Column >= 0 ? parseImpactFactorValue(row[jif5Column]) : 0,
    };

    index.entries.push(entry);

    // 先に登録された行を優先します（CSV の上位行ほど代表的な表記である想定）。
    if (entry.normalizedName && !index.byName[entry.normalizedName]) {
      index.byName[entry.normalizedName] = entry;
    }
    if (entry.normalizedAbbreviation && !index.byAbbreviation[entry.normalizedAbbreviation]) {
      index.byAbbreviation[entry.normalizedAbbreviation] = entry;
    }

    // 近似一致の候補を絞るため、先頭 2 文字でまとめておきます。
    const bucketKey = entry.normalizedName.substring(0, 2);
    if (!index.buckets[bucketKey]) index.buckets[bucketKey] = [];
    index.buckets[bucketKey].push(entry);
  }

  return index;
}

/**
 * ヘッダー配列から、候補名のいずれかに一致する列の位置を返します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Array<string>} headers
 * @param {!Array<string>} candidates
 * @return {number} 見つからない場合は -1
 */
function findColumnIndex(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const position = headers.indexOf(candidates[i]);
    if (position >= 0) return position;
  }
  return -1;
}

/**
 * CSV のインパクトファクター値を数値に変換します。
 * 'N/A' や '<0.1' のような値は 0 として扱います。
 * GAS API に依存しない純粋関数です。
 *
 * @param {*} value
 * @return {number}
 */
function parseImpactFactorValue(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return 0;
  const parsed = parseFloat(text.replace(/[,<>]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * 近似一致する索引エントリを探します。
 *
 * @param {string} normalized 正規化済みのジャーナル名
 * @param {!Object} index
 * @param {number} threshold 類似度の下限（0〜1）
 * @return {?Object}
 */
function findApproximateMatch_(normalized, index, threshold) {
  const candidates = index.buckets[normalized.substring(0, 2)] || [];
  const maxDistance = Math.floor(normalized.length * (1 - threshold));
  if (maxDistance < 1) return null;

  let best = null;
  let bestScore = threshold;

  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    if (Math.abs(entry.normalizedName.length - normalized.length) > maxDistance) continue;

    const score = similarityRatio(normalized, entry.normalizedName, maxDistance);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best;
}

/**
 * ジャーナル名を比較用に正規化します（小文字化し英数字だけを残す）。
 * GAS API に依存しない純粋関数です。
 *
 * @param {*} name
 * @return {string}
 */
function normalizeJournalName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * 2 つの文字列の類似度を 0〜1 で返します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} a
 * @param {string} b
 * @param {number=} maxDistance これを超える距離は打ち切ります
 * @return {number}
 */
function similarityRatio(a, b, maxDistance) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const longest = Math.max(a.length, b.length);
  const limit = typeof maxDistance === 'number' ? maxDistance : longest;
  const distance = levenshteinDistance(a, b, limit);
  if (distance > limit) return 0;
  return 1 - distance / longest;
}

/**
 * レーベンシュタイン距離を計算します。
 * maxDistance を超えることが確定した時点で打ち切ります。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} a
 * @param {string} b
 * @param {number} maxDistance
 * @return {number} 打ち切った場合は maxDistance + 1
 */
function levenshteinDistance(a, b, maxDistance) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previousRow = [];
  for (let j = 0; j <= b.length; j++) previousRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    let rowMinimum = i;

    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      const value = Math.min(
        previousRow[j] + 1,
        currentRow[j - 1] + 1,
        previousRow[j - 1] + substitutionCost
      );
      currentRow[j] = value;
      if (value < rowMinimum) rowMinimum = value;
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    previousRow = currentRow;
  }

  return previousRow[b.length];
}


// ===========================================================================
// Log.js
// ===========================================================================
/**
 * ログ出力のヘルパー。
 *
 * Logger.log を直接呼ばずにここを経由することで、出力形式を一箇所で変えられます。
 */

/**
 * 通常のログを出力します。
 * @param {string} message
 */
function logInfo(message) {
  Logger.log(message);
}

/**
 * エラーログを出力します。
 * @param {string} message
 * @param {Error=} error 例外オブジェクト（あれば内容とスタックを併記します）
 */
function logError(message, error) {
  if (error) {
    Logger.log('[ERROR] ' + message + ': ' + error);
    if (error.stack) Logger.log(error.stack);
  } else {
    Logger.log('[ERROR] ' + message);
  }
}

/**
 * ログに出す文字列を短く切り詰めます。
 * API のエラー応答をそのまま出すと実行ログが読みにくくなるため使います。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} text
 * @return {string}
 */
function truncateForLog_(text) {
  const value = String(text === null || text === undefined ? '' : text);
  return value.length > 300 ? value.substring(0, 300) + '…' : value;
}


// ===========================================================================
// Main.js
// ===========================================================================
/**
 * 実行の入口と全体の流れ。
 *
 * GAS のトリガーには runDailySearch を設定してください。
 */

/**
 * GAS の 1 回あたりの実行時間上限（6 分）に対する安全マージン。
 * これを超えたら論文の処理を打ち切り、記録と通知に時間を残します。
 */
const EXECUTION_SOFT_DEADLINE_MS = 300000;

/**
 * 設定された検索期間で新着論文を探して通知します。
 * 定期実行のトリガーにはこの関数を指定します。
 */
function runDailySearch() {
  runGuarded_(function (config, now) {
    processNewPapers(config, now);
  });
}

/**
 * 期間を指定して検索します。過去分をまとめて取り込みたいときに使います。
 *
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate 'YYYY-MM-DD'
 */
function runSearchForPeriod(startDate, endDate) {
  runGuarded_(function (config, now) {
    // 実行中のみ設定を上書きします（UserConfig.js は変更しません）。
    const periodConfig = mergeConfig_(config, {
      searchPeriod: 'custom',
      customStartDate: startDate,
      customEndDate: endDate,
    });
    logInfo('期間を指定して検索します: ' + startDate + ' 〜 ' + endDate);
    processNewPapers(periodConfig, now);
  });
}

/**
 * 設定の検証・使用量の管理・エラー通知をまとめて行い、渡された処理を実行します。
 *
 * @param {function(!Object, !Date)} task
 */
function runGuarded_(task) {
  const startTime = Date.now();
  let config;

  try {
    config = getConfig();
  } catch (e) {
    logError('設定を読み込めませんでした', e);
    return;
  }

  const validation = validateConfiguration();
  validation.warnings.forEach(function (message) { logInfo('警告: ' + message); });
  if (validation.errors.length > 0) {
    validation.errors.forEach(function (message) { logError(message); });
    notifyError_('設定に問題があります:\n' + validation.errors.join('\n'), config);
    return;
  }

  try {
    // 上限の判定は加算前の値で行い、そのうえで今回の実行分を記録します。
    if (getTodayUsage().triggers >= config.maxGasTriggersPerDay) {
      logError('1 日あたりの実行回数の上限に達しました');
      notifyError_('1 日あたりの実行回数の上限に達しました', config);
      return;
    }
    recordGasTrigger();

    task(config, new Date());
  } catch (e) {
    logError('処理中にエラーが発生しました', e);
    notifyError_('処理中にエラーが発生しました: ' + e, config);
  } finally {
    try {
      flushPendingUsage();
    } catch (e) {
      logError('使用量の記録に失敗しました', e);
    }
    logInfo('実行時間: ' + Math.round((Date.now() - startTime) / 1000) + ' 秒');
  }
}

/**
 * 新着論文を検索し、スプレッドシートに記録して通知します。
 *
 * @param {!Object} config
 * @param {!Date} now
 */
function processNewPapers(config, now) {
  const startTime = Date.now();
  const existingUrls = getExistingPaperUrls();
  logInfo('記録済みの論文: ' + Object.keys(existingUrls).length + ' 件');

  const collected = collectPapers(config, now);
  const newPapers = collected.filter(function (paper) {
    return paper.url && !existingUrls[paper.url];
  });
  logInfo('新規の論文: ' + newPapers.length + ' 件');

  if (newPapers.length === 0) {
    if (config.notifyOnNoResults) {
      sendPlainNotification(
        '新着論文はありませんでした。\nキーワード: ' + config.searchKeywords.join(' / '),
        '新着論文なし',
        config
      );
    }
    return;
  }

  const pubmedRecords = [];
  const preprintRecords = [];
  const searchDate = formatDateTimeForSheet(now);

  for (let i = 0; i < newPapers.length; i++) {
    if (Date.now() - startTime > EXECUTION_SOFT_DEADLINE_MS) {
      logInfo('実行時間の上限が近いため、残り ' + (newPapers.length - i) +
        ' 件は次回の実行に回します');
      break;
    }

    const paper = newPapers[i];
    try {
      const record = buildPaperRecord_(paper, config, searchDate);
      if (paper.category === PAPER_CATEGORY_PUBMED) {
        pubmedRecords.push(record);
      } else {
        preprintRecords.push(record);
      }
    } catch (e) {
      logError('論文の処理に失敗しました: ' + paper.url, e);
    }
  }

  appendRecords(SHEET_NAME_PUBMED, pubmedRecords, PUBMED_COLUMNS);
  appendRecords(SHEET_NAME_BIORXIV, preprintRecords, BIORXIV_COLUMNS);
  logInfo('スプレッドシートに記録しました: PubMed ' + pubmedRecords.length +
    ' 件 / プレプリント ' + preprintRecords.length + ' 件');

  notifyNewPapers(config, now);
}

/**
 * すべてのキーワードで検索し、重複を除いた論文の配列を返します。
 *
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>}
 */
function collectPapers(config, now) {
  const papers = [];

  config.searchKeywords.forEach(function (keyword) {
    try {
      searchPubMed(keyword, config, now).forEach(function (paper) {
        paper.matchedKeywords = [keyword];
        papers.push(paper);
      });
    } catch (e) {
      logError('PubMed の検索に失敗しました: ' + keyword, e);
    }

    try {
      searchBioRxiv(keyword, config, now).forEach(function (paper) {
        paper.matchedKeywords = [keyword];
        papers.push(paper);
      });
    } catch (e) {
      logError('プレプリントの検索に失敗しました: ' + keyword, e);
    }
  });

  return dedupePapers(papers);
}

/**
 * URL が同じ論文を 1 件にまとめ、ヒットしたキーワードを統合します。
 *
 * 複数のキーワードにヒットした論文が同じ回の実行で二重に記録される不具合を防ぎます。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Array<!Object>} papers
 * @return {!Array<!Object>}
 */
function dedupePapers(papers) {
  const byUrl = {};
  const result = [];

  papers.forEach(function (paper) {
    if (!paper.url) return;

    const existing = byUrl[paper.url];
    if (!existing) {
      byUrl[paper.url] = paper;
      result.push(paper);
      return;
    }

    (paper.matchedKeywords || []).forEach(function (keyword) {
      if (existing.matchedKeywords.indexOf(keyword) < 0) {
        existing.matchedKeywords.push(keyword);
      }
    });
  });

  return result;
}

/**
 * 論文 1 件をスプレッドシートの 1 行分のレコードに変換します。
 * 必要に応じてインパクトファクターの照合と要約の生成を行います。
 *
 * @param {!Object} paper
 * @param {!Object} config
 * @param {string} searchDate
 * @return {!Object}
 */
function buildPaperRecord_(paper, config, searchDate) {
  const record = {
    SearchDate: searchDate,
    NotifyDate: '',
    NotifyStatus: '',
    MatchedKeywords: formatMatchedKeywords(paper.matchedKeywords),
    Title: paper.title,
    Authors: paper.authors,
    Abstract: paper.abstract,
    SummarizedAbstract: '',
    JapaneseAbstract: '',
    Journal: paper.journal,
    URL: paper.url,
    Category: paper.category,
    ScriptVersion: SCRIPT_VERSION,
  };

  if (paper.category === PAPER_CATEGORY_PUBMED) {
    const impact = lookupImpactFactor(paper.journal, config);
    record.ImpactFactor = impact.impactFactor;
    record['ImpactFactor(5years)'] = impact.impactFactor5Years;
    record.MatchedJournal = impact.matchedJournal;

    // インパクトファクターが基準に満たない論文は要約を作らず、API の消費を抑えます。
    const wouldNotify = meetsImpactFactorThreshold({
      category: paper.category,
      impactFactor: impact.impactFactor,
      impactFactor5Years: impact.impactFactor5Years,
    }, config);
    if (!wouldNotify) return record;
  }

  if (config.useGenerativeAI && paper.abstract) {
    const format = config.notificationFormat;
    if (format.includeJapaneseAbstract && canUseGeminiApi(config)) {
      record.JapaneseAbstract = generateJapaneseAbstract(paper.abstract, config);
    }
    if (format.includeSummarizedAbstract && canUseGeminiApi(config)) {
      record.SummarizedAbstract = generateEnglishSummary(paper.abstract, config);
    }
  }

  return record;
}

/**
 * 未通知の論文をキーワードごとにまとめて通知します。
 *
 * @param {!Object} config
 * @param {!Date} now
 */
function notifyNewPapers(config, now) {
  const papers = readUnnotifiedPapers(SHEET_NAME_PUBMED)
    .concat(readUnnotifiedPapers(SHEET_NAME_BIORXIV));
  if (papers.length === 0) return;

  const groups = {};
  const updates = {};
  updates[SHEET_NAME_PUBMED] = [];
  updates[SHEET_NAME_BIORXIV] = [];

  papers.forEach(function (paper) {
    if (!meetsImpactFactorThreshold(paper, config)) {
      updates[paper.sheetName].push({
        rowNumber: paper.rowNumber,
        status: NOTIFY_STATUS_SKIPPED_LOW_IF,
      });
      return;
    }

    const keywords = resolveNotificationKeywords(paper, config);
    if (keywords.length === 0) return;

    keywords.forEach(function (keyword) {
      if (!groups[keyword]) groups[keyword] = [];
      groups[keyword].push(paper);
    });

    updates[paper.sheetName].push({
      rowNumber: paper.rowNumber,
      status: NOTIFY_STATUS_NOTIFIED,
    });
  });

  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy/MM/dd');
  config.searchKeywords.forEach(function (keyword) {
    const parts = buildNotificationParts(keyword, groups[keyword] || [], config, todayStr);
    if (parts) sendNotification(parts, '新着論文通知: ' + keyword, config);
  });

  // 送信後に通知状態を書き込みます。送信に失敗した場合は次回の実行で再試行されます。
  markPapersNotified(SHEET_NAME_PUBMED, updates[SHEET_NAME_PUBMED]);
  markPapersNotified(SHEET_NAME_BIORXIV, updates[SHEET_NAME_BIORXIV]);
}

/**
 * 論文をどのキーワードの通知に載せるかを決めます。
 *
 * 記録時の MatchedKeywords を使い、無い場合（旧バージョンで記録された行）は
 * タイトルと要旨から判定します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Object} paper
 * @param {!Object} config
 * @return {!Array<string>}
 */
function resolveNotificationKeywords(paper, config) {
  let keywords = (paper.matchedKeywords || []).filter(function (keyword) {
    return config.searchKeywords.indexOf(keyword) >= 0;
  });

  if (keywords.length === 0) {
    keywords = config.searchKeywords.filter(function (keyword) {
      return matchesKeyword(paper, keyword);
    });
  }

  return config.deduplicateAcrossKeywords ? keywords.slice(0, 1) : keywords;
}

/**
 * エラーを通知します。通知自体が失敗しても処理は続けます。
 *
 * @param {string} message
 * @param {!Object} config
 */
function notifyError_(message, config) {
  try {
    sendPlainNotification('[エラー] ' + message, 'GAS エラー通知', config);
  } catch (e) {
    logError('エラー通知の送信に失敗しました', e);
  }
}


// ===========================================================================
// NotificationBuilder.js
// ===========================================================================
/**
 * 通知メッセージの組み立て。
 *
 * このファイルの関数はすべて GAS API に依存しない純粋関数で、
 * test/ のユニットテストで検証しています。
 */

/** 論文どうしの区切り線。 */
const PAPER_SEPARATOR = '----------------------------------------';

/** ページ番号 "(1/2)" を付けるために確保しておく文字数。 */
const PAGE_LABEL_RESERVE = 12;

/**
 * インパクトファクターが通知の条件を満たすかを判定します。
 *
 * JIF と 5 年 JIF のどちらかが閾値以上なら通知対象です。
 * 通知の可否と通知件数の表示で同じ基準を使うため、判定はこの関数に一本化しています。
 *
 * @param {!Object} paper
 * @param {!Object} config
 * @return {boolean}
 */
function meetsImpactFactorThreshold(paper, config) {
  if (paper.category !== PAPER_CATEGORY_PUBMED) return true;
  if (!config.minImpactFactor) return true;

  const jif = toNumber(paper.impactFactor);
  const jif5 = toNumber(paper.impactFactor5Years);

  // どちらも 0 の場合は「CSV に見つからなかった」とみなします。
  if (jif === 0 && jif5 === 0) return !config.skipPapersWithUnknownImpactFactor;

  return jif >= config.minImpactFactor || jif5 >= config.minImpactFactor;
}

/**
 * 1 キーワード分の通知メッセージを組み立てます。
 *
 * @param {string} keyword
 * @param {!Array<!Object>} papers 通知対象の論文（すでに閾値で絞り込み済み）
 * @param {!Object} config
 * @param {string} todayStr 'YYYY/MM/DD'
 * @return {?{header: string, blocks: !Array<string>}} 対象が無い場合は null
 */
function buildNotificationParts(keyword, papers, config, todayStr) {
  if (!papers || papers.length === 0) return null;

  const pubmedPapers = papers.filter(function (paper) {
    return paper.category === PAPER_CATEGORY_PUBMED;
  }).sort(function (a, b) {
    return highestImpactFactor_(b) - highestImpactFactor_(a);
  });

  const preprints = papers.filter(function (paper) {
    return paper.category === PAPER_CATEGORY_BIORXIV;
  });

  const limit = config.notificationFormat.maxPapersPerKeyword;
  const shownPubmed = pubmedPapers.slice(0, limit);
  const shownPreprints = preprints.slice(0, limit);
  const omitted = (pubmedPapers.length - shownPubmed.length) +
    (preprints.length - shownPreprints.length);

  let header = todayStr + ' の新着論文\n';
  header += 'キーワード: ' + keyword + '\n';
  header += '通知件数: PubMed ' + pubmedPapers.length + ' 件 / プレプリント ' +
    preprints.length + ' 件\n';
  if (omitted > 0) {
    header += '※ 掲載上限のため ' + omitted + ' 件を省略しました\n';
  }

  const blocks = [];
  shownPubmed.forEach(function (paper, index) {
    const prefix = index === 0 ? '\n■ PubMed\n' : '';
    blocks.push(prefix + buildPaperBlock(paper, index + 1, config));
  });
  shownPreprints.forEach(function (paper, index) {
    const prefix = index === 0 ? '\n■ プレプリント\n' : '';
    blocks.push(prefix + buildPaperBlock(paper, index + 1, config));
  });

  return { header: header, blocks: blocks };
}

/**
 * 論文 1 件分の本文を組み立てます。
 *
 * @param {!Object} paper
 * @param {number} index 通知内での通し番号
 * @param {!Object} config
 * @return {string}
 */
function buildPaperBlock(paper, index, config) {
  const format = config.notificationFormat;
  let block = '\n' + index + '. ' + paper.title + '\n';
  block += '著者: ' + formatAuthors(paper.authors) + '\n';
  block += 'ジャーナル: ' + (paper.journal || '不明') + '\n';

  if (paper.matchedJournal && paper.matchedJournal !== paper.journal) {
    block += '（IF 照合先: ' + paper.matchedJournal + '）\n';
  }

  if (format.includeImpactFactor && paper.category === PAPER_CATEGORY_PUBMED) {
    block += 'インパクトファクター: ' + formatImpactFactor(paper) + '\n';
  }

  if (format.includeSummarizedAbstract && paper.summarizedAbstract) {
    block += '要約: ' + truncateText(paper.summarizedAbstract, format.abstractPreviewLength) + '\n';
  }

  if (format.includeJapaneseAbstract && paper.japaneseAbstract) {
    block += '日本語要約: ' + truncateText(paper.japaneseAbstract, format.abstractPreviewLength) + '\n';
  }

  if (format.includeAbstract && paper.abstract) {
    block += '要旨: ' + truncateText(paper.abstract, format.abstractPreviewLength) + '\n';
  }

  block += 'URL: ' + paper.url + '\n';
  block += PAPER_SEPARATOR + '\n';
  return block;
}

/**
 * インパクトファクターの表示文字列を返します。
 * @param {!Object} paper
 * @return {string}
 */
function formatImpactFactor(paper) {
  const jif = toNumber(paper.impactFactor);
  const jif5 = toNumber(paper.impactFactor5Years);
  if (jif === 0 && jif5 === 0) return '不明';
  if (jif5 === 0) return String(jif);
  if (jif === 0) return '5年 ' + jif5;
  return jif + '（5年 ' + jif5 + '）';
}

/**
 * 著者名を「筆頭著者 et al.（最終著者: ...）」の形に短縮します。
 * @param {string} authors カンマ区切りの著者名
 * @return {string}
 */
function formatAuthors(authors) {
  const text = String(authors || '').trim();
  if (!text) return '不明';

  const names = text.split(',').map(function (name) { return name.trim(); })
    .filter(function (name) { return name !== ''; });

  if (names.length === 0) return '不明';
  if (names.length <= 2) return names.join(', ');
  return names[0] + ' et al.（最終著者: ' + names[names.length - 1] + '）';
}

/**
 * 文字列を指定の長さで切り詰めます。
 * @param {string} text
 * @param {number} maxLength
 * @return {string}
 */
function truncateText(text, maxLength) {
  const value = String(text || '').trim();
  if (!maxLength || value.length <= maxLength) return value;
  return value.substring(0, maxLength) + '…';
}

/**
 * ヘッダーと論文ブロックを、通知先の文字数上限に収まる複数のメッセージに分割します。
 *
 * 以前の実装は区切り線を取り除いてしまい、
 * 1 件だけで上限を超える論文があると分割できませんでした。
 *
 * @param {string} header
 * @param {!Array<string>} blocks
 * @param {number} maxLength
 * @return {!Array<string>}
 */
function splitIntoMessages(header, blocks, maxLength) {
  const limit = Math.max(1, maxLength - PAGE_LABEL_RESERVE);
  const units = [];
  if (header) units.push(header);
  (blocks || []).forEach(function (block) { units.push(block); });

  const messages = [];
  let current = '';

  units.forEach(function (unit) {
    // 1 単位で上限を超える場合は、そこだけ文字数で強制的に分割します。
    if (unit.length > limit) {
      if (current.trim() !== '') messages.push(current);
      current = '';
      hardSplit_(unit, limit).forEach(function (chunk) { messages.push(chunk); });
      return;
    }

    if (current.length + unit.length > limit) {
      if (current.trim() !== '') messages.push(current);
      current = unit;
      return;
    }

    current += unit;
  });

  if (current.trim() !== '') messages.push(current);
  if (messages.length <= 1) return messages;

  return messages.map(function (message, index) {
    return '(' + (index + 1) + '/' + messages.length + ')\n' + message;
  });
}

/**
 * 上限を超える 1 ブロックを、文字数で強制的に分割します。
 * @param {string} text
 * @param {number} limit
 * @return {!Array<string>}
 */
function hardSplit_(text, limit) {
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += limit) {
    chunks.push(text.substring(offset, offset + limit));
  }
  return chunks;
}

/**
 * 並び替え用に、JIF と 5 年 JIF の大きい方を返します。
 * @param {!Object} paper
 * @return {number}
 */
function highestImpactFactor_(paper) {
  return Math.max(toNumber(paper.impactFactor), toNumber(paper.impactFactor5Years));
}


// ===========================================================================
// Notifier.js
// ===========================================================================
/**
 * 通知の送信（LINE / Slack / メール）。
 *
 * 通知先ごとに 1 メッセージあたりの文字数上限が異なるため、
 * 分割は送信直前に通知先ごとに行います。
 */

/** 通知先ごとの 1 メッセージあたりの文字数上限（余裕を持たせた値）。 */
const CHANNEL_MESSAGE_LIMITS = {
  line: 4500,   // LINE Messaging API のテキストは 5000 文字まで
  slack: 3500,  // Slack の表示上の実用的な上限
  email: 100000,
};

const LINE_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast';

/**
 * 組み立て済みの通知を、設定されたすべての通知先へ送ります。
 *
 * @param {{header: string, blocks: !Array<string>}} parts
 * @param {string} subject メールの件名
 * @param {!Object} config
 */
function sendNotification(parts, subject, config) {
  config.notificationMethods.forEach(function (method) {
    const limit = CHANNEL_MESSAGE_LIMITS[method] || CHANNEL_MESSAGE_LIMITS.email;
    const messages = splitIntoMessages(parts.header, parts.blocks, limit);
    sendMessages_(method, messages, subject, config);
  });
}

/**
 * 1 通のテキストを、設定されたすべての通知先へ送ります。
 * エラー通知や「新着なし」の通知に使います。
 *
 * @param {string} text
 * @param {string} subject メールの件名
 * @param {!Object} config
 */
function sendPlainNotification(text, subject, config) {
  config.notificationMethods.forEach(function (method) {
    const limit = CHANNEL_MESSAGE_LIMITS[method] || CHANNEL_MESSAGE_LIMITS.email;
    sendMessages_(method, splitIntoMessages(text, [], limit), subject, config);
  });
}

/**
 * 指定の通知先へメッセージ群を送ります。
 *
 * @param {string} method
 * @param {!Array<string>} messages
 * @param {string} subject
 * @param {!Object} config
 */
function sendMessages_(method, messages, subject, config) {
  if (messages.length === 0) return;

  if (method === 'email') {
    sendEmail_(messages.join('\n'), subject);
    return;
  }

  let sentCount = 0;
  for (let i = 0; i < messages.length; i++) {
    if (!canSendNotification(method, config)) {
      logInfo(method + ' の 1 日あたりの通知上限に達したため、残り ' +
        (messages.length - i) + ' 通の送信を取りやめました');
      break;
    }

    const succeeded = method === 'line'
      ? sendLineMessage_(messages[i])
      : sendSlackMessage_(messages[i]);

    if (!succeeded) break;

    // 送信できた分だけを記録します。
    recordNotification(method, 1);
    sentCount++;
  }

  if (sentCount > 0) logInfo(method + ' へ ' + sentCount + ' 通を送信しました');
}

/**
 * LINE へ 1 通送信します。
 * @param {string} text
 * @return {boolean} 送信できたかどうか
 */
function sendLineMessage_(text) {
  try {
    const response = fetchWithRetry(LINE_BROADCAST_URL, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: { Authorization: 'Bearer ' + requireSecret('LINE_CHANNEL_ACCESS_TOKEN') },
      payload: JSON.stringify({
        messages: [{ type: 'text', text: String(text) }],
        notificationDisabled: false,
      }),
    });

    if (isSuccessResponse(response)) return true;

    logError('LINE への送信に失敗しました (HTTP ' + response.getResponseCode() + '): ' +
      truncateForLog_(response.getContentText()));
    return false;
  } catch (e) {
    logError('LINE への送信でエラーが発生しました', e);
    return false;
  }
}

/**
 * Slack へ 1 通送信します。
 * @param {string} text
 * @return {boolean} 送信できたかどうか
 */
function sendSlackMessage_(text) {
  try {
    const webhookUrl = requireSecret('SLACK_WEBHOOK_URL');
    if (!isValidSlackWebhookUrl(webhookUrl)) {
      logError('SLACK_WEBHOOK_URL が Slack の Webhook URL の形式ではありません');
      return false;
    }

    const response = fetchWithRetry(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: formatForSlack(text) }),
    });

    if (isSuccessResponse(response)) return true;

    logError('Slack への送信に失敗しました (HTTP ' + response.getResponseCode() + '): ' +
      truncateForLog_(response.getContentText()));
    return false;
  } catch (e) {
    logError('Slack への送信でエラーが発生しました', e);
    return false;
  }
}

/**
 * メールを送信します。
 * @param {string} body
 * @param {string} subject
 */
function sendEmail_(body, subject) {
  try {
    MailApp.sendEmail({
      to: requireSecret('NOTIFICATION_EMAIL'),
      subject: subject,
      body: body,
    });
    logInfo('メールを送信しました');
  } catch (e) {
    logError('メールの送信でエラーが発生しました', e);
  }
}

/**
 * Slack の Incoming Webhook URL の形式かどうかを判定します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} url
 * @return {boolean}
 */
function isValidSlackWebhookUrl(url) {
  return /^https:\/\/hooks\.slack\.com\/services\/.+/.test(String(url || '').trim());
}

/**
 * テキストを Slack の mrkdwn 用に整えます。
 *
 * Slack は &, <, > を制御文字として解釈するため、要旨に含まれていても
 * 表示が壊れないようエスケープします。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} text
 * @return {string}
 */
function formatForSlack(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 見出し行を太字にします。
  return escaped.replace(/^(■ .+)$/gm, '*$1*');
}


// ===========================================================================
// PubMed.js
// ===========================================================================
/**
 * PubMed（NCBI E-utilities）からの論文取得。
 *
 * esearch で PMID を取得し、efetch でまとめて書誌情報と要旨を取得します。
 * 以前は論文 1 件ごとに efetch を呼んでいましたが、
 * 1 回のリクエストで最大 PUBMED_FETCH_BATCH_SIZE 件をまとめて取得します。
 */

const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/** 1 回の efetch でまとめて取得する PMID の件数。 */
const PUBMED_FETCH_BATCH_SIZE = 200;

/**
 * NCBI のレート制限に合わせたリクエスト間隔（ミリ秒）。
 * API キーなしは 3 リクエスト/秒、API キーありは 10 リクエスト/秒が上限です。
 */
function pubMedRequestDelayMs_() {
  return getSecret('NCBI_API_KEY') ? 110 : 350;
}

/**
 * E-utilities のリクエストに共通で付けるパラメータ。
 * NCBI は tool と email の指定を推奨しています。
 * @return {!Object<string, string>}
 */
function pubMedCommonParams_() {
  const params = { tool: 'NewArticleAlertWithGAS' };
  const email = getSecret('NCBI_TOOL_EMAIL');
  if (email) params.email = email;
  const apiKey = getSecret('NCBI_API_KEY');
  if (apiKey) params.api_key = apiKey;
  return params;
}

/**
 * クエリ文字列を組み立てます。
 * @param {!Object<string, (string|number)>} params
 * @return {string}
 */
function buildQueryString(params) {
  return Object.keys(params)
    .filter(function (key) { return params[key] !== '' && params[key] !== null && params[key] !== undefined; })
    .map(function (key) { return key + '=' + encodeURIComponent(params[key]); })
    .join('&');
}

/**
 * 指定キーワードで PubMed を検索し、論文の配列を返します。
 *
 * @param {string} keyword
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>} 論文オブジェクトの配列
 */
function searchPubMed(keyword, config, now) {
  const range = resolveSearchRange(config, now);
  const startDateStr = formatDateForApi(range.startDate, '/');
  const endDateStr = formatDateForApi(range.endDate, '/');

  const searchParams = pubMedCommonParams_();
  searchParams.db = 'pubmed';
  searchParams.term = keyword;
  searchParams.retmax = config.maxResultsPerKeyword;
  searchParams.retmode = 'json';
  searchParams.sort = 'date';
  searchParams.datetype = config.pubmedDateType;
  searchParams.mindate = startDateStr;
  searchParams.maxdate = endDateStr;

  const searchUrl = PUBMED_BASE_URL + '/esearch.fcgi?' + buildQueryString(searchParams);
  logInfo('PubMed 検索: "' + keyword + '" ' + startDateStr + ' 〜 ' + endDateStr +
    '（日付種別: ' + config.pubmedDateType + '）');

  const response = fetchWithRetry(searchUrl);
  if (!isSuccessResponse(response)) {
    logError('PubMed の検索に失敗しました (HTTP ' + response.getResponseCode() + ')');
    return [];
  }

  let pmids;
  try {
    const result = JSON.parse(response.getContentText());
    pmids = (result.esearchresult && result.esearchresult.idlist) || [];
  } catch (e) {
    logError('PubMed の検索結果を解析できませんでした', e);
    return [];
  }

  if (pmids.length === 0) return [];
  logInfo('PubMed: "' + keyword + '" で ' + pmids.length + ' 件の PMID を取得しました');

  return fetchPubMedArticles(pmids);
}

/**
 * PMID の配列から書誌情報と要旨をまとめて取得します。
 * @param {!Array<string>} pmids
 * @return {!Array<!Object>}
 */
function fetchPubMedArticles(pmids) {
  const papers = [];

  for (let offset = 0; offset < pmids.length; offset += PUBMED_FETCH_BATCH_SIZE) {
    const batch = pmids.slice(offset, offset + PUBMED_FETCH_BATCH_SIZE);

    const params = pubMedCommonParams_();
    params.db = 'pubmed';
    params.id = batch.join(',');
    params.retmode = 'xml';

    const url = PUBMED_BASE_URL + '/efetch.fcgi?' + buildQueryString(params);

    if (offset > 0) Utilities.sleep(pubMedRequestDelayMs_());

    try {
      const response = fetchWithRetry(url);
      if (!isSuccessResponse(response)) {
        logError('PubMed の詳細取得に失敗しました (HTTP ' + response.getResponseCode() + ')');
        continue;
      }
      parsePubMedXml(response.getContentText()).forEach(function (paper) {
        papers.push(paper);
      });
    } catch (e) {
      logError('PubMed の詳細取得でエラーが発生しました', e);
    }
  }

  return papers;
}

/**
 * efetch が返す XML を論文オブジェクトの配列に変換します。
 * @param {string} xmlText
 * @return {!Array<!Object>}
 */
function parsePubMedXml(xmlText) {
  const papers = [];
  let root;

  try {
    root = XmlService.parse(xmlText).getRootElement();
  } catch (e) {
    logError('PubMed の XML を解析できませんでした', e);
    return papers;
  }

  root.getChildren('PubmedArticle').forEach(function (articleElement) {
    try {
      const paper = parsePubMedArticleElement_(articleElement);
      if (paper) papers.push(paper);
    } catch (e) {
      logError('PubMed の論文情報を解析できませんでした', e);
    }
  });

  return papers;
}

/**
 * PubmedArticle 要素 1 件を論文オブジェクトに変換します。
 * @param {!Object} articleElement
 * @return {?Object}
 */
function parsePubMedArticleElement_(articleElement) {
  const citation = articleElement.getChild('MedlineCitation');
  if (!citation) return null;

  const pmid = citation.getChildText('PMID');
  if (!pmid) return null;

  const article = citation.getChild('Article');
  if (!article) return null;

  const journalElement = article.getChild('Journal');
  let journal = '';
  if (journalElement) {
    journal = journalElement.getChildText('Title') ||
      journalElement.getChildText('ISOAbbreviation') || '';
  }

  return {
    title: elementValue_(article.getChild('ArticleTitle')),
    url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/',
    authors: parsePubMedAuthors_(article.getChild('AuthorList')),
    journal: journal,
    abstract: parsePubMedAbstract_(article.getChild('Abstract')),
    category: PAPER_CATEGORY_PUBMED,
  };
}

/**
 * AuthorList 要素を "Smith AB, Jones CD" 形式の文字列にします。
 * @param {?Object} authorListElement
 * @return {string}
 */
function parsePubMedAuthors_(authorListElement) {
  if (!authorListElement) return '';

  const names = authorListElement.getChildren('Author').map(function (author) {
    const collectiveName = author.getChildText('CollectiveName');
    if (collectiveName) return collectiveName;

    const lastName = author.getChildText('LastName') || '';
    const initials = author.getChildText('Initials') || '';
    if (lastName && initials) return lastName + ' ' + initials;
    return lastName || author.getChildText('ForeName') || '';
  });

  return names.filter(function (name) { return name !== ''; }).join(', ');
}

/**
 * Abstract 要素を 1 つの文字列にまとめます。
 * 構造化要旨（Label 付き）にも対応します。
 * @param {?Object} abstractElement
 * @return {string}
 */
function parsePubMedAbstract_(abstractElement) {
  if (!abstractElement) return '';

  const sections = abstractElement.getChildren('AbstractText').map(function (part) {
    const text = elementValue_(part);
    const labelAttribute = part.getAttribute('Label');
    const label = labelAttribute ? labelAttribute.getValue() : '';
    return label ? label + ': ' + text : text;
  });

  return sections.filter(function (section) { return section !== ''; }).join('\n').trim();
}

/**
 * 要素の文字列表現を返します。子要素（<i> や <sup> など）の中身も含めます。
 * @param {?Object} element
 * @return {string}
 */
function elementValue_(element) {
  if (!element) return '';
  return String(element.getValue() || '').trim();
}


// ===========================================================================
// Setup.js
// ===========================================================================
/**
 * 初期設定と動作確認のための関数。
 * いずれも GAS のエディタから手動で実行します。
 */

/** 定期実行トリガーで呼び出す関数名。 */
const TRIGGER_FUNCTION_NAME = 'runDailySearch';

/**
 * スプレッドシートに必要なシートとヘッダー行を用意します。
 * 既存のデータは消しません。
 */
function initializeSpreadsheets() {
  getOrCreateSheet(SHEET_NAME_PUBMED, PUBMED_COLUMNS);
  getOrCreateSheet(SHEET_NAME_BIORXIV, BIORXIV_COLUMNS);
  getOrCreateSheet(SHEET_NAME_USAGE, USAGE_COLUMNS);
  logInfo('シートを準備しました: ' + [SHEET_NAME_PUBMED, SHEET_NAME_BIORXIV, SHEET_NAME_USAGE].join(', '));
}

/**
 * 毎日 1 回実行するトリガーを作成します。
 * 同じ関数のトリガーがすでにある場合は作り直します。
 *
 * @param {number=} hour 実行する時刻（0〜23）。省略時は 9 時。
 */
function createDailyTrigger(hour) {
  const targetHour = typeof hour === 'number' ? hour : 9;

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === TRIGGER_FUNCTION_NAME) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(TRIGGER_FUNCTION_NAME)
    .timeBased()
    .atHour(targetHour)
    .everyDays(1)
    .inTimezone(TIMEZONE)
    .create();

  logInfo('毎日 ' + targetHour + ' 時台に ' + TRIGGER_FUNCTION_NAME + ' を実行するトリガーを作成しました');
}

/** 定期実行トリガーを削除します。 */
function deleteDailyTrigger() {
  let deleted = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === TRIGGER_FUNCTION_NAME) {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
    }
  });
  logInfo('トリガーを ' + deleted + ' 件削除しました');
}

/**
 * 実際には送信せずに、通知メッセージの内容だけをログに出力します。
 * 設定した書式を確認したいときに使います。
 */
function previewNotification() {
  const config = getConfig();
  const samplePapers = [
    {
      title: 'A sample PubMed article about the Golgi apparatus',
      authors: 'Yamada T, Suzuki H, Tanaka K, Sato M',
      abstract: 'This is a sample abstract used for previewing the notification format.',
      summarizedAbstract: 'A short English summary of the sample article.',
      japaneseAbstract: 'これは通知の書式を確認するためのサンプル要約です。',
      journal: 'Journal of Cell Biology',
      impactFactor: 7.4,
      impactFactor5Years: 8.1,
      matchedJournal: 'JOURNAL OF CELL BIOLOGY',
      url: 'https://pubmed.ncbi.nlm.nih.gov/00000000/',
      category: PAPER_CATEGORY_PUBMED,
    },
    {
      title: 'A sample preprint about microtubule dynamics',
      authors: 'Smith J, Brown A',
      abstract: 'This is a sample preprint abstract.',
      summarizedAbstract: '',
      japaneseAbstract: 'これはサンプルのプレプリント要約です。',
      journal: 'bioRxiv',
      url: 'https://doi.org/10.1101/0000000',
      category: PAPER_CATEGORY_BIORXIV,
    },
  ];

  const keyword = config.searchKeywords[0] || 'サンプル';
  const parts = buildNotificationParts(keyword, samplePapers, config, todayString());
  if (!parts) {
    logInfo('プレビューする内容がありません');
    return;
  }

  config.notificationMethods.forEach(function (method) {
    const limit = CHANNEL_MESSAGE_LIMITS[method] || CHANNEL_MESSAGE_LIMITS.email;
    const messages = splitIntoMessages(parts.header, parts.blocks, limit);
    logInfo('=== ' + method + ' に送られる内容（' + messages.length + ' 通）===');
    messages.forEach(function (message) {
      logInfo(method === 'slack' ? formatForSlack(message) : message);
    });
  });
}

/**
 * 設定した通知先へテストメッセージを 1 通送ります。
 * 通知の疎通確認に使います。
 */
function sendTestNotification() {
  const config = getConfig();
  const validation = validateConfiguration();
  if (validation.errors.length > 0) {
    validation.errors.forEach(function (message) { logError(message); });
    return;
  }

  try {
    sendPlainNotification(
      'NewArticleAlertWithGAS のテスト通知です（' + SCRIPT_VERSION + '）',
      'テスト通知',
      config
    );
  } finally {
    flushPendingUsage();
  }
}


// ===========================================================================
// SpreadsheetStore.js
// ===========================================================================
/**
 * スプレッドシートへの記録と読み出し。
 *
 * 行の組み立ては列名をキーにしたオブジェクトで行うため、
 * 既存シートの列順が違っていても、列が増えても壊れません。
 */

const SHEET_NAME_PUBMED = 'PubMed';
const SHEET_NAME_BIORXIV = 'BioRxiv';
const SHEET_NAME_USAGE = 'Usage_Tracker';

const PUBMED_COLUMNS = [
  'SearchDate', 'NotifyDate', 'NotifyStatus', 'MatchedKeywords', 'Title', 'Authors',
  'Abstract', 'SummarizedAbstract', 'JapaneseAbstract', 'Journal', 'ImpactFactor',
  'ImpactFactor(5years)', 'MatchedJournal', 'URL', 'Category', 'ScriptVersion',
];

const BIORXIV_COLUMNS = [
  'SearchDate', 'NotifyDate', 'NotifyStatus', 'MatchedKeywords', 'Title', 'Authors',
  'Abstract', 'SummarizedAbstract', 'JapaneseAbstract', 'Journal', 'URL',
  'Category', 'ScriptVersion',
];

const USAGE_COLUMNS = [
  'Date', 'Gemini_API_Requests', 'GAS_Triggers',
  'LINE_Notifications', 'Slack_Notifications', 'Last_Update',
];

/** 通知状態（NotifyStatus 列）。 */
const NOTIFY_STATUS_NOTIFIED = 'notified';
const NOTIFY_STATUS_SKIPPED_LOW_IF = 'skipped_low_impact_factor';

/** 1 回の実行中だけ有効なスプレッドシートのキャッシュ。 */
let __spreadsheetCache = null;

/**
 * 記録先のスプレッドシートを返します。
 * @return {!Object} Spreadsheet
 */
function getSpreadsheet() {
  if (!__spreadsheetCache) {
    __spreadsheetCache = SpreadsheetApp.openById(requireSecret('SPREADSHEET_ID'));
  }
  return __spreadsheetCache;
}

/**
 * シートを取得し、存在しなければ作成します。
 * ヘッダー行が無い場合や列が不足している場合は追加します。
 *
 * @param {string} sheetName
 * @param {!Array<string>} columns 必要な列名
 * @return {!Object} Sheet
 */
function getOrCreateSheet(sheetName, columns) {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const headers = readHeaders(sheet);
  const missing = columns.filter(function (column) { return headers.indexOf(column) < 0; });
  if (missing.length > 0) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

/**
 * ヘッダー行を読み出します。
 * @param {!Object} sheet
 * @return {!Array<string>}
 */
function readHeaders(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (value) {
    return String(value);
  });
}

/**
 * 列名をキーにしたオブジェクトを、ヘッダーの順に並んだ配列に変換します。
 * ヘッダーに無いキーは無視され、値が無い列は空文字列になります。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Object} record
 * @param {!Array<string>} headers
 * @return {!Array<*>}
 */
function recordToRow(record, headers) {
  return headers.map(function (header) {
    const value = record[header];
    return value === undefined || value === null ? '' : value;
  });
}

/**
 * 複数のレコードをまとめて追記します。
 * 1 行ずつ appendRow するより大幅に高速です。
 *
 * @param {string} sheetName
 * @param {!Array<!Object>} records 列名をキーにしたオブジェクトの配列
 * @param {!Array<string>} columns
 */
function appendRecords(sheetName, records, columns) {
  if (!records || records.length === 0) return;

  const sheet = getOrCreateSheet(sheetName, columns);
  const headers = readHeaders(sheet);
  const rows = records.map(function (record) { return recordToRow(record, headers); });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

/**
 * 記録済みのすべての論文 URL を返します。
 * @return {!Object<string, boolean>} URL をキーにした集合
 */
function getExistingPaperUrls() {
  const urls = {};

  [SHEET_NAME_PUBMED, SHEET_NAME_BIORXIV].forEach(function (sheetName) {
    const sheet = getSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;

    const headers = readHeaders(sheet);
    const urlIndex = headers.indexOf('URL');
    if (urlIndex < 0) return;

    const values = sheet.getRange(2, urlIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    values.forEach(function (row) {
      const url = String(row[0] || '').trim();
      if (url) urls[url] = true;
    });
  });

  return urls;
}

/**
 * 未通知の論文をシートから読み出します。
 *
 * @param {string} sheetName
 * @return {!Array<!Object>} rowNumber を含む論文オブジェクトの配列
 */
function readUnnotifiedPapers(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const headers = readHeaders(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const papers = [];

  values.forEach(function (row, index) {
    const record = {};
    headers.forEach(function (header, columnIndex) {
      record[header] = row[columnIndex];
    });

    if (String(record['NotifyDate'] || '').trim() !== '') return;
    if (String(record['NotifyStatus'] || '').trim() !== '') return;

    papers.push({
      rowNumber: index + 2,
      sheetName: sheetName,
      title: String(record['Title'] || ''),
      authors: String(record['Authors'] || ''),
      abstract: String(record['Abstract'] || ''),
      summarizedAbstract: String(record['SummarizedAbstract'] || ''),
      japaneseAbstract: String(record['JapaneseAbstract'] || ''),
      journal: String(record['Journal'] || ''),
      impactFactor: toNumber(record['ImpactFactor']),
      impactFactor5Years: toNumber(record['ImpactFactor(5years)']),
      matchedJournal: String(record['MatchedJournal'] || ''),
      matchedKeywords: parseMatchedKeywords(record['MatchedKeywords']),
      url: String(record['URL'] || ''),
      category: String(record['Category'] || ''),
    });
  });

  return papers;
}

/**
 * 論文行の通知状態を更新します。
 *
 * @param {string} sheetName
 * @param {!Array<{rowNumber: number, status: string}>} updates
 */
function markPapersNotified(sheetName, updates) {
  if (!updates || updates.length === 0) return;

  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return;

  const headers = readHeaders(sheet);
  const notifyDateColumn = headers.indexOf('NotifyDate') + 1;
  const notifyStatusColumn = headers.indexOf('NotifyStatus') + 1;
  if (notifyDateColumn === 0 || notifyStatusColumn === 0) return;

  const timestamp = formatDateTimeForSheet(new Date());
  updates.forEach(function (update) {
    sheet.getRange(update.rowNumber, notifyDateColumn).setValue(timestamp);
    sheet.getRange(update.rowNumber, notifyStatusColumn).setValue(update.status);
  });
}

/**
 * MatchedKeywords 列の値をキーワードの配列に変換します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {*} value
 * @return {!Array<string>}
 */
function parseMatchedKeywords(value) {
  return String(value === null || value === undefined ? '' : value)
    .split(';')
    .map(function (keyword) { return keyword.trim(); })
    .filter(function (keyword) { return keyword !== ''; });
}

/**
 * キーワードの配列を MatchedKeywords 列の値に変換します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Array<string>} keywords
 * @return {string}
 */
function formatMatchedKeywords(keywords) {
  return (keywords || []).join('; ');
}

/**
 * 値を数値に変換します。数値にならない場合は 0 を返します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {*} value
 * @return {number}
 */
function toNumber(value) {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const parsed = parseFloat(String(value === null || value === undefined ? '' : value).trim());
  return isNaN(parsed) ? 0 : parsed;
}


// ===========================================================================
// UsageTracker.js
// ===========================================================================
/**
 * API とトリガーの使用量管理。
 *
 * 以前は Gemini の呼び出しが 2 箇所で加算され、実際の 2 倍の回数が
 * 記録されていました。加算はこのファイルの recordGeminiRequest() に一本化し、
 * 実行の最後に flushPendingUsage() でまとめてシートへ書き込みます。
 */

/** 1 回の実行中に発生した、まだシートへ書き込んでいない使用量。 */
let __pendingUsage = { gemini: 0, triggers: 0, line: 0, slack: 0 };

/** 1 回の実行中だけ有効な当日の使用量キャッシュ。 */
let __usageCache = null;

/**
 * 指定日の使用量を返します。
 * @param {string} dateStr 'YYYY-MM-DD'
 * @return {{rowNumber: number, gemini: number, triggers: number, line: number, slack: number}}
 */
function getUsageRecord(dateStr) {
  const sheet = getOrCreateSheet(SHEET_NAME_USAGE, USAGE_COLUMNS);
  const empty = { rowNumber: 0, gemini: 0, triggers: 0, line: 0, slack: 0 };
  if (sheet.getLastRow() < 2) return empty;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, USAGE_COLUMNS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (formatUsageDate_(values[i][0]) === dateStr) {
      return {
        rowNumber: i + 2,
        gemini: toNumber(values[i][1]),
        triggers: toNumber(values[i][2]),
        line: toNumber(values[i][3]),
        slack: toNumber(values[i][4]),
      };
    }
  }
  return empty;
}

/**
 * 当日の使用量を返します（実行中はキャッシュします）。
 * 未書き込みの使用量も足し合わせた実効値を返します。
 * @return {{gemini: number, triggers: number, line: number, slack: number}}
 */
function getTodayUsage() {
  if (!__usageCache) {
    __usageCache = getUsageRecord(todayString());
  }
  return {
    gemini: __usageCache.gemini + __pendingUsage.gemini,
    triggers: __usageCache.triggers + __pendingUsage.triggers,
    line: __usageCache.line + __pendingUsage.line,
    slack: __usageCache.slack + __pendingUsage.slack,
  };
}

/**
 * 日付セルの値を 'YYYY-MM-DD' に揃えます。
 * スプレッドシートは文字列と日付値のどちらでも保持しうるため両方に対応します。
 * @param {*} value
 * @return {string}
 */
function formatUsageDate_(value) {
  if (value instanceof Date) return todayString(value);
  return String(value || '').trim();
}

/** Gemini API の呼び出しを 1 回分記録します。 */
function recordGeminiRequest() {
  __pendingUsage.gemini++;
}

/** GAS トリガーの実行を 1 回分記録します。 */
function recordGasTrigger() {
  __pendingUsage.triggers++;
}

/**
 * 通知の送信を記録します。
 * @param {string} method 'line' または 'slack'
 * @param {number} count 送信したメッセージ数
 */
function recordNotification(method, count) {
  if (method === 'line') __pendingUsage.line += count;
  if (method === 'slack') __pendingUsage.slack += count;
}

/**
 * 未書き込みの使用量をスプレッドシートへ反映します。
 * 実行の最後に必ず呼びます。
 */
function flushPendingUsage() {
  const pending = __pendingUsage;
  if (pending.gemini === 0 && pending.triggers === 0 && pending.line === 0 && pending.slack === 0) {
    return;
  }
  __pendingUsage = { gemini: 0, triggers: 0, line: 0, slack: 0 };

  const dateStr = todayString();
  const sheet = getOrCreateSheet(SHEET_NAME_USAGE, USAGE_COLUMNS);
  const existing = getUsageRecord(dateStr);

  if (existing.rowNumber === 0) {
    sheet.appendRow([
      dateStr, pending.gemini, pending.triggers, pending.line, pending.slack, new Date(),
    ]);
  } else {
    sheet.getRange(existing.rowNumber, 2, 1, 4).setValues([[
      existing.gemini + pending.gemini,
      existing.triggers + pending.triggers,
      existing.line + pending.line,
      existing.slack + pending.slack,
    ]]);
    sheet.getRange(existing.rowNumber, 6).setValue(new Date());
  }

  // 反映済みの値を実行中キャッシュにも取り込みます。
  if (__usageCache) {
    __usageCache.gemini += pending.gemini;
    __usageCache.triggers += pending.triggers;
    __usageCache.line += pending.line;
    __usageCache.slack += pending.slack;
    __usageCache.rowNumber = existing.rowNumber || __usageCache.rowNumber;
  }
}

/**
 * Gemini API を呼び出せる残量があるかを判定します。
 * @param {!Object} config
 * @return {boolean}
 */
function canUseGeminiApi(config) {
  return getTodayUsage().gemini < config.maxGeminiRequestsPerDay;
}

/**
 * 指定の通知先へまだ送信できるかを判定します。
 * @param {string} method 'line' または 'slack'
 * @param {!Object} config
 * @return {boolean}
 */
function canSendNotification(method, config) {
  const usage = getTodayUsage();
  if (method === 'line') return usage.line < config.maxLineNotificationsPerDay;
  if (method === 'slack') return usage.slack < config.maxSlackNotificationsPerDay;
  return true;
}
