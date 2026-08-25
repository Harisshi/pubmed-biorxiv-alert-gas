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
