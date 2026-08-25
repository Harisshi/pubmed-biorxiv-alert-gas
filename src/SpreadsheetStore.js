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
