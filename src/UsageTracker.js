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
