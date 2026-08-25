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
