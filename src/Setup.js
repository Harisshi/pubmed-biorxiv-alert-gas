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
